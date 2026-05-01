// ============================================================================
// BlitzProxy — Streaming SSE Translator
// Converts OpenAI streaming chunks → Anthropic SSE event sequence
// Optimized for low-latency proxying with minimal allocations
// ============================================================================

import * as log from './logger.js';
import { randomUUID } from 'crypto';

// Shared decoder — avoid creating a new one per stream
const sharedDecoder = new TextDecoder();

/**
 * Process an OpenAI streaming response and write Anthropic-formatted SSE events.
 *
 * @param {ReadableStream} openaiStream - The raw response body from the OpenAI provider
 * @param {import('http').ServerResponse} res - The HTTP response to write Anthropic SSE to
 * @param {Map} toolIdMap - Tool ID map from request translation
 * @param {string} requestModel - The model name from the original request
 */
export async function translateStream(openaiStream, res, toolIdMap, requestModel) {
  const state = {
    messageId: 'msg_' + randomUUID().replace(/-/g, '').slice(0, 24),
    contentBlocks: [],    // Track content blocks we've started
    currentBlockIndex: -1,
    currentBlockType: null,
    toolCallBuffers: {},  // index -> { id, name, arguments }
    textBuffer: '',
    inputTokens: 0,
    outputTokens: 0,
    sentStart: false,
    sentStop: false,
    stopReason: 'end_turn',
  };

  // Send initial message_start event
  sendMessageStart(res, state, requestModel);

  try {
    const reader = openaiStream.getReader
      ? openaiStream.getReader()
      : null;

    if (reader) {
      // Web Streams API (fetch response.body)
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += sharedDecoder.decode(value, { stream: true });

        // Fast path: process all complete lines in batch
        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          processSSELine(line, res, state, toolIdMap, requestModel);
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        processSSELine(buffer, res, state, toolIdMap, requestModel);
      }
    } else {
      // Node.js Readable stream fallback
      let buffer = '';

      for await (const chunk of openaiStream) {
        const text = typeof chunk === 'string' ? chunk : sharedDecoder.decode(chunk, { stream: true });
        buffer += text;

        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          processSSELine(line, res, state, toolIdMap, requestModel);
        }
      }

      if (buffer.trim()) {
        processSSELine(buffer, res, state, toolIdMap, requestModel);
      }
    }
  } catch (err) {
    log.error('[Stream] Error processing stream:', err.message);
  }

  // Finalize: close any open content blocks + send message_stop
  finalizeStream(res, state, requestModel);
}

// ─── SSE Line Processing ─────────────────────────────────────────────────────

function processSSELine(line, res, state, toolIdMap, requestModel) {
  // Fast reject — avoid .trim() allocation on empty lines
  if (line.length === 0 || line === '\r') return;

  const trimmed = line.charAt(0) === ' ' ? line.trim() : line;
  if (!trimmed || trimmed.charCodeAt(0) === 58) return; // 58 = ':'

  // Fast check for data: prefix (avoid startsWith overhead in hot path)
  if (trimmed.length < 7 || trimmed.charCodeAt(0) !== 100 || trimmed.charCodeAt(5) !== 32) return; // 'd' and ' '
  if (trimmed === 'data: [DONE]') return;

  const jsonStr = trimmed.slice(6); // Remove 'data: '
  let chunk;

  try {
    chunk = JSON.parse(jsonStr);
  } catch {
    // Only log in debug mode to avoid overhead
    if (log.isDebug()) log.debug('[Stream] Skipping unparseable chunk:', jsonStr.slice(0, 200));
    return;
  }

  // Handle usage stats (some providers send this in the last chunk)
  if (chunk.usage) {
    state.inputTokens = chunk.usage.prompt_tokens || chunk.usage.input_tokens || state.inputTokens;
    state.outputTokens = chunk.usage.completion_tokens || chunk.usage.output_tokens || state.outputTokens;
  }

  const choice = chunk.choices?.[0];
  if (!choice) return;

  const delta = choice.delta;
  if (!delta) return;

  // Handle finish_reason
  if (choice.finish_reason) {
    if (choice.finish_reason === 'tool_calls') {
      state.stopReason = 'tool_use';
    } else if (choice.finish_reason === 'length') {
      state.stopReason = 'max_tokens';
    } else if (choice.finish_reason === 'stop') {
      state.stopReason = 'end_turn';
    }
  }

  // ── Text Content Delta ──
  if (delta.content !== undefined && delta.content !== null) {
    // Start a text block if we haven't yet (or if we were in a tool block)
    if (state.currentBlockType !== 'text') {
      // Close previous block if any
      closeCurrentBlock(res, state);
      // Start new text block
      state.currentBlockIndex++;
      state.currentBlockType = 'text';
      sendEvent(res, 'content_block_start', {
        type: 'content_block_start',
        index: state.currentBlockIndex,
        content_block: { type: 'text', text: '' },
      });
    }

    // Send text delta
    if (delta.content) {
      sendEvent(res, 'content_block_delta', {
        type: 'content_block_delta',
        index: state.currentBlockIndex,
        delta: { type: 'text_delta', text: delta.content },
      });
      state.textBuffer += delta.content;
    }
  }

  // ── Tool Call Deltas ──
  if (delta.tool_calls && delta.tool_calls.length > 0) {
    for (const tc of delta.tool_calls) {
      const tcIndex = tc.index ?? 0;

      if (!state.toolCallBuffers[tcIndex]) {
        // New tool call starting
        // Close any open text block first
        if (state.currentBlockType === 'text') {
          closeCurrentBlock(res, state);
        }

        state.currentBlockIndex++;
        state.currentBlockType = 'tool_use';
        state.stopReason = 'tool_use';

        const anthropicId = generateToolId();
        const openaiId = tc.id || `call_${tcIndex}`;

        // Map IDs
        toolIdMap.set(openaiId, anthropicId);
        toolIdMap.set(anthropicId, openaiId);

        state.toolCallBuffers[tcIndex] = {
          blockIndex: state.currentBlockIndex,
          anthropicId,
          openaiId,
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || '',
        };

        // Send content_block_start for tool_use
        sendEvent(res, 'content_block_start', {
          type: 'content_block_start',
          index: state.currentBlockIndex,
          content_block: {
            type: 'tool_use',
            id: anthropicId,
            name: tc.function?.name || '',
            input: {},
          },
        });
      } else {
        // Continuation of existing tool call
        const buf = state.toolCallBuffers[tcIndex];
        if (tc.function?.name) buf.name = tc.function.name;
        if (tc.function?.arguments) {
          buf.arguments += tc.function.arguments;

          // Send input_json_delta
          sendEvent(res, 'content_block_delta', {
            type: 'content_block_delta',
            index: buf.blockIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: tc.function.arguments,
            },
          });
        }
      }
    }
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function closeCurrentBlock(res, state) {
  if (state.currentBlockIndex >= 0 && state.currentBlockType) {
    sendEvent(res, 'content_block_stop', {
      type: 'content_block_stop',
      index: state.currentBlockIndex,
    });
  }
}

function finalizeStream(res, state, requestModel) {
  // Close any open blocks
  closeCurrentBlock(res, state);

  // Close any tool call blocks that haven't been closed
  for (const tcIndex of Object.keys(state.toolCallBuffers)) {
    const buf = state.toolCallBuffers[tcIndex];
    // Tool blocks might already be closed by closeCurrentBlock if it was the last one
    // Send a stop for each unique block index we haven't stopped
    // (closeCurrentBlock only closes the current one)
  }

  // If we had tool calls, set stop_reason
  if (Object.keys(state.toolCallBuffers).length > 0) {
    state.stopReason = 'tool_use';
  }

  // Send message_delta with stop_reason
  sendEvent(res, 'message_delta', {
    type: 'message_delta',
    delta: { stop_reason: state.stopReason, stop_sequence: null },
    usage: { output_tokens: state.outputTokens || 1 },
  });

  // Send message_stop
  sendEvent(res, 'message_stop', { type: 'message_stop' });

  // End the response
  res.end();

  log.proxy('out', `Stream complete — ${state.currentBlockIndex + 1} blocks, stop: ${state.stopReason}`);
}

function sendMessageStart(res, state, requestModel) {
  state.sentStart = true;
  sendEvent(res, 'message_start', {
    type: 'message_start',
    message: {
      id: state.messageId,
      type: 'message',
      role: 'assistant',
      model: requestModel || 'blitz-proxy',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  });

  // Send ping event (Claude Code expects periodic pings)
  sendEvent(res, 'ping', { type: 'ping' });
}

function sendEvent(res, eventType, data) {
  try {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    log.debug('[Stream] Failed to write event:', err.message);
  }
}

function generateToolId() {
  return 'toolu_' + randomUUID().replace(/-/g, '').slice(0, 24);
}
