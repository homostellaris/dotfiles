#!/bin/sh
# macOS-only setup. Run by install.sh on Darwin (not in Linux/sandbox).
DIR=$(cd "$(dirname "$0")" && pwd)

# Window manager. Both configs live in the repo; only one is symlinked at a
# time. Revert to the AeroSpace fork with: WM=hyprspace ./install.sh
WM=${WM:-aerospace}
"$DIR/$WM/install.sh"

"$DIR/brew/install.sh"
"$DIR/raycast/install.sh"

# Launch Services can only make an .app the default, so GUI opens go to Neovide rather than nvim.
NEOVIDE=$(osascript -e 'id of app "Neovide"')
for type in public.plain-text public.text public.source-code public.script public.shell-script \
  public.json public.xml public.yaml net.daringfireball.markdown \
  .ghostty .txt .md .json .jsonc .yaml .yml .toml .ts .tsx .js .jsx .mjs .cjs .lua .sh .zsh .nu .py .sql .conf .ini; do
  duti -s "$NEOVIDE" "$type" all || echo "Could not make Neovide the default for $type"
done

echo "Manually install the following"
echo "- Chrome"
echo "- Obsidian"
echo "- Bitwarden"
echo "- Discord"
echo "- Google Drive"
echo "- WhatsApp"
echo "- Microsoft Remote Desktop"
echo "- Figma"
echo "- Notion"
echo "- Raindrop"
echo "- AltTab"
echo "- SteelSeries Exact Mouse Tool"
echo "- Mionix Hub"
echo "- Logitech G Hub"
