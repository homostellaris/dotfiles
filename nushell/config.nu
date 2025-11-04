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

use std/util "path add"
path add "/usr/local/bin"
path add "~/.local/bin"
path add "~/.bun/bin"
path add "/opt/homebrew/bin"
path add "/opt/homebrew/opt/libpq/bin"

$env.config.buffer_editor = 'code'
# $env.config.show_banner = false

# ALIASES
alias deploy = gh pr comment --body '/deploy'
alias scopes = git log | egrep -o '\s*\w+\(\w+\)' | sed 's/^.*(\(.*\))/\1/' | sort -u
# alias token = curl --silent -X POST --data @/Users/dan/code/sunsave/.staging-auth.json \
#   -H 'X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth' \
#   -H 'Content-Type: application/x-amz-json-1.1' \
#   https://cognito-idp.eu-west-2.amazonaws.com/ \
#   | jq -r .AuthenticationResult.AccessToken | pbcopy && echo 'Copied access token to clipboard 📋'
alias t = bun test --watch
alias ghw = gh run watch
overlay use git-aliases/git-aliases.nu

# TODO: Add direnv or something similar
# TODO: Add NVM or something similar
# TODO: Solve Prisma/Sentry thinking its darwin instead of darwin-arm architecture
