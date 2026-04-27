// ============================================================================
// BlitzProxy — Configuration Manager
// Handles loading, saving, and runtime config updates
// Auto-detects provider from API key prefix for zero-config setup
// Multi-API-key management: add, switch, delete keys on the fly
// ============================================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getProvider, detectProviderFromKey } from './providers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');
const ENV_PATH = join(__dirname, '..', '.env');
const ENV_EXAMPLE_PATH = join(__dirname, '..', '.env.example');

// ─── Zero-dependency .env loader ─────────────────────────────────────────────
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return false;
  try {
    const envContent = readFileSync(filePath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    return true;
  } catch (e) {
    console.warn('[Config] Failed to load .env file:', e.message);
    return false;
  }
}

// Load .env (create from example if missing)
if (!existsSync(ENV_PATH) && existsSync(ENV_EXAMPLE_PATH)) {
  try {
    writeFileSync(ENV_PATH, readFileSync(ENV_EXAMPLE_PATH, 'utf-8'));
    console.log('[Config] Created .env from .env.example — paste your API key and restart!');
  } catch { /* ignore */ }
}
loadEnvFile(ENV_PATH);

const DEFAULT_CONFIG = {
  provider: '',       // Empty = auto-detect from API key
  apiKey: '',
  model: '',          // Empty = use provider default
  customBaseUrl: '',
  customHeaders: {},
  proxyPort: 4819,
  maxRetries: 3,
  retryBaseDelay: 1000,
  logRequests: true,
  logLevel: 'info',
  timeout: 120000,
  autoDetected: false, // Flag to indicate provider was auto-detected
  savedKeys: [],       // Array of { id, name, key, provider, createdAt }
  activeKeyId: '',     // ID of currently active key
};

let currentConfig = { ...DEFAULT_CONFIG };

/**
 * Load config from file + env overrides + auto-detection
 */
export function loadConfig() {
  // Load from config.json
  if (existsSync(CONFIG_PATH)) {
    try {
      const fileConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      currentConfig = { ...DEFAULT_CONFIG, ...fileConfig };
    } catch (e) {
      console.warn('[Config] Failed to parse config.json, using defaults');
      currentConfig = { ...DEFAULT_CONFIG };
    }
  }

  // Env overrides (highest priority)
  if (process.env.PROVIDER) currentConfig.provider = process.env.PROVIDER.toLowerCase();
  if (process.env.API_KEY) currentConfig.apiKey = process.env.API_KEY;
  if (process.env.MODEL) currentConfig.model = process.env.MODEL;
  if (process.env.PROXY_PORT) currentConfig.proxyPort = parseInt(process.env.PROXY_PORT, 10);
  if (process.env.DASHBOARD_PORT) currentConfig.dashboardPort = parseInt(process.env.DASHBOARD_PORT, 10);
  if (process.env.CUSTOM_BASE_URL) currentConfig.customBaseUrl = process.env.CUSTOM_BASE_URL;
  if (process.env.LOG_LEVEL) currentConfig.logLevel = process.env.LOG_LEVEL;
  if (process.env.TIMEOUT) currentConfig.timeout = parseInt(process.env.TIMEOUT, 10);

  // ─── Auto-detect provider from API key ───────────────────────────────
  if (currentConfig.apiKey && !currentConfig.provider) {
    const detected = detectProviderFromKey(currentConfig.apiKey);
    if (detected) {
      currentConfig.provider = detected.provider;
      currentConfig.autoDetected = true;
      console.log(`[Config] ✨ Auto-detected provider: ${detected.name} (from key prefix)`);
    } else {
      // Unknown key format — default to custom
      console.warn('[Config] ⚠ Unknown API key format. Set PROVIDER in .env or use the dashboard.');
      currentConfig.provider = 'custom';
    }
  }

  // Fallback: no key and no provider = ollama
  if (!currentConfig.provider) {
    currentConfig.provider = 'ollama';
    currentConfig.autoDetected = true;
    console.log('[Config] No API key found — defaulting to Ollama (local)');
  }

  // Set default model if not specified
  if (!currentConfig.model) {
    const provider = getProvider(currentConfig.provider);
    currentConfig.model = provider.defaultModel;
  }

  // Auto-set timeout from provider (unless user explicitly overrode it)
  if (!process.env.TIMEOUT && !currentConfig._timeoutOverride) {
    const provider = getProvider(currentConfig.provider);
    if (provider.timeout) {
      currentConfig.timeout = provider.timeout;
    }
  }

  return currentConfig;
}

/**
 * Save current config to file (also updates .env for persistence)
 */
export function saveConfig(updates = {}) {
  // If API key changed and no explicit provider, re-detect
  if (updates.apiKey && !updates.provider) {
    const detected = detectProviderFromKey(updates.apiKey);
    if (detected) {
      updates.provider = detected.provider;
      updates.autoDetected = true;
    }
  }

  currentConfig = { ...currentConfig, ...updates };

  // Save config.json
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(currentConfig, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Config] Failed to save config.json:', e.message);
  }

  // Also update .env for easy portability
  try {
    const envLines = [
      '# BlitzProxy — Configuration',
      '# Just paste your API key below — provider is auto-detected!',
      '',
      `API_KEY=${currentConfig.apiKey || ''}`,
      `PROVIDER=${currentConfig.autoDetected ? '' : currentConfig.provider}`,
      `MODEL=${currentConfig.model || ''}`,
      `PROXY_PORT=${currentConfig.proxyPort}`,
      `DASHBOARD_PORT=${currentConfig.dashboardPort}`,
    ];
    writeFileSync(ENV_PATH, envLines.join('\n') + '\n', 'utf-8');
  } catch { /* .env write is best-effort */ }

  return currentConfig;
}

/**
 * Get current config (read-only copy)
 */
export function getConfig() {
  return { ...currentConfig };
}

/**
 * Get the effective base URL for the current provider
 */
export function getEffectiveBaseUrl() {
  if (currentConfig.provider === 'custom' && currentConfig.customBaseUrl) {
    return currentConfig.customBaseUrl.replace(/\/+$/, '');
  }
  const provider = getProvider(currentConfig.provider);
  return provider.baseUrl;
}

/**
 * Get the effective headers for the current provider
 */
export function getEffectiveHeaders() {
  const provider = getProvider(currentConfig.provider);
  const headers = {
    'Content-Type': 'application/json',
    ...provider.headers,
    ...currentConfig.customHeaders,
  };

  // Add auth header (skip for Ollama or if no key)
  if (currentConfig.apiKey && currentConfig.provider !== 'ollama') {
    headers['Authorization'] = `Bearer ${currentConfig.apiKey}`;
  }

  return headers;
}

/**
 * Get the effective model name
 */
export function getEffectiveModel() {
  return currentConfig.model || getProvider(currentConfig.provider).defaultModel || 'gpt-3.5-turbo';
}

// ─── Multi-API Key Management ────────────────────────────────────────────────

function generateKeyId() {
  return randomBytes(8).toString('hex');
}

/**
 * Get all saved API keys (with keys masked for security)
 */
export function getApiKeys(includeFull = false) {
  return (currentConfig.savedKeys || []).map(k => ({
    id: k.id,
    name: k.name,
    provider: k.provider,
    providerName: k.providerName || getProvider(k.provider).name,
    key: includeFull ? k.key : maskKey(k.key),
    isActive: k.id === currentConfig.activeKeyId,
    createdAt: k.createdAt,
  }));
}

/**
 * Add a new API key to the saved list
 * Returns the new key entry (masked)
 */
export function addApiKey({ name, key, provider, model }) {
  if (!key) throw new Error('API key is required');

  // Auto-detect provider from key if not specified
  let resolvedProvider = provider;
  let providerName = '';
  if (!resolvedProvider) {
    const detected = detectProviderFromKey(key);
    if (detected) {
      resolvedProvider = detected.provider;
      providerName = detected.name;
    } else {
      resolvedProvider = 'custom';
      providerName = 'Custom';
    }
  } else {
    providerName = getProvider(resolvedProvider).name;
  }

  const entry = {
    id: generateKeyId(),
    name: name || providerName,
    key,
    provider: resolvedProvider,
    providerName,
    model: model || '',
    createdAt: new Date().toISOString(),
  };

  if (!currentConfig.savedKeys) currentConfig.savedKeys = [];
  currentConfig.savedKeys.push(entry);

  // If no active key, auto-activate this one
  if (!currentConfig.activeKeyId) {
    setActiveKey(entry.id);
  } else {
    persistConfig();
  }

  return {
    ...entry,
    key: maskKey(entry.key),
    isActive: entry.id === currentConfig.activeKeyId,
  };
}

/**
 * Remove an API key by ID
 */
export function removeApiKey(keyId) {
  if (!currentConfig.savedKeys) return false;

  const idx = currentConfig.savedKeys.findIndex(k => k.id === keyId);
  if (idx === -1) return false;

  currentConfig.savedKeys.splice(idx, 1);

  // If we deleted the active key, switch to first available or clear
  if (currentConfig.activeKeyId === keyId) {
    if (currentConfig.savedKeys.length > 0) {
      setActiveKey(currentConfig.savedKeys[0].id);
    } else {
      currentConfig.activeKeyId = '';
      currentConfig.apiKey = '';
      currentConfig.provider = 'ollama';
      currentConfig.autoDetected = true;
      persistConfig();
    }
  } else {
    persistConfig();
  }

  return true;
}

/**
 * Set a key as the active one — updates apiKey + provider in config
 */
export function setActiveKey(keyId) {
  if (!currentConfig.savedKeys) return false;

  const entry = currentConfig.savedKeys.find(k => k.id === keyId);
  if (!entry) return false;

  currentConfig.activeKeyId = keyId;
  currentConfig.apiKey = entry.key;
  currentConfig.provider = entry.provider;
  currentConfig.autoDetected = false;

  // Also set model if the key has a preferred model
  if (entry.model) {
    currentConfig.model = entry.model;
  }

  // Auto-set timeout from provider
  const providerDef = getProvider(entry.provider);
  if (providerDef.timeout) {
    currentConfig.timeout = providerDef.timeout;
  }

  persistConfig();
  return true;
}

/**
 * Update an existing key's name
 */
export function updateApiKey(keyId, updates) {
  if (!currentConfig.savedKeys) return null;

  const entry = currentConfig.savedKeys.find(k => k.id === keyId);
  if (!entry) return null;

  if (updates.name !== undefined) entry.name = updates.name;

  persistConfig();
  return {
    ...entry,
    key: maskKey(entry.key),
    isActive: entry.id === currentConfig.activeKeyId,
  };
}

function maskKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return key.slice(0, 6) + '••••' + key.slice(-4);
}

/**
 * Internal: persist current config to disk
 */
function persistConfig() {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(currentConfig, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Config] Failed to save config.json:', e.message);
  }
}
