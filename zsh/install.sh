#!/bin/sh
DIR=$(dirname "$0")
ln -nfs "$DIR/.zshrc" "$HOME/.zshrc"
"$DIR/install-zsh-theme.sh"
