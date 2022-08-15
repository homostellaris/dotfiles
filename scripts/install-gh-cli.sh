#!/usr/bin/env bash

function exit_if_already_installed () {
    if command -v gh &> /dev/null
    then
        echo "GitHub CLI is already installed 🚀"
        exit
    fi
}

function get_latest_version () {
    echo `curl "https://api.github.com/repos/cli/cli/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' | cut -c2-`
}

# Doesn't work on MacOS because their version of `tar` can't handle chaining the `-C` option.
function install_command () {
    curl -sSL https://github.com/cli/cli/releases/download/v${VERSION}/gh_${VERSION}_linux_amd64.tar.gz \
        | sudo tar xzfv - \
        --strip-components 2 \
        -C /usr/local/bin --wildcards */bin/gh \
        -C /usr/share/man/man1 --wildcards */share/man/man1
}

exit_if_already_installed
VERSION="$(get_latest_version)"
echo "Installing GitHub CLI version $VERSION"
install_command