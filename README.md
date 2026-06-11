![version](https://img.shields.io/badge/version-1.1.0-blue) ![node](https://img.shields.io/badge/node-18%2B-green) ![zero deps](https://img.shields.io/badge/dependencies-zero-brightgreen) ![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Mac%20%7C%20Linux-lightgrey) ![CI](https://github.com/jenil0528/claude-code-proxy/actions/workflows/ci.yml/badge.svg)

# ⚡ BlitzProxy

**Use Claude Code with ANY LLM provider — DeepSeek, NVIDIA, Groq, Ollama, and more.**

Zero dependencies. Pure Node.js. Everything managed from terminal.

```
Claude Code  ──→  BlitzProxy (localhost:4819)  ──→  Any OpenAI-compatible API
             Anthropic Messages API            OpenAI Chat Completions API
```

---

## 📋 What is BlitzProxy?

BlitzProxy is a local proxy server that sits between **Claude Code** (Anthropic's CLI) and any **OpenAI-compatible LLM provider**. It translates Anthropic's API format into OpenAI's format in real-time, so you can use Claude Code with providers like DeepSeek, NVIDIA NIM, Groq, Ollama, and others.

**Why?** Claude Code normally requires an Anthropic API key ($$). BlitzProxy lets you use cheaper or free alternatives instead.

---

## 🚀 Quick Start (Fresh Setup)

### Prerequisites

- **Node.js 18+** — Download from [nodejs.org](https://nodejs.org) if you don't have it
- **Claude Code CLI** — Install with `npm install -g @anthropic-ai/claude-code`
- No `npm install` needed for BlitzProxy — it has zero dependencies!

### Step 1: Get an API Key

You need an API key from any supported provider. Here are some free options:

| Provider | Free Tier | Get Key At |
|----------|-----------|------------|
| NVIDIA NIM | ✅ Free credits on signup | [build.nvidia.com](https://build.nvidia.com) |
| Groq | ✅ Generous free tier | [console.groq.com](https://console.groq.com) |
| GitHub Models | ✅ Free with GitHub account | [github.com/marketplace/models](https://github.com/marketplace/models) |
| Cerebras | ✅ Free tier | [cloud.cerebras.ai](https://cloud.cerebras.ai) |
| DeepSeek | 💰 Very cheap | [platform.deepseek.com](https://platform.deepseek.com) |
| OpenRouter | 💰 Many free models | [openrouter.ai](https://openrouter.ai) |
| Ollama | ✅ 100% Free (local) | [ollama.com](https://ollama.com) |

### Step 2: One-Time Setup

Open a terminal in the BlitzProxy folder and run:

```powershell
# Windows
.\setup.bat
```

This does three things:
1. Sets `ANTHROPIC_BASE_URL=http://localhost:4819` permanently (tells Claude Code to use BlitzProxy)
2. Sets `ANTHROPIC_API_KEY=blitz` permanently (a dummy key, BlitzProxy handles the real one)
3. Adds `blitz` command to your PATH so you can run it from anywhere

> **After setup, close and reopen your terminal** for the changes to take effect.

### 🍎 Mac / Linux Quick Start

```bash
# One-time setup
bash setup.sh

# Add your API key
blitz add YOUR_API_KEY_HERE

# Start
blitz
```

`setup.sh` will:
1. Append `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` to your `~/.zshrc` or `~/.bashrc`
2. Create a `blitz` symlink at `/usr/local/bin/blitz`
3. Print instructions to source your shell config

### Step 3: Add Your API Key

```powershell
blitz add YOUR_API_KEY_HERE
```

That's it! BlitzProxy **auto-detects** the provider from your key prefix. Examples:

```powershell
# NVIDIA NIM key (starts with nvapi-) → auto-detected
blitz add nvapi-abc123def456

# Groq key (starts with gsk_) → auto-detected
blitz add gsk_xyz789abc

# sk- keys (DeepSeek & OpenAI both use this prefix)
# BlitzProxy will ask you to choose:
blitz add sk-mykey123
# ⚠ This key starts with "sk-", which is used by multiple providers.
# Which provider is this key for?
#   🔮 1) DeepSeek
#   🤖 2) OpenAI
# Enter choice (1-2): _

# You can also give it a name
blitz add nvapi-abc123def456 "My NVIDIA Free Tier"
```

### Step 4: Start Using

```powershell
blitz
```

This starts the proxy and launches Claude Code automatically. Done! 🎉

---

## 🛠️ CLI Commands Reference

All management is done from the terminal. No UI, no browser — just commands.

### Starting

```powershell
blitz                # Start proxy + launch Claude Code
```

### Managing API Keys

You can save multiple API keys and switch between them instantly.

```powershell
blitz add API_KEY [NAME]   # Add a new API key (provider auto-detected)
blitz keys                 # List all saved keys
blitz switch INDEX         # Switch to key by number (#)
blitz switch NAME          # Switch to key by name (partial match works)
blitz rm INDEX             # Delete key by number
blitz rm NAME              # Delete by name
```

**Example workflow:**

```powershell
# Add multiple keys
blitz add nvapi-abc123 "NVIDIA Free"
blitz add gsk_xyz789 "Groq Fast"
blitz add sk-deep456 "DeepSeek Cheap"

# See all keys (● = active)
blitz keys
#   # │ Provider        │ Name                │ Key
#   ──┼─────────────────┼─────────────────────┼──────────────
# ●  1 │ NVIDIA NIM      │ NVIDIA Free         │ nvapi-••••c123
#    2 │ Groq            │ Groq Fast           │ gsk_xy••••z789
#    3 │ DeepSeek        │ DeepSeek Cheap      │ sk-de••••p456

# Switch to Groq (by number)
blitz switch 2
# ⚡ Switched to: Groq Fast
#    Provider: Groq  •  Timeout: 30s

# Switch by name (partial match)
blitz switch deep
# ⚡ Switched to: DeepSeek Cheap

# Delete a key
blitz rm 3
```

### Changing Model

```powershell
blitz model                # List available models for current provider
blitz model NAME           # Set a specific model
blitz model INDEX          # Set by number from the list
```

**Example:**

```powershell
# See available models
blitz model
#   1) meta/llama-3.3-70b-instruct
#   2) meta/llama-3.1-405b-instruct
#   ...
# ● 11) deepseek-ai/deepseek-v4-pro

# Switch to a different model
blitz model 1
# ✓ Model set: meta/llama-3.3-70b-instruct

# Or type part of the name
blitz model deepseek-r1
# ✓ Model set: deepseek-ai/deepseek-r1
```

### Changing Provider

```powershell
blitz provider             # List all providers with timeouts
blitz provider NAME        # Switch to a provider
```

**Example:**

```powershell
blitz provider
# ● 🟢 NVIDIA NIM       timeout=300s  Free credits on signup
#   ⚡ Groq             timeout=30s   Ultra-fast inference
#   🔮 DeepSeek         timeout=120s  Extremely affordable
#   🤖 OpenAI           timeout=120s  OpenAI official API
#   🦙 Ollama (Local)   timeout=600s  Run models locally
#   ...

blitz provider groq
# ✓ Provider: Groq
#    Model: llama-3.3-70b-versatile  •  Timeout: 30s
```

### Testing & Status

```powershell
blitz test                # Test connection to current provider
blitz status              # Show current configuration
```

### Logs

```powershell
blitz logs             # Show last 50 entries with colored output
blitz logs --live      # Stream new entries in real-time (like tail -f)
blitz logs --clear     # Wipe the log file
```

Log format:
```
[2026-04-28 14:32:01] POST /v1/messages → 200 OK (1243ms) deepseek-v4-pro
[2026-04-28 14:32:01] ERROR 429 rate_limit_exceeded
```

Colors: 🟢 green = 200 OK, 🟡 yellow = 4xx, 🔴 red = 5xx/errors. Log auto-rotates to `blitz.log.old` at 5MB.

---

## ⏱️ Auto-Timeout

BlitzProxy automatically sets the right timeout for each provider — you never need to configure this manually:

| Provider | Timeout | Why |
|----------|---------|-----|
| Groq | 30s | Ultra-fast inference |
| Cerebras | 30s | Blazing fast |
| GitHub Models | 60s | Generally fast |
| OpenRouter | 120s | Varies by model |
| DeepSeek | 120s | Standard |
| OpenAI | 120s | Standard |
| Together AI | 120s | Standard |
| Hugging Face | 120s | Standard |
| NVIDIA NIM | 300s | Cold-start on serverless GPUs |
| Ollama | 600s | Depends on your hardware |

When you switch keys or providers, the timeout updates automatically.

---

## 🗂️ Project Structure

```
claude-code-proxy/
├── blitz.bat          # Entry point — run "blitz" from anywhere (Windows)
├── blitz.sh           # Entry point — run "blitz" from anywhere (Mac/Linux)
├── cli.js             # CLI tool (add/keys/switch/rm/model/provider/test/logs)
├── server.js          # Proxy server (translates Anthropic → OpenAI)
├── setup.bat          # One-time setup (Windows)
├── setup.sh           # One-time setup (Mac/Linux)
├── start.bat          # Alternative: start proxy only (without Claude)
├── config.json        # Auto-created — stores your keys & settings
├── blitz.log          # Request log (auto-created, auto-rotated at 5MB)
├── .env               # API key (auto-created from .env.example)
├── .env.example       # Template
├── test/
│   ├── index.js               # Test runner (npm test)
│   ├── translator.test.js     # Unit tests: request/response translation
│   └── stream.test.js         # Unit tests: SSE stream translation
└── src/
    ├── config.js              # Configuration loading & key management
    ├── connection.js          # Fetch wrapper with connect/read timeouts
    ├── providers.js           # Provider definitions (URLs, models, timeouts)
    ├── translator.js          # Anthropic ↔ OpenAI request/response translation
    ├── stream-translator.js   # SSE stream translation
    ├── retry.js               # Automatic retry with exponential backoff
    └── logger.js              # Logging utilities
```

---

## 🔑 Supported Providers & Key Prefixes

BlitzProxy auto-detects the provider from your API key prefix:

| Provider | Key Prefix | Auto-Detected? |
|----------|-----------|----------------|
| NVIDIA NIM | `nvapi-` | ✅ Yes |
| Groq | `gsk_` | ✅ Yes |
| OpenRouter | `sk-or-` | ✅ Yes |
| Cerebras | `csk-` | ✅ Yes |
| GitHub Models | `github_pat_` | ✅ Yes |
| Hugging Face | `hf_` | ✅ Yes |
| DeepSeek | `sk-` | ⚠️ Also matches OpenAI — blitz will ask you to confirm |
| OpenAI | `sk-` | ⚠️ Also matches DeepSeek — blitz will ask you to confirm |
| Together AI | *(generic)* | Set manually: `blitz provider together` |
| Ollama | *(no key)* | Set manually: `blitz provider ollama` |
| Custom | *(any)* | Set manually: `blitz provider custom` |

---

## ❓ Troubleshooting

### "blitz" command not found
```powershell
# Option 1: Re-run setup
.\setup.bat

# Option 2: Add to PATH manually (current session)
$env:PATH += ";J:\claude proxy"

# Option 3: Run directly
& "J:\claude proxy\blitz.bat" help
```

### Connection timeout
```powershell
# Check your current config
blitz status

# Test the connection
blitz test

# If using NVIDIA NIM, first request may take 2-5 min (cold start)
# The 300s timeout handles this automatically
```

### Wrong model or provider
```powershell
# See what's active
blitz status

# Fix provider
blitz provider nvidia

# Fix model
blitz model deepseek-ai/deepseek-v4-pro
```

### Claude Code says "invalid API key"
```powershell
# Make sure env vars are set
echo $env:ANTHROPIC_BASE_URL
# Should show: http://localhost:4819

echo $env:ANTHROPIC_API_KEY
# Should show: blitz

# If not, run setup again
.\setup.bat
```

### PowerShell error: "The '<' operator is reserved for future use"
If you see this error, it's because you included brackets like `<` and `>` in your command. **Do not include the brackets.**
- ❌ `blitz add <nvapi-abc123>`
- ✅ `blitz add nvapi-abc123`
- ✅ `blitz add "nvapi-abc123"` (use quotes if the key has special characters)

---

## 🧪 Development & Testing

BlitzProxy has zero runtime dependencies. Tests are included and run with:

```bash
npm test
```

The test suite covers:
- Request translation (Anthropic → OpenAI messages, tools, tool_choice, stop_sequences)
- Response translation (OpenAI → Anthropic content blocks, stop reasons, usage)
- Streaming SSE translation (text deltas, single/multi tool calls, no duplicate events)

A CI workflow (`.github/workflows/ci.yml`) runs the test suite automatically on every push and pull request across Node.js 18, 20, and 22.

---

## 📝 Notes

- **Model quality matters**: Claude Code uses tool calling heavily. Models like DeepSeek V4 Pro, Llama 3.3 70B, and Qwen 2.5 Coder handle this well. Smaller models may struggle.
- **Rate limits**: The proxy includes automatic retry with exponential backoff (3 retries by default).
- **Multiple keys**: Save keys from different providers and switch instantly — great for testing or when one provider is slow.
- **Config file**: All settings are saved in `config.json` (auto-created). You can edit it manually if needed, but the CLI is easier.
- This is a development tool, not meant for production use.

---

## 🏁 TL;DR

```powershell
# First time (once ever)
.\setup.bat
blitz add YOUR_API_KEY

# Every time
blitz
```

---

## 👤 Author & Support

Created by **Jenil Patel**  
📧 Email: [jenil8736@gmail.com](mailto:jenil8736@gmail.com)  
🚀 Part of the **BlitzProxy** project.
