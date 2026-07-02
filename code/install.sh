#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)

mkdir -p "$HOME/code/homostellaris/.claude/rules"
ln -nfs "$DIR/style.md" "$HOME/code/homostellaris/.claude/rules/style.md"
ln -nfs "$DIR/convex.md" "$HOME/code/homostellaris/.claude/rules/convex.md"
ln -nfs "$DIR/nestjs.md" "$HOME/code/homostellaris/.claude/rules/nestjs.md"

