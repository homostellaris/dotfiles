#!/bin/sh
# Cross-platform setup — safe on macOS AND Linux (including headless sandboxes).
# Everything here is per-user (no root) and non-clobbering where it matters.
# The core steps must succeed; personal-machine extras are non-fatal so this is
# safe to run in a minimal environment.
DIR=$(cd "$(dirname "$0")" && pwd)

# --- core cross-platform env ---
"$DIR/git/install.sh"
"$DIR/direnv/install.sh"
"$DIR/nushell/install.sh"
"$DIR/starship/install.sh"
"$DIR/nvim/install.sh"

# --- personal-machine config (host-layout / optional; non-fatal) ---
for extra in code agents claude zsh; do
  if [ -x "$DIR/$extra/install.sh" ]; then
    "$DIR/$extra/install.sh" || echo "install-base: skipped '$extra' (non-fatal)"
  fi
done
