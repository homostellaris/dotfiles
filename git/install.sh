#!/bin/sh
DIR=$(dirname "$0")
ln -nfs "$DIR/.gitconfig" "$HOME/.gitconfig"
