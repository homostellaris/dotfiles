#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)

mkdir -p "$HOME/.config/direnv/"
ln -nfs "$DIR/direnv.toml" "$HOME/.config/direnv/direnv.toml"
