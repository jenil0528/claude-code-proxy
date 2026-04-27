// ============================================================================
// BlitzProxy — Retry Logic
// Exponential backoff with jitter for rate-limited requests
// ============================================================================

import * as log from './logger.js';

/**
 * Execute an async function with exponential backoff retry
 * @param {Function} fn - Async function to execute
 * @param {Object} opts - Options
 * @param {number} opts.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} opts.baseDelay - Base delay in ms (default: 1000)
 * @param {number[]} opts.retryOn - HTTP status codes to retry on (default: [429, 500, 502, 503, 504])
 * @returns {Promise<Response>}
 */
export async function withRetry(fn, opts = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
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
          log.warn(`[Retry] Status ${result.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        }
      }

      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = calculateDelay(attempt, baseDelay);
        log.warn(`[Retry] Error: ${err.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
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
        return Math.min(retryMs, 60000); // Cap at 60s
      }
    }
  }

  // Exponential backoff with jitter
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay;
  return Math.min(exponential + jitter, 30000); // Cap at 30s
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
