#!/bin/sh
DIR=$(dirname "$0")
ln -nfs "$DIR/CLAUDE.md" "$HOME/code/homostellaris/.claude/CLAUDE.md"
ln -nfs "$DIR/settings.json" "$HOME/code/homostellaris/.claude/settings.json"
