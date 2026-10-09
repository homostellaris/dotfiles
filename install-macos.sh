#!/bin/sh
# macOS-only setup. Run by install.sh on Darwin (not in Linux/sandbox).
DIR=$(cd "$(dirname "$0")" && pwd)

# Window manager. Both configs live in the repo; only one is symlinked at a
# time. Revert to the AeroSpace fork with: WM=hyprspace ./install.sh
WM=${WM:-aerospace}
"$DIR/$WM/install.sh"

"$DIR/brew/install.sh"
"$DIR/raycast/install.sh"

echo "Manually install the following"
echo "- Chrome"
echo "- Obsidian"
echo "- Todoist"
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
