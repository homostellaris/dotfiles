#!/bin/sh
# Bootstrap the LazyVim starter if there's no nvim config yet. On a machine that
# already has ~/.config/nvim (e.g. your Mac) this is a no-op. On first `nvim`
# launch, lazy.nvim installs the plugins.
NVIM_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/nvim"

if [ -e "$NVIM_CONFIG/init.lua" ]; then
  echo "nvim: config already present at $NVIM_CONFIG — leaving it."
else
  git clone --depth=1 https://github.com/LazyVim/starter "$NVIM_CONFIG"
  rm -rf "$NVIM_CONFIG/.git"
  echo "nvim: bootstrapped LazyVim starter into $NVIM_CONFIG."
fi
