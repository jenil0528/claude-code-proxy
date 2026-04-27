// ============================================================================
// BlitzProxy — Main Server (Proxy Only)
// Author: Jenil <jenil8736@gmail.com>
// Universal Claude Code Proxy — zero UI, all terminal
// ============================================================================

import { createServer } from 'http';
import { loadConfig, getConfig, getEffectiveBaseUrl, getEffectiveHeaders, getEffectiveModel } from './src/config.js';
import { getProvider } from './src/providers.js';
import { translateRequest, translateResponse } from './src/translator.js';
import { translateStream } from './src/stream-translator.js';
import { withRetry } from './src/retry.js';
import * as log from './src/logger.js';

// Load config
const config = loadConfig();
log.setLogLevel(config.logLevel);

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

  const url = new URL(req.url, `http://localhost:${config.proxyPort}`);
  const path = url.pathname;

  try {
    // Health check
    if (path === '/health' || path === '/') {
      const cfg = getConfig();
      const provider = getProvider(cfg.provider);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        proxy: 'BlitzProxy',
        version: '1.0.0',
        provider: provider.name,
        model: getEffectiveModel(),
        baseUrl: getEffectiveBaseUrl(),
        timeout: cfg.timeout,
      }));
      return;
    }

    // Anthropic Messages API endpoint
    if (path === '/v1/messages' && req.method === 'POST') {
      await handleMessages(req, res);
      return;
    }

    // Claude Code also hits this endpoint to check models
    if (path === '/v1/models' && req.method === 'GET') {
      await handleModels(req, res);
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
    res.end(JSON.stringify({
      type: 'error',
      error: { type: 'server_error', message: err.message },
    }));
  }
});

// ─── Messages Handler ────────────────────────────────────────────────────────

async function handleMessages(req, res) {
  const body = await readBody(req);
  let anthropicReq;

  try {
    anthropicReq = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: { type: 'invalid_request_error', message: 'Invalid JSON in request body' },
    }));
    return;
  }

  const model = getEffectiveModel();
  const baseUrl = getEffectiveBaseUrl();
  const isStream = anthropicReq.stream === true;

  log.proxy('in', `model=${anthropicReq.model || 'default'} stream=${isStream} msgs=${anthropicReq.messages?.length || 0} tools=${anthropicReq.tools?.length || 0}`);

  const { body: openaiBody, toolIdMap } = translateRequest(anthropicReq, model);

  log.debug('[Proxy] Forwarding to:', `${baseUrl}/chat/completions`);

  const headers = getEffectiveHeaders();
  const fetchUrl = `${baseUrl}/chat/completions`;

  try {
    const response = await withRetry(
      () => fetch(fetchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(openaiBody),
        signal: AbortSignal.timeout(getConfig().timeout),
      }),
      {
        maxRetries: getConfig().maxRetries,
        baseDelay: getConfig().retryBaseDelay,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
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

      await translateStream(response.body, res, toolIdMap, anthropicReq.model || model);
    } else {
      const openaiRes = await response.json();
      const anthropicRes = translateResponse(openaiRes, toolIdMap, anthropicReq.model || model);

      log.proxy('out', `stop=${anthropicRes.stop_reason} blocks=${anthropicRes.content.length} tokens=${anthropicRes.usage.output_tokens}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(anthropicRes));
    }
  } catch (err) {
    log.error('[Proxy] Fetch error:', err.message);

    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'api_error',
        message: `Failed to reach provider: ${err.message}`,
      },
    }));
  }
}

// ─── Models Handler ──────────────────────────────────────────────────────────

async function handleModels(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    data: [
      { id: 'claude-sonnet-4-20250514', object: 'model' },
      { id: 'claude-3-5-sonnet-20241022', object: 'model' },
      { id: 'claude-3-haiku-20240307', object: 'model' },
      { id: 'claude-3-opus-20240229', object: 'model' },
    ],
  }));
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

  const messagesStr = JSON.stringify(reqBody.messages || []);
  const systemStr = JSON.stringify(reqBody.system || '');
  const toolsStr = JSON.stringify(reqBody.tools || []);
  const totalChars = messagesStr.length + systemStr.length + toolsStr.length;
  const estimatedTokens = Math.ceil(totalChars / 4);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    input_tokens: estimatedTokens,
  }));
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ─── Start Server ────────────────────────────────────────────────────────────

proxyServer.listen(config.proxyPort, () => {
  const provider = getProvider(config.provider);
  const detectLabel = config.autoDetected ? ' (auto-detected ✨)' : '';

  log.banner([
    `${'\x1b[1m'}⚡ BlitzProxy v1.0.0${'\x1b[0m'}  —  Universal Claude Code Proxy`,
    '',
    `  Proxy:     ${'\x1b[33m'}http://localhost:${config.proxyPort}${'\x1b[0m'}`,
    `  Provider:  ${'\x1b[32m'}${provider.name}${detectLabel}${'\x1b[0m'}`,
    `  Model:     ${'\x1b[32m'}${getEffectiveModel()}${'\x1b[0m'}`,
    `  Timeout:   ${'\x1b[33m'}${config.timeout / 1000}s${'\x1b[0m'}`,
    `  Base URL:  ${'\x1b[36m'}${getEffectiveBaseUrl()}${'\x1b[0m'}`,
    '',
    `  ${'\x1b[2m'}Manage keys: blitz keys | blitz add <key> | blitz switch <n>${'\x1b[0m'}`,
  ]);
});

// Graceful shutdown
process.on('SIGINT', () => {
  log.info('Shutting down...');
  proxyServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  proxyServer.close();
  process.exit(0);
});
