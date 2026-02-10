#!/bin/sh
DIR=$(dirname "$0")
ln -nfs "$DIR/config.nu" "$HOME/Library/Application Support/nushell"
ln -nfs "$DIR/git-aliases" "$HOME/Library/Application Support/nushell/git-aliases"
