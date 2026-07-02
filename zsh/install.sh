#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)

ln -nfs "$DIR/.zshrc" "$HOME/.zshrc"
"$DIR/install-zsh-theme.sh"
