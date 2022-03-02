#!/usr/bin/env bash

# Check if already installed
if command -v gh &> /dev/null
then
    echo "GitHub CLI is already installed 🚀"
    exit
fi
 
# Install CLI
VERSION=`curl "https://api.github.com/repos/cli/cli/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' | cut -c2-`
curl -sSL https://github.com/cli/cli/releases/download/v${VERSION}/gh_${VERSION}_linux_amd64.tar.gz -o ~/tmp/gh_${VERSION}_linux_amd64.tar.gz
tar xvf /tmp/gh_${VERSION}_linux_amd64.tar.gz
sudo cp /tmp/gh_${VERSION}_linux_amd64/bin/gh /usr/local/bin/
gh version

# Install man pages
sudo cp -r ~/tmp/gh_${VERSION}_linux_amd64/share/man/man1/* /usr/share/man/man1/
gh auth login

# Cleanup
rm ~/tmp/gh_*