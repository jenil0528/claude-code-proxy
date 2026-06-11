// ============================================================================
// BlitzProxy — Retry Logic
// Exponential backoff with jitter for rate-limited requests
// Smart error classification: skip retries on permanent/unrecoverable errors
// ============================================================================

import * as log from './logger.js';

// Errors that should NOT be retried (permanent failures)
const PERMANENT_ERRORS = [
  'ECONNREFUSED',       // Server not running — retrying won't help
  'ERR_INVALID_URL',    // Bad URL config
  'ENOTFOUND',          // DNS resolution failed
  'CERT_',              // TLS cert errors
];

/**
 * Classify whether an error is transient (worth retrying) or permanent
 */
function isTransientError(err) {
  if (!err) return false;
  const msg = (err.message || '') + (err.code || '');
  for (const pattern of PERMANENT_ERRORS) {
    if (msg.includes(pattern)) return false;
  }
  // Timeout errors are transient
  if (err.name === 'TimeoutError' || msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    return true;
  }
  // Network errors are generally transient
  if (msg.includes('ECONNRESET') || msg.includes('EPIPE') || msg.includes('fetch failed')) {
    return true;
  }
  return true; // Default: assume transient
}

/**
 * Execute an async function with exponential backoff retry
 * @param {Function} fn - Async function to execute
 * @param {Object} opts - Options
 * @param {number} opts.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} opts.baseDelay - Base delay in ms (default: 500)
 * @param {number[]} opts.retryOn - HTTP status codes to retry on (default: [429, 500, 502, 503, 504])
 * @returns {Promise<Response>}
 */
export async function withRetry(fn, opts = {}) {
  const {
    maxRetries = 3,
    baseDelay = 500,
    retryOn = [429, 500, 502, 503, 504],
  } = opts;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();

      // If it's a Response object, check status
      if (result && typeof result.status === 'number') {
        if (retryOn.includes(result.status) && attempt < maxRetries) {
          const delay = calculateDelay(attempt, baseDelay, result);
          // Drain the response body before retrying so the connection can be reused
          try { await result.text(); } catch { /* ignore drain errors */ }
          log.warn(`[Retry] Status ${result.status}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        }
      }

      return result;
    } catch (err) {
      lastError = err;

      // Don't retry permanent errors — fail fast
      if (!isTransientError(err)) {
        log.error(`[Retry] Permanent error (no retry): ${err.message}`);
        throw err;
      }

      if (attempt < maxRetries) {
        const delay = calculateDelay(attempt, baseDelay);
        log.warn(`[Retry] Error: ${err.message}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

/**
 * Calculate delay with exponential backoff + jitter
 * Respects Retry-After header if present
 */
function calculateDelay(attempt, baseDelay, response) {
  // Check for Retry-After header
  if (response?.headers) {
    const retryAfter = response.headers.get?.('retry-after') || response.headers['retry-after'];
    if (retryAfter) {
      const retryMs = parseInt(retryAfter, 10) * 1000;
      if (!isNaN(retryMs) && retryMs > 0) {
        return Math.min(retryMs, 30000); // Cap at 30s
      }
    }
  }

  // Exponential backoff with jitter: 500ms → 1s → 2s → 4s (capped at 15s)
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay * 0.5;
  return Math.min(exponential + jitter, 15000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
