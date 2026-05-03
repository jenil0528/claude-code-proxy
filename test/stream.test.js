// ============================================================================
// BlitzProxy — Unit Tests: Stream Translation
// Run with: node test/stream.test.js
// ============================================================================

import assert from 'node:assert/strict';
import { translateStream } from '../src/stream-translator.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fake ServerResponse that captures written data.
 */
function makeRes() {
  const writes = [];
  return {
    writes,
    write(data) { writes.push(data); },
    end() { writes.push(null); },
    events() {
      return writes
        .filter(w => w !== null)
        .join('')
        .split('\n\n')
        .filter(Boolean)
        .map(block => {
          const lines = block.split('\n');
          const eventLine = lines.find(l => l.startsWith('event: '));
          const dataLine = lines.find(l => l.startsWith('data: '));
          return {
            event: eventLine?.slice(7),
            data: dataLine ? JSON.parse(dataLine.slice(6)) : null,
          };
        });
    },
  };
}

/**
 * Build a fake ReadableStream from an array of SSE data lines.
 */
function makeStream(lines) {
  const encoder = new TextEncoder();
  const chunks = lines.map(l => encoder.encode(l + '\n'));
  let i = 0;
  return {
    getReader() {
      return {
        read() {
          if (i >= chunks.length) return Promise.resolve({ done: true });
          return Promise.resolve({ done: false, value: chunks[i++] });
        },
      };
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log('\ntranslateStream — text response');

await testAsync('simple text produces correct SSE event sequence', async () => {
  const res = makeRes();
  const stream = makeStream([
    'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}',
    'data: [DONE]',
  ]);

  await translateStream(stream, res, new Map(), 'test-model');
  const events = res.events();

  const types = events.map(e => e.event);
  assert.ok(types.includes('message_start'), 'missing message_start');
  assert.ok(types.includes('ping'), 'missing ping');
  assert.ok(types.includes('content_block_start'), 'missing content_block_start');
  assert.ok(types.includes('content_block_delta'), 'missing content_block_delta');
  assert.ok(types.includes('content_block_stop'), 'missing content_block_stop');
  assert.ok(types.includes('message_delta'), 'missing message_delta');
  assert.ok(types.includes('message_stop'), 'missing message_stop');

  // Check stop_reason is end_turn
  const msgDelta = events.find(e => e.event === 'message_delta');
  assert.equal(msgDelta.data.delta.stop_reason, 'end_turn');

  // Check text content
  const textDeltas = events.filter(e => e.event === 'content_block_delta');
  const text = textDeltas.map(e => e.data.delta.text).join('');
  assert.equal(text, 'Hello world');
});

console.log('\ntranslateStream — single tool call');

await testAsync('single tool call produces correct blocks', async () => {
  const res = makeRes();
  const stream = makeStream([
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_A","function":{"name":"get_data","arguments":""}}]},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"x\\":"}}]},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    'data: [DONE]',
  ]);

  await translateStream(stream, res, new Map(), 'test-model');
  const events = res.events();

  const blockStarts = events.filter(e => e.event === 'content_block_start');
  const blockStops = events.filter(e => e.event === 'content_block_stop');

  assert.equal(blockStarts.length, 1, 'expected 1 content_block_start');
  assert.equal(blockStops.length, 1, 'expected 1 content_block_stop');
  assert.equal(blockStarts[0].data.content_block.type, 'tool_use');
  assert.equal(blockStarts[0].data.content_block.name, 'get_data');
  assert.ok(blockStarts[0].data.content_block.id.startsWith('toolu_'));

  const msgDelta = events.find(e => e.event === 'message_delta');
  assert.equal(msgDelta.data.delta.stop_reason, 'tool_use');

  // Verify arguments were streamed
  const argDeltas = events.filter(e =>
    e.event === 'content_block_delta' && e.data.delta.type === 'input_json_delta'
  );
  const fullArgs = argDeltas.map(e => e.data.delta.partial_json).join('');
  assert.equal(fullArgs, '{"x":1}');
});

console.log('\ntranslateStream — multiple tool calls');

await testAsync('two tool calls each get their own block_start/stop pair', async () => {
  const res = makeRes();
  const stream = makeStream([
    // Tool call 0 starts
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_A","function":{"name":"fn_a","arguments":""}}]},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\":1}"}}]},"finish_reason":null}]}',
    // Tool call 1 starts
    'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_B","function":{"name":"fn_b","arguments":""}}]},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{\\"b\\":2}"}}]},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    'data: [DONE]',
  ]);

  await translateStream(stream, res, new Map(), 'test-model');
  const events = res.events();

  const blockStarts = events.filter(e => e.event === 'content_block_start');
  const blockStops = events.filter(e => e.event === 'content_block_stop');

  assert.equal(blockStarts.length, 2, `expected 2 block starts, got ${blockStarts.length}`);
  assert.equal(blockStops.length, 2, `expected 2 block stops, got ${blockStops.length}`);

  const names = blockStarts.map(e => e.data.content_block.name);
  assert.ok(names.includes('fn_a'), 'fn_a block missing');
  assert.ok(names.includes('fn_b'), 'fn_b block missing');

  // Block indices should be different
  const indices = blockStarts.map(e => e.data.index);
  assert.notEqual(indices[0], indices[1], 'block indices should differ');

  // Each stop event matches a start event
  const startIndices = new Set(blockStarts.map(e => e.data.index));
  for (const stop of blockStops) {
    assert.ok(startIndices.has(stop.data.index), `stop event for unknown index ${stop.data.index}`);
  }

  const msgDelta = events.find(e => e.event === 'message_delta');
  assert.equal(msgDelta.data.delta.stop_reason, 'tool_use');
});

await testAsync('first chunk with arguments immediately sends input_json_delta', async () => {
  const res = makeRes();
  // Provider sends name+arguments together in the very first chunk
  const stream = makeStream([
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_X","function":{"name":"fn","arguments":"{\\"k\\":1}"}}]},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    'data: [DONE]',
  ]);

  await translateStream(stream, res, new Map(), 'test-model');
  const events = res.events();

  const argDeltas = events.filter(e =>
    e.event === 'content_block_delta' && e.data.delta.type === 'input_json_delta'
  );
  assert.ok(argDeltas.length > 0, 'expected at least one input_json_delta');
  const fullArgs = argDeltas.map(e => e.data.delta.partial_json).join('');
  assert.equal(fullArgs, '{"k":1}');
});

console.log('\ntranslateStream — no double close');

await testAsync('no duplicate content_block_stop events', async () => {
  const res = makeRes();
  const stream = makeStream([
    'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    'data: [DONE]',
  ]);

  await translateStream(stream, res, new Map(), 'test-model');
  const events = res.events();

  const stops = events.filter(e => e.event === 'content_block_stop');
  assert.equal(stops.length, 1, `expected exactly 1 content_block_stop, got ${stops.length}`);
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
