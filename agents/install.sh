#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)

# Create rules directories (global and workspace)
mkdir -p "$HOME/.agents/rules"
mkdir -p "$HOME/.claude/rules"
mkdir -p "$HOME/.gemini/config/rules"
mkdir -p "$HOME/code/homostellaris/.agents/rules"
mkdir -p "$HOME/code/homostellaris/.claude/rules"

# Link all rules
for rule_path in "$DIR"/rules/*; do
  if [ -f "$rule_path" ]; then
    rule_name=$(basename "$rule_path")
    ln -nfs "$rule_path" "$HOME/.agents/rules/$rule_name"
    ln -nfs "$rule_path" "$HOME/.claude/rules/$rule_name"
    ln -nfs "$rule_path" "$HOME/.gemini/config/rules/$rule_name"
    ln -nfs "$rule_path" "$HOME/code/homostellaris/.agents/rules/$rule_name"
    ln -nfs "$rule_path" "$HOME/code/homostellaris/.claude/rules/$rule_name"
  fi
done

# Create workspace config directories
mkdir -p "$HOME/code/homostellaris/.claude"
mkdir -p "$HOME/code/homostellaris/.agents"

# Symlink rules file to both AGENTS.md and CLAUDE.md in both configs
ln -nfs "$DIR/AGENTS.md" "$HOME/code/homostellaris/.agents/AGENTS.md"
ln -nfs "$DIR/AGENTS.md" "$HOME/code/homostellaris/.agents/CLAUDE.md"
ln -nfs "$DIR/AGENTS.md" "$HOME/code/homostellaris/.claude/AGENTS.md"
ln -nfs "$DIR/AGENTS.md" "$HOME/code/homostellaris/.claude/CLAUDE.md"

# Symlink global rules for Antigravity/Gemini and Claude Code
mkdir -p "$HOME/.gemini/config"
ln -nfs "$DIR/AGENTS.md" "$HOME/.gemini/config/AGENTS.md"

mkdir -p "$HOME/.claude"
ln -nfs "$DIR/AGENTS.md" "$HOME/.claude/CLAUDE.md"


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


# explain-this hands its motion-graphic form to psychopomp's explainer-motion skill.
if [ ! -d "$HOME/.agents/skills/psychopomp" ]; then
  npx -y skills add kitlangton/psychopomp -g -s psychopomp -s explainer-motion -a claude-code -a gemini-cli -y
fi


# Expose every ~/.agents skill to Claude Code, whether it came from this repo above
# or from `npx skills add`. Sourced from ~/.agents/skills rather than $DIR/skills so
# CLI-installed skills are covered too.
mkdir -p "$HOME/.claude/skills"

for skill_path in "$HOME"/.agents/skills/*; do
  if [ -d "$skill_path" ]; then
    skill_name=$(basename "$skill_path")
    dest="$HOME/.claude/skills/$skill_name"

    # Only create a missing entry or repair one of our own links. Devkit owns its
    # entries here via `devkit setup --only link`, and visual-plan, visual-recap and
    # synced are real directories - overwriting any of them would be destructive.
    if [ -e "$dest" ] || [ -L "$dest" ]; then
      case "$(readlink "$dest" 2>/dev/null)" in
        *.agents/skills/*) ;;
        *) continue ;;
      esac
    fi

    ln -nsf "$skill_path" "$dest"
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

# Symlink scripts to ~/.local/bin
mkdir -p "$HOME/.local/bin"
ln -nsf "$DIR/scripts/build.ts" "$HOME/.local/bin/build"
chmod +x "$DIR/scripts/build.ts"

ln -nsf "$DIR/scripts/share.mjs" "$HOME/.local/bin/share"
ln -nsf "$DIR/scripts/share.mjs" "$HOME/.local/bin/host-report"
ln -nsf "$DIR/scripts/share.mjs" "$HOME/.local/bin/serve-report"
ln -nsf "$DIR/scripts/share-server.mjs" "$HOME/.local/bin/share-server.mjs"
chmod +x "$DIR/scripts/share.mjs" "$DIR/scripts/share-server.mjs"
# Determine share target directory (XDG_PUBLICSHARE_DIR or ~/Public)
SHARE_TARGET="${XDG_PUBLICSHARE_DIR:-$HOME/Public}"
[ "$SHARE_TARGET" = "$HOME/" ] && SHARE_TARGET="$HOME/Public"
[ -z "$SHARE_TARGET" ] && SHARE_TARGET="$HOME/Public"

# Deploy House Style & SymbolDiff assets to $SHARE_TARGET/_style/
mkdir -p "$SHARE_TARGET/_style"
cp "$DIR/styles/house-style.css" "$SHARE_TARGET/_style/house-style.css"
cp "$DIR/styles/house-style.js" "$SHARE_TARGET/_style/house-style.js"
[ -f "$DIR/styles/symboldiff.css" ] && cp "$DIR/styles/symboldiff.css" "$SHARE_TARGET/_style/symboldiff.css" || true

# Refresh Portal and Tasks Dashboard
node "$DIR/scripts/share.mjs" --refresh >/dev/null 2>&1 || true
