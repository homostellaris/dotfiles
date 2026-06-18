#!/bin/bash
# Recompute one (or all) workspace label(s) and push to SwiftBar.
# Usage:
#   refresh-labels.sh             # focused workspace
#   refresh-labels.sh <N>         # workspace N
#   refresh-labels.sh --all-force # all workspaces, ignore hash cache

set -u
export PATH=/opt/homebrew/bin:/usr/bin:/bin

CACHE_DIR="$HOME/.cache/hyprspace-labels"
mkdir -p "$CACHE_DIR"
cd /tmp

PROMPT="Below are open macOS windows on one workspace. In 2-4 words, describe the user's task. Output only the description, no punctuation, no preamble, no quotes."

process_workspace() {
    local ws="$1"
    local force="$2"

    local windows_json
    windows_json=$(hyprspace list-windows --workspace "$ws" --json 2>/dev/null) || windows_json='[]'

    local hash_input
    hash_input=$(echo "$windows_json" | jq -r '
        .[] | ."app-name" + "::" + ((."window-title" // "") | split(" — ")[0] | split(" - ")[0] | split(": ")[0])
    ' 2>/dev/null | sort -u)

    local hash
    hash=$(printf '%s' "$hash_input" | shasum -a 256 | cut -c1-16)

    local hash_file="$CACHE_DIR/$ws.hash"
    local label_file="$CACHE_DIR/$ws.label"

    if [ "$force" != "force" ] && [ -f "$hash_file" ] && [ "$(cat "$hash_file")" = "$hash" ]; then
        return 0
    fi

    local label=""
    if [ -z "$hash_input" ]; then
        label=""
    else
        local summary
        summary=$(echo "$windows_json" | jq -r '.[] | ."app-name" + ": " + (."window-title" // "")')
        label=$(printf '%s\n' "$summary" \
            | claude -p --no-session-persistence \
                --exclude-dynamic-system-prompt-sections \
                --setting-sources user \
                --model haiku --max-budget-usd 0.10 \
                --name workspace-labeler \
                "$PROMPT" 2>/dev/null \
            | tr -d '\r\n"' \
            | sed 's/^ *//; s/ *$//' \
            | cut -c1-60)

        case "$label" in
            Error:*|"") label="" ;;
        esac

        if [ -z "$label" ]; then
            label=$(echo "$windows_json" | jq -r '[.[] | ."app-name"] | unique | join(", ")' | cut -c1-60)
            printf '%s' "$label" > "$label_file.tmp" && mv "$label_file.tmp" "$label_file"
            return 0
        fi
    fi

    printf '%s' "$label" > "$label_file.tmp" && mv "$label_file.tmp" "$label_file"
    printf '%s' "$hash" > "$hash_file.tmp" && mv "$hash_file.tmp" "$hash_file"
}

if [ "${1:-}" = "--all-force" ]; then
    for ws in $(hyprspace list-workspaces --all); do
        process_workspace "$ws" force
    done
elif [ -n "${1:-}" ]; then
    process_workspace "$1" normal
else
    focused=$(hyprspace list-workspaces --focused)
    [ -n "$focused" ] && process_workspace "$focused" normal
fi

open -g 'swiftbar://refreshplugin?name=workspace-labels' >/dev/null 2>&1 || true
