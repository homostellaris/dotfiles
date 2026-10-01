#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)

# Create workspace config directories
mkdir -p "$HOME/code/homostellaris/.claude"
mkdir -p "$HOME/code/homostellaris/.agents"

# Symlink rules file to both AGENTS.md and CLAUDE.md in both configs
ln -nfs "$DIR/AGENTS.md" "$HOME/code/homostellaris/.agents/AGENTS.md"
ln -nfs "$DIR/AGENTS.md" "$HOME/code/homostellaris/.agents/CLAUDE.md"
ln -nfs "$DIR/AGENTS.md" "$HOME/code/homostellaris/.claude/AGENTS.md"
ln -nfs "$DIR/AGENTS.md" "$HOME/code/homostellaris/.claude/CLAUDE.md"


# Symlink global rules for Antigravity/Gemini
mkdir -p "$HOME/.gemini/config"
ln -nfs "$DIR/AGENTS.md" "$HOME/.gemini/config/AGENTS.md"


# Symlink all agent skills to user's agent skills paths
mkdir -p "$HOME/.agents/skills"
mkdir -p "$HOME/.gemini/config/skills"

for skill_path in "$DIR"/skills/*; do
  if [ -d "$skill_path" ]; then
    skill_name=$(basename "$skill_path")
    
    # Symlink to ~/.agents/skills
    rm -rf "$HOME/.agents/skills/$skill_name"
    ln -nsf "$skill_path" "$HOME/.agents/skills/$skill_name"
    
    # Symlink to ~/.gemini/config/skills
    rm -rf "$HOME/.gemini/config/skills/$skill_name"
    ln -nsf "$skill_path" "$HOME/.gemini/config/skills/$skill_name"
  fi
done

# Symlink system Omarchy skills into ~/.gemini/config/skills if present
if [ -d "/usr/share/omarchy/default/agents/skills" ]; then
  for skill_path in /usr/share/omarchy/default/agents/skills/*; do
    if [ -d "$skill_path" ]; then
      skill_name=$(basename "$skill_path")
      ln -nsf "$skill_path" "$HOME/.gemini/config/skills/$skill_name"
    fi
  done
fi

# Symlink scripts to ~/bin and ~/.local/bin
mkdir -p "$HOME/bin" "$HOME/.local/bin"
ln -nsf "$DIR/scripts/build.ts" "$HOME/bin/build"
ln -nsf "$DIR/scripts/build.ts" "$HOME/.local/bin/build"
chmod +x "$DIR/scripts/build.ts"

ln -nsf "$DIR/scripts/share.mjs" "$HOME/bin/share"
ln -nsf "$DIR/scripts/share.mjs" "$HOME/.local/bin/share"
ln -nsf "$DIR/scripts/share.mjs" "$HOME/bin/host-report"
ln -nsf "$DIR/scripts/share.mjs" "$HOME/.local/bin/host-report"
ln -nsf "$DIR/scripts/share.mjs" "$HOME/bin/serve-report"
ln -nsf "$DIR/scripts/share.mjs" "$HOME/.local/bin/serve-report"
# Determine share target directory (XDG_PUBLICSHARE_DIR or ~/Public)
SHARE_TARGET="${XDG_PUBLICSHARE_DIR:-$HOME/Public}"
[ "$SHARE_TARGET" = "$HOME/" ] && SHARE_TARGET="$HOME/Public"
[ -z "$SHARE_TARGET" ] && SHARE_TARGET="$HOME/Public"

# Deploy House Style & SymbolDiff assets to $SHARE_TARGET/_style/
mkdir -p "$SHARE_TARGET/_style"
cp "$DIR/styles/house-style.css" "$SHARE_TARGET/_style/house-style.css"
cp "$DIR/styles/house-style.js" "$SHARE_TARGET/_style/house-style.js"
[ -f "$DIR/styles/symboldiff.css" ] && cp "$DIR/styles/symboldiff.css" "$SHARE_TARGET/_style/symboldiff.css" || true

# Maintain backward-compatibility symlinks
if [ "$SHARE_TARGET" != "$HOME/share" ]; then
  ln -nsf "$SHARE_TARGET" "$HOME/share"
fi

# Refresh Portal and Tasks Dashboard
node "$DIR/scripts/share.mjs" --refresh >/dev/null 2>&1 || true
