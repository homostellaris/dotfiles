#!/bin/sh
ln -nfs $PWD/git/.gitconfig $HOME/.gitconfig

ln -nfs $PWD/zsh/.zshrc $HOME/.zshrc
$PWD/zsh/install-zsh-theme.sh

mkdir -p $HOME/.config/direnv/
ln -nfs $PWD/direnv/direnv.toml $HOME/.config/direnv/direnv.toml

ln -nfs $PWD/code/style.md $HOME/code/homostellaris/.claude/rules/style.md
ln -nfs $PWD/code/convex.md $HOME/code/homostellaris/.claude/rules/convex.md
ln -nfs $PWD/code/nestjs.md $HOME/code/homostellaris/.claude/rules/nestjs.md

ln -nfs $PWD/claude/CLAUDE.md $HOME/code/homostellaris/.claude/CLAUDE.md
ln -nfs $PWD/claude/settings.json $HOME/code/homostellaris/.claude/settings.json

ln -nfs $PWD/nushell/config.nu "$HOME/Library/Application Support/nushell"
ln -nfs $PWD/nushell/git-aliases "$HOME/Library/Application Support/nushell/git-aliases"

# TODO: Don't need this if Homebrew exists
# $PWD/scripts/install-gh-cli.sh
brew bundle --file ./brew/Brewfile
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
