#!/bin/sh
DIR=$(dirname "$0")

echo ""
echo "Raycast: add the following directory as a Script Commands source:"
echo "  $DIR"
echo ""
echo "  Raycast → Preferences → Extensions → Script Commands → +"
echo ""
echo "LazyVim Keymaps extension: build and import into Raycast (dev mode) with:"
echo "  (cd \"$DIR/extensions/lazyvim-keymaps\" && npm install && npm run dev)"
echo ""
