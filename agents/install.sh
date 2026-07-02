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

# Symlink settings.json to both places
ln -nfs "$DIR/settings.json" "$HOME/code/homostellaris/.agents/settings.json"
ln -nfs "$DIR/settings.json" "$HOME/code/homostellaris/.claude/settings.json"

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

