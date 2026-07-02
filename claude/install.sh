#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)

mkdir -p "$HOME/code/homostellaris/.claude"

# Symlink settings.json
ln -nfs "$DIR/settings.json" "$HOME/code/homostellaris/.claude/settings.json"

# Symlink statusline helper and make it executable
chmod +x "$DIR/statusline.sh"
ln -nfs "$DIR/statusline.sh" "$HOME/code/homostellaris/.claude/statusline.sh"
