#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)

# Create rules directories
mkdir -p "$HOME/code/homostellaris/.claude/rules"
mkdir -p "$HOME/code/homostellaris/.agents/rules"

# Link docs for Claude
ln -nfs "$DIR/style.md" "$HOME/code/homostellaris/.claude/rules/style.md"
ln -nfs "$DIR/convex.md" "$HOME/code/homostellaris/.claude/rules/convex.md"
ln -nfs "$DIR/nestjs.md" "$HOME/code/homostellaris/.claude/rules/nestjs.md"

# Link docs for Antigravity / generic agents
ln -nfs "$DIR/style.md" "$HOME/code/homostellaris/.agents/rules/style.md"
ln -nfs "$DIR/convex.md" "$HOME/code/homostellaris/.agents/rules/convex.md"
ln -nfs "$DIR/nestjs.md" "$HOME/code/homostellaris/.agents/rules/nestjs.md"


