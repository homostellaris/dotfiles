#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)


if [ "$(uname)" = "Darwin" ]; then
  CONFIG_DIR="$HOME/Library/Application Support/nushell"
else
  CONFIG_DIR="$HOME/.config/nushell"
fi

mkdir -p "$CONFIG_DIR"
ln -nfs "$DIR/config.nu" "$CONFIG_DIR/config.nu"
ln -nfs "$DIR/git-aliases" "$CONFIG_DIR/git-aliases"

