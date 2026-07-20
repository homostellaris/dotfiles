#!/bin/sh
# Symlink .gitconfig, but do NOT clobber an existing one — some environments
# (e.g. a sandbox that injects git auth via ~/.gitconfig) manage it themselves.
DIR=$(cd "$(dirname "$0")" && pwd)

if [ -e "$HOME/.gitconfig" ] || [ -L "$HOME/.gitconfig" ]; then
  echo "git: ~/.gitconfig already present — leaving it (not clobbering)."
else
  ln -s "$DIR/.gitconfig" "$HOME/.gitconfig"
fi
