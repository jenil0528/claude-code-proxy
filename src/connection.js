// ============================================================================
// BlitzProxy — Connection Manager
// HTTP Agent pooling, keep-alive, and optimized fetch wrapper
// ============================================================================

import { Agent } from 'http';
import { Agent as HttpsAgent } from 'https';
import * as log from './logger.js';

// ─── Keep-Alive Agents ──────────────────────────────────────────────────────
// Reuse TCP connections instead of opening a new one per request.
// This dramatically reduces latency for sequential API calls.

const httpAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000,
});

const httpsAgent = new HttpsAgent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000,
});

/**
 * Get the appropriate agent for a URL
 */
export function getAgent(url) {
  if (typeof url === 'string') {
    return url.startsWith('https') ? httpsAgent : httpAgent;
  }
  return httpsAgent;
}

/**
 * Optimized fetch with connection reuse and separate connect/read timeouts.
 *
 * @param {string} url
 * @param {Object} options - Standard fetch options
 * @param {Object} timeouts
 * @param {number} timeouts.connect - Connection timeout in ms (default: 10000)
 * @param {number} timeouts.read - Overall read timeout in ms (default: 300000)
 * @returns {Promise<Response>}
 */
export async function fetchWithPool(url, options = {}, timeouts = {}) {
  const {
    connect: connectTimeout = 10000,
    read: readTimeout = 300000,
  } = timeouts;

  // Use the smaller of connect/read for the abort signal
  // The connect timeout catches dead servers fast,
  // the read timeout is handled by the overall AbortSignal
  const controller = new AbortController();
  const signal = controller.signal;

  // Connect timeout — fires fast if server is unreachable
  const connectTimer = setTimeout(() => {
    controller.abort(new Error(`Connection timeout after ${connectTimeout}ms`));
  }, connectTimeout);

  // Read timeout — overall deadline for the full response
  const readTimer = setTimeout(() => {
    controller.abort(new Error(`Read timeout after ${readTimeout}ms`));
  }, readTimeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal,
      // Node.js 18+ undici dispatcher for keepalive is automatic
    });

    // Connection established — clear the connect timer
    clearTimeout(connectTimer);

    return response;
  } catch (err) {
    clearTimeout(connectTimer);
    clearTimeout(readTimer);
    throw err;
  }
}

/**
 * Cleanup on process exit
 */
export function destroyAgents() {
  httpAgent.destroy();
  httpsAgent.destroy();
}
