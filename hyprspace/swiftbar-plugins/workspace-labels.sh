#!/bin/bash
# SwiftBar plugin: show the focused Hyprspace workspace's cached task label.
# Refreshes only on push (swiftbar://refreshplugin?name=workspace-labels).

export PATH=/opt/homebrew/bin:/usr/bin:/bin

CACHE_DIR="$HOME/.cache/hyprspace-labels"
focused=$(hyprspace list-workspaces --focused 2>/dev/null)
focused_label=""
[ -n "$focused" ] && focused_label=$(cat "$CACHE_DIR/$focused.label" 2>/dev/null)
[ -z "$focused_label" ] && focused_label="WS $focused"

printf '%s | length=60 trim=true\n' "$focused_label"
echo "---"

for ws in $(hyprspace list-workspaces --all 2>/dev/null); do
    label=$(cat "$CACHE_DIR/$ws.label" 2>/dev/null)
    [ -z "$label" ] && label="—"
    printf '%s: %s | bash=/opt/homebrew/bin/hyprspace param1=workspace param2=%s terminal=false\n' "$ws" "$label" "$ws"
done

echo "---"
printf 'Force refresh | bash=%s/.config/hyprspace/scripts/refresh-labels.sh param1=--all-force terminal=false refresh=true\n' "$HOME"
