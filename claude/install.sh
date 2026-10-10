#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)

mkdir -p "$HOME/.claude"

# Symlink statusline helper and make it executable
chmod +x "$DIR/statusline.sh"
ln -nfs "$DIR/statusline.sh" "$HOME/.claude/statusline.sh"
