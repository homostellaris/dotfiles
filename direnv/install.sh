#!/bin/sh
DIR=$(dirname "$0")
mkdir -p "$HOME/.config/direnv/"
ln -nfs "$DIR/direnv.toml" "$HOME/.config/direnv/direnv.toml"
