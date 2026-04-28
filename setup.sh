#!/bin/bash
# ============================================================================
# BlitzProxy — Mac/Linux Setup Script
# Author: Jenil <jenil8736@gmail.com>
# Configures shell environment and creates blitz symlink
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BLITZ_SH="$SCRIPT_DIR/blitz.sh"

# ─── Detect shell config file ────────────────────────────────────────────────

RC_FILE=""
if [ -n "$SHELL" ] && echo "$SHELL" | grep -q "zsh"; then
  RC_FILE="$HOME/.zshrc"
elif [ -f "$HOME/.zshrc" ]; then
  RC_FILE="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  RC_FILE="$HOME/.bashrc"
else
  # Fallback: create .bashrc
  RC_FILE="$HOME/.bashrc"
fi

echo ""
echo "⚡ BlitzProxy Setup"
echo "══════════════════════════════════════════════════"
echo ""
echo "  Shell config: $RC_FILE"
echo "  BlitzProxy:   $SCRIPT_DIR"
echo ""

# ─── Append environment variables ────────────────────────────────────────────

MARKER="# BlitzProxy configuration"
if grep -qF "$MARKER" "$RC_FILE" 2>/dev/null; then
  echo "  ✓ Environment variables already configured"
else
  echo "" >> "$RC_FILE"
  echo "$MARKER" >> "$RC_FILE"
  echo 'export ANTHROPIC_BASE_URL=http://localhost:4819' >> "$RC_FILE"
  echo 'export ANTHROPIC_API_KEY=blitz' >> "$RC_FILE"
  echo "  ✓ Added ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY to $RC_FILE"
fi

# ─── Make blitz.sh executable ────────────────────────────────────────────────

chmod +x "$BLITZ_SH"
echo "  ✓ Made blitz.sh executable"

# ─── Create symlink at /usr/local/bin/blitz ──────────────────────────────────

if [ -L /usr/local/bin/blitz ] || [ -f /usr/local/bin/blitz ]; then
  echo "  ⚠ /usr/local/bin/blitz already exists — overwriting"
  sudo rm -f /usr/local/bin/blitz
fi

sudo ln -s "$BLITZ_SH" /usr/local/bin/blitz
echo "  ✓ Created symlink: /usr/local/bin/blitz → $BLITZ_SH"

# ─── Done ────────────────────────────────────────────────────────────────────

RC_BASENAME=$(basename "$RC_FILE")
echo ""
echo "══════════════════════════════════════════════════"
echo "  ✅ Setup complete!"
echo ""
echo "  Next steps:"
echo "    1. Run: source ~/$RC_BASENAME   (or restart your terminal)"
echo "    2. Run: blitz add YOUR_API_KEY"
echo "    3. Run: blitz"
echo ""
