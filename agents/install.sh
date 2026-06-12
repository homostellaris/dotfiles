#!/bin/sh
DIR=$(dirname "$0")
mkdir -p "$HOME/code/homostellaris/.claude"
ln -nfs "$DIR/CLAUDE.md" "$HOME/code/homostellaris/.claude/CLAUDE.md"
ln -nfs "$DIR/settings.json" "$HOME/code/homostellaris/.claude/settings.json"

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

