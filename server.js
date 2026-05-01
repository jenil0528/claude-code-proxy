// ============================================================================
// BlitzProxy — Main Server (Proxy Only)
// Author: Jenil <jenil8736@gmail.com>
// Universal Claude Code Proxy — zero UI, all terminal
// ============================================================================

import { createServer } from 'http';
import { appendFileSync, statSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, getConfig, getEffectiveBaseUrl, getEffectiveHeaders, getEffectiveModel } from './src/config.js';
import { getProvider } from './src/providers.js';
import { translateRequest, translateResponse } from './src/translator.js';
import { translateStream } from './src/stream-translator.js';
import { withRetry } from './src/retry.js';
import { fetchWithPool, destroyAgents } from './src/connection.js';
import * as log from './src/logger.js';

// ─── File-based request logging (blitz.log) ─────────────────────────────────

const __dirname_server = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname_server, 'blitz.log');
const LOG_FILE_OLD = join(__dirname_server, 'blitz.log.old');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

// Throttled log rotation — check at most once every 60s instead of every write
let lastRotateCheck = 0;
const ROTATE_CHECK_INTERVAL = 60000;

function rotateLogIfNeeded() {
  const now = Date.now();
  if (now - lastRotateCheck < ROTATE_CHECK_INTERVAL) return;
  lastRotateCheck = now;

  try {
    const stats = statSync(LOG_FILE);
    if (stats.size >= MAX_LOG_SIZE) {
      renameSync(LOG_FILE, LOG_FILE_OLD);
    }
  } catch {
    // File doesn't exist yet — that's fine
  }
}

function logTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function appendLog(line) {
  rotateLogIfNeeded();
  try {
    appendFileSync(LOG_FILE, line + '\n', 'utf-8');
  } catch {
    // Best-effort logging — don't crash the server
  }
}

// Load config
const config = loadConfig();
log.setLogLevel(config.logLevel);

// ─── Pre-compute immutable request context ──────────────────────────────────
// Cache values that don't change between requests to avoid repeated lookups

let cachedHeaders = null;
let cachedBaseUrl = null;
let cachedModel = null;
let cachedTimeout = null;
let cachedMaxRetries = null;
let cachedRetryBaseDelay = null;

function refreshRequestContext() {
  const cfg = getConfig();
  cachedHeaders = getEffectiveHeaders();
  cachedBaseUrl = getEffectiveBaseUrl();
  cachedModel = getEffectiveModel();
  cachedTimeout = cfg.timeout;
  cachedMaxRetries = cfg.maxRetries;
  cachedRetryBaseDelay = cfg.retryBaseDelay;
}

// Initial cache fill
refreshRequestContext();

// Refresh cache periodically (picks up config changes from CLI)
setInterval(refreshRequestContext, 5000);

// ─── Proxy Server (Anthropic API) ────────────────────────────────────────────

const proxyServer = createServer(async (req, res) => {
  // CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Fast path extraction — avoid URL constructor overhead for known routes
  const path = req.url.split('?')[0];

  try {
    // Health check
    if (path === '/health' || path === '/') {
      const cfg = getConfig();
      const provider = getProvider(cfg.provider);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        proxy: 'BlitzProxy',
        version: '1.1.0',
        provider: provider.name,
        model: cachedModel,
        baseUrl: cachedBaseUrl,
        timeout: cfg.timeout,
      }));
      return;
    }

    // Anthropic Messages API endpoint
    if (path === '/v1/messages' && req.method === 'POST') {
      await handleMessages(req, res, path);
      return;
    }

    // Claude Code also hits this endpoint to check models
    if (path === '/v1/models' && req.method === 'GET') {
      handleModels(req, res);
      return;
    }

    // Token counting endpoint (Claude Code may call this)
    if (path === '/v1/messages/count_tokens' && req.method === 'POST') {
      await handleCountTokens(req, res);
      return;
    }

    // Unknown endpoint
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'not_found', message: `Unknown endpoint: ${path}` } }));

  } catch (err) {
    log.error('[Proxy] Unhandled error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    try {
      res.end(JSON.stringify({
        type: 'error',
        error: { type: 'server_error', message: err.message },
      }));
    } catch {
      // Response may already be destroyed
      res.end();
    }
  }
});

// Increase server connection limits
proxyServer.maxConnections = 100;
proxyServer.keepAliveTimeout = 65000;
proxyServer.headersTimeout = 66000;

// ─── Messages Handler ────────────────────────────────────────────────────────

async function handleMessages(req, res, path) {
  const reqStart = Date.now();
  const body = await readBody(req);
  let anthropicReq;

  try {
    anthropicReq = JSON.parse(body);
  } catch {
    appendLog(`[${logTimestamp()}] ERROR 400 invalid_request_error`);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: { type: 'invalid_request_error', message: 'Invalid JSON in request body' },
    }));
    return;
  }

  const isStream = anthropicReq.stream === true;

  log.proxy('in', `model=${anthropicReq.model || 'default'} stream=${isStream} msgs=${anthropicReq.messages?.length || 0} tools=${anthropicReq.tools?.length || 0}`);

  const { body: openaiBody, toolIdMap } = translateRequest(anthropicReq, cachedModel);

  const fetchUrl = `${cachedBaseUrl}/chat/completions`;

  // Determine timeouts: short connect timeout, long read timeout for streaming
  const connectTimeout = 15000; // 15s to establish connection
  const readTimeout = isStream ? cachedTimeout : Math.min(cachedTimeout, 120000);

  log.debug('[Proxy] Forwarding to:', fetchUrl);

  try {
    const response = await withRetry(
      () => fetchWithPool(fetchUrl, {
        method: 'POST',
        headers: cachedHeaders,
        body: JSON.stringify(openaiBody),
      }, {
        connect: connectTimeout,
        read: readTimeout,
      }),
      {
        maxRetries: cachedMaxRetries,
        baseDelay: cachedRetryBaseDelay,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const errType = response.status === 429 ? 'rate_limit_exceeded' : 'api_error';
      appendLog(`[${logTimestamp()}] ERROR ${response.status} ${errType}`);
      log.error(`[Proxy] Provider returned ${response.status}:`, errorText.slice(0, 500));

      const status = response.status === 429 ? 429 : response.status >= 500 ? 529 : 400;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        type: 'error',
        error: {
          type: response.status === 429 ? 'rate_limit_error' : 'api_error',
          message: `Provider error (${response.status}): ${errorText.slice(0, 300)}`,
        },
      }));
      return;
    }

    if (isStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      await translateStream(response.body, res, toolIdMap, anthropicReq.model || cachedModel);
      const dur = Date.now() - reqStart;
      appendLog(`[${logTimestamp()}] POST ${path} → 200 OK (${dur}ms) ${cachedModel} [stream]`);
    } else {
      const openaiRes = await response.json();
      const anthropicRes = translateResponse(openaiRes, toolIdMap, anthropicReq.model || cachedModel);

      const dur = Date.now() - reqStart;
      appendLog(`[${logTimestamp()}] POST ${path} → 200 OK (${dur}ms) ${cachedModel}`);
      log.proxy('out', `stop=${anthropicRes.stop_reason} blocks=${anthropicRes.content.length} tokens=${anthropicRes.usage.output_tokens}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(anthropicRes));
    }
  } catch (err) {
    const dur = Date.now() - reqStart;
    appendLog(`[${logTimestamp()}] ERROR 502 ${err.message.slice(0, 80)} (${dur}ms)`);
    log.error(`[Proxy] Fetch error (${dur}ms):`, err.message);

    // Provide actionable error messages
    let userMessage = `Failed to reach provider: ${err.message}`;
    if (err.message.includes('ECONNREFUSED')) {
      userMessage = `Provider unreachable (connection refused). Is the server running at ${cachedBaseUrl}?`;
    } else if (err.message.includes('ENOTFOUND')) {
      userMessage = `DNS resolution failed for provider URL. Check your network and CUSTOM_BASE_URL.`;
    } else if (err.message.includes('timeout')) {
      userMessage = `Request timed out after ${dur}ms. The provider may be overloaded.`;
    }

    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    try {
      res.end(JSON.stringify({
        type: 'error',
        error: {
          type: 'api_error',
          message: userMessage,
        },
      }));
    } catch {
      res.end();
    }
  }
}

// ─── Models Handler ──────────────────────────────────────────────────────────

// Pre-serialized response — this never changes, no need to rebuild each time
const MODELS_RESPONSE = JSON.stringify({
  data: [
    { id: 'claude-sonnet-4-20250514', object: 'model' },
    { id: 'claude-3-5-sonnet-20241022', object: 'model' },
    { id: 'claude-3-haiku-20240307', object: 'model' },
    { id: 'claude-3-opus-20240229', object: 'model' },
  ],
});

function handleModels(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(MODELS_RESPONSE);
}

// ─── Token Count Handler ─────────────────────────────────────────────────────

async function handleCountTokens(req, res) {
  const body = await readBody(req);
  let reqBody;
  try {
    reqBody = JSON.parse(body);
  } catch {
    reqBody = {};
  }

  // Fast estimation — avoid full JSON.stringify just to count chars
  const msgLen = reqBody.messages ? JSON.stringify(reqBody.messages).length : 0;
  const sysLen = reqBody.system ? (typeof reqBody.system === 'string' ? reqBody.system.length : JSON.stringify(reqBody.system).length) : 0;
  const toolLen = reqBody.tools ? JSON.stringify(reqBody.tools).length : 0;
  const totalChars = msgLen + sysLen + toolLen;
  const estimatedTokens = Math.ceil(totalChars / 4);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    input_tokens: estimatedTokens,
  }));
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Read request body using buffer array (avoids O(n²) string concatenation)
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLen = 0;
    req.on('data', chunk => {
      chunks.push(chunk);
      totalLen += chunk.length;
    });
    req.on('end', () => {
      // Single Buffer.concat + toString is much faster than string +=
      if (chunks.length === 1) {
        resolve(chunks[0].toString('utf-8'));
      } else if (chunks.length === 0) {
        resolve('');
      } else {
        resolve(Buffer.concat(chunks, totalLen).toString('utf-8'));
      }
    });
    req.on('error', reject);
  });
}

// ─── Start Server ────────────────────────────────────────────────────────────

proxyServer.listen(config.proxyPort, () => {
  const provider = getProvider(config.provider);
  const detectLabel = config.autoDetected ? ' (auto-detected ✨)' : '';

  log.banner([
    `${'\x1b[1m'}⚡ BlitzProxy v1.1.0${'\x1b[0m'}  —  Universal Claude Code Proxy`,
    '',
    `  Proxy:     ${'\x1b[33m'}http://localhost:${config.proxyPort}${'\x1b[0m'}`,
    `  Provider:  ${'\x1b[32m'}${provider.name}${detectLabel}${'\x1b[0m'}`,
    `  Model:     ${'\x1b[32m'}${getEffectiveModel()}${'\x1b[0m'}`,
    `  Timeout:   ${'\x1b[33m'}${config.timeout / 1000}s${'\x1b[0m'}`,
    `  Base URL:  ${'\x1b[36m'}${getEffectiveBaseUrl()}${'\x1b[0m'}`,
    '',
    `  ${'\x1b[2m'}Keep-alive: enabled  •  Connection pooling: enabled${'\x1b[0m'}`,
    `  ${'\x1b[2m'}Manage keys: blitz keys | blitz add <key> | blitz switch <n>${'\x1b[0m'}`,
  ]);
});

// Graceful shutdown
process.on('SIGINT', () => {
  log.info('Shutting down...');
  destroyAgents();
  proxyServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  destroyAgents();
  proxyServer.close();
  process.exit(0);
});
