# config.nu
#
# Installed by:
# version = 0.104.1
#
# This file is used to override default Nushell settings, define
# (or import) custom commands, or run any other startup tasks.
# See https://www.nushell.sh/book/configuration.html
#
# This file is loaded after env.nu and before login.nu
#
# You can open this file in your default editor using:
# config nu
#
# See `help config nu` for more options
#
# You can remove these comments if you want or leave
# them for future reference.

# Cross-platform PATH additions (home-relative so they work on any machine).
use std/util "path add"
path add "~/.local/bin"
path add "~/.bun/bin"
path add "~/.volta/bin"
# macOS-only (Homebrew) paths.
if $nu.os-info.name == "macos" {
  path add "/usr/local/bin"
  path add "/opt/homebrew/bin"
  path add "/opt/homebrew/opt/libpq/bin"
  path add "/opt/homebrew/opt/rustup/bin"
}

# Prefer VS Code when present (macOS), else nvim (headless/sandbox).
let editor = (if (which code | is-not-empty) { 'code' } else { 'nvim' })
$env.config.buffer_editor = $editor
$env.config.show_banner = false
$env.EDITOR = $editor # Set for GH CLI

# Aliases --------------------------------------------------------------------------------------------------------------
alias deploy = gh pr comment --body '/deploy'
alias scopes = git log | egrep -o '\s*\w+\(\w+\)' | sed 's/^.*(\(.*\))/\1/' | sort -u
alias t = bun test --watch
alias ghw = gh run watch
alias n = nvim

overlay use git-aliases/git-aliases.nu

use std/config *

# Direnv ---------------------------------------------------------------------------------------------------------------
# Initialize the PWD hook as an empty list if it doesn't exist
$env.config.hooks.env_change.PWD = $env.config.hooks.env_change.PWD? | default []
$env.config.hooks.env_change.PWD ++= [{||
  if (which direnv | is-empty) {
    # If direnv isn't installed, do nothing
    return
  }

  direnv export json | from json | default {} | load-env
  # If direnv changes the PATH, it will become a string and we need to re-convert it to a list
  $env.PATH = do (env-conversions).path.from_string $env.PATH
}]

# Starship -------------------------------------------------------------------------------------------------------------
mkdir ($nu.data-dir | path join "vendor/autoload")
starship init nu | save -f ($nu.data-dir | path join "vendor/autoload/starship.nu")
