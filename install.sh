#!/bin/sh
ln -nfs $PWD/config/.gitconfig $HOME/.gitconfig
ln -nfs $PWD/config/.zshrc $HOME/.zshrc
mkdir -p $HOME/.config/direnv/
ln -nfs $PWD/config/direnv.toml $HOME/.config/direnv/direnv.toml
# TODO: Don't need this if Homebrew exists
# $PWD/scripts/install-gh-cli.sh
$PWD/scripts/install-zsh-theme.sh
brew bundle
# TODO: Some sort of documentation of VS Code settings including snazzy.json
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
