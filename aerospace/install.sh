#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)


mkdir -p "$HOME/.config/aerospace/scripts"
# AeroSpace only reads ~/.aerospace.toml or ~/.config/aerospace/aerospace.toml.
ln -nfs "$DIR/config.toml" "$HOME/.config/aerospace/aerospace.toml"
for script in refresh-labels float-nvim summon; do
	ln -nfs "$DIR/scripts/$script.sh" "$HOME/.config/aerospace/scripts/$script.sh"
	chmod +x "$DIR/scripts/$script.sh"
done

mkdir -p "$HOME/Library/Application Support/SwiftBar/Plugins"
ln -nfs "$DIR/swiftbar-plugins/workspace-labels.sh" "$HOME/Library/Application Support/SwiftBar/Plugins/workspace-labels.sh"
chmod +x "$DIR/swiftbar-plugins/workspace-labels.sh"
