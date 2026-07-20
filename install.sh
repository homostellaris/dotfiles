#!/bin/sh
# Entry point. Runs the cross-platform base everywhere, then the macOS-only
# extras on Darwin. In a headless/Linux environment (e.g. a Docker sandbox) run
# ./install-base.sh directly.
DIR=$(cd "$(dirname "$0")" && pwd)

"$DIR/install-base.sh"

if [ "$(uname)" = "Darwin" ]; then
  "$DIR/install-macos.sh"
fi
