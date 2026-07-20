#!/bin/sh
# Install starship (per-user, no root) if missing, and symlink the config.
# On macOS you likely already have it via brew; this only installs if absent.
DIR=$(cd "$(dirname "$0")" && pwd)

if ! command -v starship >/dev/null 2>&1; then
  mkdir -p "$HOME/.local/bin"
  curl -sS https://starship.rs/install.sh | sh -s -- --yes --bin-dir "$HOME/.local/bin"
fi

mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}"
ln -nfs "$DIR/starship.toml" "${XDG_CONFIG_HOME:-$HOME/.config}/starship.toml"
