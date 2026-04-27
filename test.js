// ============================================================================
// BlitzProxy — Translation Unit Tests
// Verifies request/response translation correctness
// ============================================================================

import { translateRequest, translateResponse } from './src/translator.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \x1b[31m✕\x1b[0m ${name}`);
    console.log(`    \x1b[31m${err.message}\x1b[0m`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

console.log('\n\x1b[1m⚡ BlitzProxy — Unit Tests\x1b[0m\n');

// ─── Request Translation Tests ───────────────────────────────────────────────

console.log('\x1b[36m▸ Request Translation\x1b[0m');

test('Simple text message', () => {
  const { body } = translateRequest({
    model: 'claude-3-sonnet-20240229',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello!' }],
  }, 'llama-3.3-70b');

  assertEqual(body.model, 'llama-3.3-70b');
  assertEqual(body.max_tokens, 1024);
  assertEqual(body.messages.length, 1);
  assertEqual(body.messages[0].role, 'user');
  assertEqual(body.messages[0].content, 'Hello!');
});

test('System prompt as string', () => {
  const { body } = translateRequest({
    model: 'claude-3-sonnet',
    max_tokens: 1024,
    system: 'You are a helpful assistant.',
    messages: [{ role: 'user', content: 'Hi' }],
  }, 'test-model');

  assertEqual(body.messages[0].role, 'system');
  assertEqual(body.messages[0].content, 'You are a helpful assistant.');
  assertEqual(body.messages[1].role, 'user');
});

test('System prompt as content blocks', () => {
  const { body } = translateRequest({
    model: 'claude-3-sonnet',
    max_tokens: 1024,
    system: [{ type: 'text', text: 'System msg part 1' }, { type: 'text', text: 'System msg part 2' }],
    messages: [{ role: 'user', content: 'Hi' }],
  }, 'test-model');

  assertEqual(body.messages[0].role, 'system');
  assert(body.messages[0].content.includes('System msg part 1'));
  assert(body.messages[0].content.includes('System msg part 2'));
});

test('Content blocks in user message', () => {
  const { body } = translateRequest({
    model: 'claude-3-sonnet',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this:' },
        { type: 'text', text: 'More context here.' },
      ],
    }],
  }, 'test-model');

  assert(body.messages[0].content.includes('Describe this:'));
  assert(body.messages[0].content.includes('More context here.'));
});

test('Tool definitions translation', () => {
  const { body } = translateRequest({
    model: 'claude-3-sonnet',
    max_tokens: 1024,
    tools: [{
      name: 'get_weather',
      description: 'Get weather for a location',
      input_schema: {
        type: 'object',
        properties: { location: { type: 'string' } },
        required: ['location'],
      },
    }],
    messages: [{ role: 'user', content: 'Weather?' }],
  }, 'test-model');

  assert(body.tools, 'Should have tools');
  assertEqual(body.tools.length, 1);
  assertEqual(body.tools[0].type, 'function');
  assertEqual(body.tools[0].function.name, 'get_weather');
  assertEqual(body.tools[0].function.description, 'Get weather for a location');
  assert(body.tools[0].function.parameters.properties.location, 'Should have location param');
});

test('Assistant tool_use → tool_calls', () => {
  const { body, toolIdMap } = translateRequest({
    model: 'claude-3-sonnet',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'Weather?' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check.' },
          {
            type: 'tool_use',
            id: 'toolu_test123',
            name: 'get_weather',
            input: { location: 'NYC' },
          },
        ],
      },
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'toolu_test123',
          content: 'Sunny, 72°F',
        }],
      },
    ],
  }, 'test-model');

  // Assistant message should have tool_calls
  const assistantMsg = body.messages.find(m => m.role === 'assistant');
  assert(assistantMsg, 'Should have assistant message');
  assert(assistantMsg.tool_calls, 'Should have tool_calls');
  assertEqual(assistantMsg.tool_calls.length, 1);
  assertEqual(assistantMsg.tool_calls[0].function.name, 'get_weather');

  // Tool result should be a 'tool' role message
  const toolMsg = body.messages.find(m => m.role === 'tool');
  assert(toolMsg, 'Should have tool message');
  assertEqual(toolMsg.content, 'Sunny, 72°F');

  // ID mapping should exist
  const callId = assistantMsg.tool_calls[0].id;
  assert(toolIdMap.has('toolu_test123'), 'Should map anthropic ID to openai ID');
  assertEqual(toolIdMap.get('toolu_test123'), callId);
});

test('Tool choice translation', () => {
  const { body: body1 } = translateRequest({
    model: 'claude-3-sonnet', max_tokens: 1024,
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: 'Hi' }],
  }, 'test-model');
  assertEqual(body1.tool_choice, 'auto');

  const { body: body2 } = translateRequest({
    model: 'claude-3-sonnet', max_tokens: 1024,
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: 'Hi' }],
  }, 'test-model');
  assertEqual(body2.tool_choice, 'required');

  const { body: body3 } = translateRequest({
    model: 'claude-3-sonnet', max_tokens: 1024,
    tool_choice: { type: 'tool', name: 'get_weather' },
    messages: [{ role: 'user', content: 'Hi' }],
  }, 'test-model');
  assertEqual(body3.tool_choice.type, 'function');
  assertEqual(body3.tool_choice.function.name, 'get_weather');
});

test('Streaming request includes stream_options', () => {
  const { body } = translateRequest({
    model: 'claude-3-sonnet', max_tokens: 1024, stream: true,
    messages: [{ role: 'user', content: 'Hi' }],
  }, 'test-model');

  assertEqual(body.stream, true);
  assert(body.stream_options, 'Should have stream_options');
  assertEqual(body.stream_options.include_usage, true);
});

// ─── Response Translation Tests ──────────────────────────────────────────────

console.log('\n\x1b[36m▸ Response Translation\x1b[0m');

test('Simple text response', () => {
  const toolIdMap = new Map();
  const result = translateResponse({
    choices: [{
      message: { role: 'assistant', content: 'Hello there!' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }, toolIdMap, 'claude-3-sonnet');

  assertEqual(result.type, 'message');
  assertEqual(result.role, 'assistant');
  assertEqual(result.content[0].type, 'text');
  assertEqual(result.content[0].text, 'Hello there!');
  assertEqual(result.stop_reason, 'end_turn');
  assertEqual(result.usage.input_tokens, 10);
  assertEqual(result.usage.output_tokens, 5);
});

test('Tool calls response', () => {
  const toolIdMap = new Map();
  const result = translateResponse({
    choices: [{
      message: {
        role: 'assistant',
        content: 'Checking weather...',
        tool_calls: [{
          id: 'call_abc123',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
        }],
      },
      finish_reason: 'tool_calls',
    }],
    usage: { prompt_tokens: 15, completion_tokens: 20 },
  }, toolIdMap, 'claude-3-sonnet');

  assertEqual(result.stop_reason, 'tool_use');
  assertEqual(result.content.length, 2); // text + tool_use
  assertEqual(result.content[0].type, 'text');
  assertEqual(result.content[1].type, 'tool_use');
  assertEqual(result.content[1].name, 'get_weather');
  assertEqual(result.content[1].input.location, 'NYC');
  assert(result.content[1].id.startsWith('toolu_'), 'Should have Anthropic-style tool ID');
});

test('Max tokens stop reason', () => {
  const result = translateResponse({
    choices: [{
      message: { role: 'assistant', content: 'Truncated...' },
      finish_reason: 'length',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 100 },
  }, new Map(), 'claude-3-sonnet');

  assertEqual(result.stop_reason, 'max_tokens');
});

test('Empty response handling', () => {
  const result = translateResponse({ choices: [] }, new Map(), 'claude-3-sonnet');
  assert(result.content.length > 0, 'Should have at least one content block');
  assertEqual(result.stop_reason, 'end_turn');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
console.log(`  \x1b[1mResults: ${passed} passed, ${failed} failed\x1b[0m`);
console.log(`${'─'.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
