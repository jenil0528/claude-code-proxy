// ============================================================================
// BlitzProxy — Provider Definitions
// Author: Jenil <jenil8736@gmail.com>
// All supported OpenAI-compatible API providers
// ============================================================================

export const PROVIDERS = {
  nvidia: {
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    models: [
      'meta/llama-3.3-70b-instruct',
      'meta/llama-3.1-405b-instruct',
      'meta/llama-3.1-70b-instruct',
      'meta/llama-3.1-8b-instruct',
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'mistralai/mistral-large-2-instruct',
      'mistralai/mixtral-8x22b-instruct-v0.1',
      'qwen/qwen2.5-72b-instruct',
      'qwen/qwen2.5-coder-32b-instruct',
      'deepseek-ai/deepseek-r1',
      'deepseek-ai/deepseek-v4-pro',
    ],
    headers: {},
    requiresKey: true,
    keyPrefix: 'nvapi-',
    timeout: 300000,
    description: 'Free credits on signup at build.nvidia.com',
  },

  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
      'deepseek-r1-distill-llama-70b',
      'qwen-qwq-32b',
    ],
    headers: {},
    requiresKey: true,
    keyPrefix: 'gsk_',
    timeout: 30000,
    description: 'Ultra-fast inference, generous free tier',
  },

  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'meta-llama/llama-3.1-405b-instruct:free',
      'qwen/qwen-2.5-72b-instruct:free',
      'mistralai/mistral-large-2411',
      'deepseek/deepseek-chat-v3-0324:free',
      'google/gemini-2.0-flash-exp:free',
      'google/gemini-2.5-pro-exp-03-25:free',
    ],
    headers: {
      'HTTP-Referer': 'https://blitzproxy.local',
      'X-Title': 'BlitzProxy',
    },
    requiresKey: true,
    keyPrefix: 'sk-or-',
    timeout: 120000,
    description: 'Gateway to 200+ models, many free options',
  },

  together: {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      'Qwen/Qwen2.5-72B-Instruct-Turbo',
      'Qwen/Qwen2.5-Coder-32B-Instruct',
      'deepseek-ai/DeepSeek-V3',
      'mistralai/Mixtral-8x22B-Instruct-v0.1',
    ],
    headers: {},
    requiresKey: true,
    keyPrefix: '',
    timeout: 120000,
    description: 'Signup credits, huge model catalog',
  },

  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-pro',
    models: [
      'deepseek-v4-pro',
      'deepseek-chat',
      'deepseek-coder',
      'deepseek-reasoner',
    ],
    headers: {},
    requiresKey: true,
    keyPrefix: 'sk-',
    timeout: 120000,
    description: 'Extremely affordable, strong coding model',
  },

  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1-preview',
      'o1-mini',
    ],
    headers: {},
    requiresKey: true,
    keyPrefix: 'sk-',
    timeout: 120000,
    description: 'OpenAI official API',
  },

  github: {
    name: 'GitHub Models',
    baseUrl: 'https://models.inference.ai.azure.com',
    defaultModel: 'Meta-Llama-3.3-70B-Instruct',
    models: [
      'Meta-Llama-3.3-70B-Instruct',
      'Meta-Llama-3.1-405B-Instruct',
      'Mistral-Large-2411',
      'gpt-4o',
      'DeepSeek-R1',
    ],
    headers: {},
    requiresKey: true,
    keyPrefix: 'github_pat_',
    timeout: 60000,
    description: 'Free with GitHub account',
  },

  cerebras: {
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama-3.3-70b',
    models: [
      'llama-3.3-70b',
      'llama-3.1-70b',
      'llama-3.1-8b',
    ],
    headers: {},
    requiresKey: true,
    keyPrefix: 'csk-',
    timeout: 30000,
    description: 'Blazing fast inference',
  },

  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.3:70b',
    models: [
      'llama3.3:70b',
      'llama3.3:latest',
      'llama3.1:70b',
      'llama3.1:latest',
      'llama3.1:8b',
      'qwen2.5-coder:32b',
      'qwen2.5-coder:latest',
      'qwen2.5:72b',
      'qwen2.5:latest',
      'deepseek-coder-v2:latest',
      'deepseek-r1:latest',
      'mixtral:latest',
      'codellama:latest',
      'mistral:latest',
      'phi3:latest',
      'gemma2:latest',
      'command-r:latest',
    ],
    headers: {},
    requiresKey: false,
    keyPrefix: '',
    timeout: 600000,
    description: 'Run models locally — no API key needed',
    supportsAutoDetect: true,
  },

  huggingface: {
    name: 'Hugging Face',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct',
      'meta-llama/Meta-Llama-3.1-70B-Instruct',
      'meta-llama/Meta-Llama-3.1-8B-Instruct',
      'Qwen/Qwen2.5-72B-Instruct',
      'Qwen/Qwen2.5-Coder-32B-Instruct',
      'mistralai/Mistral-Large-Instruct-2411',
      'mistralai/Mixtral-8x22B-Instruct-v0.1',
      'bigcode/starcoder2-15b',
      'NousResearch/Hermes-3-Llama-3.1-8B',
      'deepseek-ai/DeepSeek-Coder-V2-Instruct',
    ],
    headers: {},
    requiresKey: true,
    keyPrefix: 'hf_',
    timeout: 120000,
    description: 'Free Inference API, massive model library',
  },

  custom: {
    name: 'Custom Endpoint',
    baseUrl: '',
    defaultModel: '',
    models: [],
    headers: {},
    requiresKey: false,
    keyPrefix: '',
    timeout: 120000,
    description: 'Any OpenAI-compatible API endpoint',
  },
};

/**
 * Auto-detect Ollama models by querying the local API
 */
export async function detectOllamaModels(baseUrl = 'http://localhost:11434') {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map(m => m.name);
  } catch {
    return [];
  }
}

/**
 * Auto-detect provider from API key prefix.
 * Returns { provider, confidence } or null if no match.
 * Ordered longest-prefix-first to avoid ambiguity (e.g. "sk-or-" before "sk-").
 */
const KEY_PATTERNS = [
  { prefix: 'nvapi-',       provider: 'nvidia',      name: 'NVIDIA NIM' },
  { prefix: 'gsk_',         provider: 'groq',        name: 'Groq' },
  { prefix: 'sk-or-',       provider: 'openrouter',  name: 'OpenRouter' },
  { prefix: 'github_pat_',  provider: 'github',      name: 'GitHub Models' },
  { prefix: 'hf_',          provider: 'huggingface', name: 'Hugging Face' },
  { prefix: 'csk-',         provider: 'cerebras',    name: 'Cerebras' },
  { prefix: 'together_',    provider: 'together',    name: 'Together AI' },
  // sk- is intentionally LAST and handled specially — both DeepSeek and OpenAI use it
];

// Providers that share the ambiguous sk- prefix
const SK_AMBIGUOUS_PROVIDERS = [
  { provider: 'deepseek', name: 'DeepSeek' },
  { provider: 'openai',   name: 'OpenAI' },
];

export function detectProviderFromKey(apiKey) {
  if (!apiKey || apiKey === 'ollama' || apiKey === 'none') {
    return { provider: 'ollama', name: 'Ollama (Local)', confidence: 'exact' };
  }

  // Check unambiguous prefixes first (longest-prefix-first order)
  for (const pattern of KEY_PATTERNS) {
    if (apiKey.startsWith(pattern.prefix)) {
      return { provider: pattern.provider, name: pattern.name, confidence: 'prefix' };
    }
  }

  // Check for ambiguous sk- prefix
  if (apiKey.startsWith('sk-')) {
    return {
      provider: null,
      name: null,
      confidence: 'ambiguous',
      candidates: SK_AMBIGUOUS_PROVIDERS,
    };
  }

  // No known prefix — could be Together AI or other provider with generic keys
  return null;
}

/**
 * Get provider by key, with fallback to custom
 */
export function getProvider(key) {
  return PROVIDERS[key] || PROVIDERS.custom;
}

/**
 * List all provider keys
 */
export function listProviderKeys() {
  return Object.keys(PROVIDERS);
}
