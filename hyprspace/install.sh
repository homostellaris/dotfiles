#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)


mkdir -p "$HOME/.config/hyprspace/scripts"
ln -nfs "$DIR/config.toml" "$HOME/.config/hyprspace/config.toml"
ln -nfs "$DIR/scripts/refresh-labels.sh" "$HOME/.config/hyprspace/scripts/refresh-labels.sh"
chmod +x "$DIR/scripts/refresh-labels.sh"
ln -nfs "$DIR/scripts/float-nvim.sh" "$HOME/.config/hyprspace/scripts/float-nvim.sh"
chmod +x "$DIR/scripts/float-nvim.sh"

mkdir -p "$HOME/Library/Application Support/SwiftBar/Plugins"
ln -nfs "$DIR/swiftbar-plugins/workspace-labels.sh" "$HOME/Library/Application Support/SwiftBar/Plugins/workspace-labels.sh"
chmod +x "$DIR/swiftbar-plugins/workspace-labels.sh"
