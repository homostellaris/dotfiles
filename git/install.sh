#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)

ln -nfs "$DIR/.gitconfig" "$HOME/.gitconfig"
