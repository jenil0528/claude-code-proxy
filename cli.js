#!/usr/bin/env node
// ============================================================================
// BlitzProxy — CLI Tool
// All management from terminal: add, keys, switch, rm, model, provider, test
// ============================================================================

import { loadConfig, getConfig, saveConfig, addApiKey, removeApiKey, setActiveKey, getApiKeys } from './src/config.js';
import { getProvider, PROVIDERS, detectOllamaModels } from './src/providers.js';

const C = {
  r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m',
  red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m',
  blu: '\x1b[36m', mag: '\x1b[35m',
};

const PROVIDER_ICONS_CLI = {
  nvidia: '🟢', groq: '⚡', openrouter: '🔀', together: '🤝',
  deepseek: '🔮', github: '🐙', cerebras: '🧠', ollama: '🦙',
  huggingface: '🤗', custom: '🔧',
};

loadConfig();

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'add':       cmdAdd(args); break;
  case 'keys':
  case 'list':      cmdKeys(); break;
  case 'switch':
  case 'use':       cmdSwitch(args); break;
  case 'rm':
  case 'remove':
  case 'delete':    cmdRemove(args); break;
  case 'model':     cmdModel(args); break;
  case 'provider':
  case 'providers': cmdProvider(args); break;
  case 'test':      cmdTest(); break;
  case 'status':    cmdStatus(); break;
  case 'help':
  case '--help':
  case '-h':        cmdHelp(); break;
  default:          cmdHelp(); break;
}

// ─── Add Key ─────────────────────────────────────────────────────────────────

function cmdAdd(args) {
  const key = args[0];
  const name = args.slice(1).join(' ');

  if (!key) {
    console.log(`${C.red}✕ Usage: blitz add <api-key> [name]${C.r}`);
    console.log(`${C.d}  Example: blitz add nvapi-abc123 "My NVIDIA Key"${C.r}`);
    process.exit(1);
  }

  try {
    const entry = addApiKey({ key, name: name || undefined });
    const provider = getProvider(entry.provider);
    console.log(`${C.grn}⚡ Added & activated: ${C.b}${entry.name}${C.r}`);
    console.log(`${C.d}   Provider: ${entry.providerName}  •  Timeout: ${provider.timeout / 1000}s${C.r}`);
  } catch (err) {
    console.error(`${C.red}✕ ${err.message}${C.r}`);
    process.exit(1);
  }
}

// ─── List Keys ───────────────────────────────────────────────────────────────

function cmdKeys() {
  const keys = getApiKeys();

  if (keys.length === 0) {
    console.log(`${C.yel}No API keys saved.${C.r}`);
    console.log(`${C.d}Add one: blitz add <api-key> [name]${C.r}`);
    return;
  }

  console.log(`\n${C.b}  # │ Provider        │ Name                │ Key${C.r}`);
  console.log(`${C.d}  ──┼─────────────────┼─────────────────────┼──────────────${C.r}`);

  keys.forEach((k, i) => {
    const num = String(i + 1).padStart(2);
    const active = k.isActive ? `${C.grn}● ` : `${C.d}  `;
    const provider = (k.providerName || k.provider).padEnd(15).slice(0, 15);
    const name = k.name.padEnd(19).slice(0, 19);
    console.log(`${active}${num}${C.r} │ ${provider} │ ${name} │ ${C.d}${k.key}${C.r}`);
  });

  const cfg = getConfig();
  const prov = getProvider(cfg.provider);
  console.log(`\n${C.d}  Active: ${C.grn}${prov.name}${C.r}${C.d} • timeout ${cfg.timeout / 1000}s • model ${cfg.model || prov.defaultModel}${C.r}\n`);
}

// ─── Switch Key ──────────────────────────────────────────────────────────────

function cmdSwitch(args) {
  const keys = getApiKeys();

  if (keys.length === 0) {
    console.log(`${C.yel}No keys saved. Add one: blitz add <key>${C.r}`);
    process.exit(1);
  }

  const input = args[0];

  if (!input) {
    console.log(`\n${C.b}Choose a key:${C.r}\n`);
    keys.forEach((k, i) => {
      const active = k.isActive ? `${C.grn}● ` : '  ';
      console.log(`${active}${i + 1}) ${k.name} ${C.d}(${k.providerName})${C.r}`);
    });
    console.log(`\n${C.d}Usage: blitz switch <number or name>${C.r}\n`);
    return;
  }

  const idx = parseInt(input, 10) - 1;
  let target;

  if (!isNaN(idx) && idx >= 0 && idx < keys.length) {
    target = keys[idx];
  } else {
    target = keys.find(k => k.name.toLowerCase().includes(input.toLowerCase())
                          || k.provider.toLowerCase().includes(input.toLowerCase()));
  }

  if (!target) {
    console.log(`${C.red}✕ Key not found: ${input}${C.r}`);
    console.log(`${C.d}  Run "blitz keys" to see available keys${C.r}`);
    process.exit(1);
  }

  setActiveKey(target.id);
  const prov = getProvider(target.provider);
  console.log(`${C.grn}⚡ Switched to: ${C.b}${target.name}${C.r}`);
  console.log(`${C.d}   Provider: ${target.providerName}  •  Timeout: ${prov.timeout / 1000}s${C.r}`);
}

// ─── Remove Key ──────────────────────────────────────────────────────────────

function cmdRemove(args) {
  const keys = getApiKeys();
  const input = args[0];

  if (!input) {
    console.log(`${C.red}✕ Usage: blitz rm <number or name>${C.r}`);
    process.exit(1);
  }

  const idx = parseInt(input, 10) - 1;
  let target;

  if (!isNaN(idx) && idx >= 0 && idx < keys.length) {
    target = keys[idx];
  } else {
    target = keys.find(k => k.name.toLowerCase().includes(input.toLowerCase()));
  }

  if (!target) {
    console.log(`${C.red}✕ Key not found: ${input}${C.r}`);
    process.exit(1);
  }

  removeApiKey(target.id);
  console.log(`${C.grn}✓ Deleted: ${target.name}${C.r}`);

  const remaining = getApiKeys();
  if (remaining.length > 0) {
    const active = remaining.find(k => k.isActive);
    if (active) console.log(`${C.d}  Active key: ${active.name}${C.r}`);
  } else {
    console.log(`${C.yel}  No keys remaining. Add one: blitz add <key>${C.r}`);
  }
}

// ─── Model ───────────────────────────────────────────────────────────────────

function cmdModel(args) {
  const cfg = getConfig();
  const provider = getProvider(cfg.provider);

  if (args.length === 0) {
    // List available models
    console.log(`\n${C.b}Models for ${provider.name}:${C.r}\n`);
    if (provider.models && provider.models.length > 0) {
      provider.models.forEach((m, i) => {
        const active = m === (cfg.model || provider.defaultModel);
        const marker = active ? `${C.grn}● ` : '  ';
        console.log(`${marker}${i + 1}) ${m}${C.r}`);
      });
      console.log(`\n${C.d}Set model: blitz model <number or name>${C.r}\n`);
    } else {
      console.log(`${C.d}  No predefined models. Set one manually:${C.r}`);
      console.log(`${C.d}  blitz model <model-name>${C.r}\n`);
    }
    return;
  }

  const input = args.join(' ');
  let newModel;

  // Try matching by number
  const idx = parseInt(input, 10) - 1;
  if (!isNaN(idx) && provider.models && idx >= 0 && idx < provider.models.length) {
    newModel = provider.models[idx];
  } else {
    // Try matching by name substring
    if (provider.models) {
      const match = provider.models.find(m => m.toLowerCase().includes(input.toLowerCase()));
      if (match) {
        newModel = match;
      }
    }
    // Fallback: use exact input
    if (!newModel) newModel = input;
  }

  saveConfig({ model: newModel });
  console.log(`${C.grn}✓ Model set: ${C.b}${newModel}${C.r}`);
}

// ─── Provider ────────────────────────────────────────────────────────────────

function cmdProvider(args) {
  if (args.length === 0) {
    // List all providers
    console.log(`\n${C.b}Available Providers:${C.r}\n`);
    const cfg = getConfig();
    for (const [key, p] of Object.entries(PROVIDERS)) {
      const active = key === cfg.provider;
      const marker = active ? `${C.grn}● ` : '  ';
      const timeout = `${p.timeout / 1000}s`;
      console.log(`${marker}${(PROVIDER_ICONS_CLI[key] || '  ')} ${p.name.padEnd(16)}${C.d} timeout=${timeout.padEnd(5)} ${p.description}${C.r}`);
    }
    console.log(`\n${C.d}Set provider: blitz provider <name>${C.r}\n`);
    return;
  }

  const input = args[0].toLowerCase();
  const match = Object.entries(PROVIDERS).find(([k, p]) =>
    k === input || p.name.toLowerCase().includes(input)
  );

  if (!match) {
    console.log(`${C.red}✕ Unknown provider: ${input}${C.r}`);
    console.log(`${C.d}  Run "blitz provider" to see all options${C.r}`);
    process.exit(1);
  }

  const [key, prov] = match;
  saveConfig({ provider: key, model: prov.defaultModel });
  console.log(`${C.grn}✓ Provider: ${C.b}${prov.name}${C.r}`);
  console.log(`${C.d}   Model:   ${prov.defaultModel}  •  Timeout: ${prov.timeout / 1000}s${C.r}`);
}



// ─── Test Connection ─────────────────────────────────────────────────────────

async function cmdTest() {
  const cfg = getConfig();
  const provider = getProvider(cfg.provider);
  const baseUrl = cfg.customBaseUrl || provider.baseUrl;

  console.log(`\n${C.d}Testing ${provider.name} at ${baseUrl}...${C.r}`);

  const headers = { 'Content-Type': 'application/json', ...provider.headers };
  if (cfg.apiKey && cfg.provider !== 'ollama') {
    headers['Authorization'] = `Bearer ${cfg.apiKey}`;
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model || provider.defaultModel,
        messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
        max_tokens: 5,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`${C.red}✕ Provider returned ${res.status}: ${err.slice(0, 200)}${C.r}`);
      process.exit(1);
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message?.content || 'OK';
    console.log(`${C.grn}✓ Connected! ${C.r}${C.d}Response: "${msg.trim()}"${C.r}\n`);
  } catch (err) {
    console.log(`${C.red}✕ ${err.message}${C.r}`);
    process.exit(1);
  }
}

// ─── Status ──────────────────────────────────────────────────────────────────

function cmdStatus() {
  const cfg = getConfig();
  const provider = getProvider(cfg.provider);

  console.log(`\n${C.b}⚡ BlitzProxy Status${C.r}\n`);
  console.log(`  Provider:  ${C.grn}${provider.name}${C.r}`);
  console.log(`  Model:     ${C.blu}${cfg.model || provider.defaultModel}${C.r}`);
  console.log(`  Timeout:   ${C.yel}${cfg.timeout / 1000}s${C.r}`);
  console.log(`  Proxy:     http://localhost:${cfg.proxyPort}`);

  const keys = getApiKeys();
  console.log(`  Keys:      ${keys.length} saved\n`);
}

// ─── Help ────────────────────────────────────────────────────────────────────

function cmdHelp() {
  console.log(`
${C.b}⚡ BlitzProxy CLI${C.r}

${C.b}START:${C.r}
  blitz                  Start proxy + launch Claude Code

${C.b}API KEYS:${C.r}
  blitz add <key> [name] Add API key (provider auto-detected)
  blitz keys             List all saved keys
  blitz switch <n>       Switch to key #n (or by name)
  blitz rm <n>           Delete key #n (or by name)

${C.b}CONFIG:${C.r}
  blitz model            List available models
  blitz model <name>     Set model
  blitz provider         List providers & timeouts
  blitz provider <name>  Switch provider
  blitz test             Test connection to provider
  blitz status           Show current config

${C.b}EXAMPLES:${C.r}
  ${C.d}blitz add nvapi-abc123 "My NVIDIA"${C.r}
  ${C.d}blitz switch 2${C.r}
  ${C.d}blitz switch groq${C.r}
  ${C.d}blitz model deepseek-r1${C.r}
  ${C.d}blitz provider groq${C.r}
  ${C.d}blitz rm 1${C.r}
  `);
}
