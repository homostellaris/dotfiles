#!/bin/bash
set -u

FRACTION=0.85
SCRATCH="scratchpad"

main() {
	local bundle_id="$1"
	local launch_name="${2:-}"

	local focused_workspace
	focused_workspace=$(aerospace list-workspaces --focused)

	local window
	window=$(find_window "$bundle_id")

	if [ -z "$window" ]; then
		launch_app "$bundle_id" "$launch_name"
		window=$(await_window "$bundle_id")
		[ -z "$window" ] && exit 0
		summon "${window%%|*}" "$focused_workspace"
		exit 0
	fi

	local window_id="${window%%|*}"
	local window_workspace="${window#*|}"

	if [ "$window_workspace" = "$focused_workspace" ]; then
		dismiss "$window_id"
	else
		summon "$window_id" "$focused_workspace"
	fi
}

find_window() {
	local bundle_id="$1"
	aerospace list-windows --all --format '%{app-bundle-id}|%{window-id}|%{workspace}' \
		| awk -F'|' -v b="$bundle_id" '$1 == b { print $2 "|" $3; exit }'
}

launch_app() {
	local bundle_id="$1"
	local launch_name="$2"
	open -b "$bundle_id" 2>/dev/null || { [ -n "$launch_name" ] && open -a "$launch_name"; }
}

await_window() {
	local bundle_id="$1"
	local window
	for _ in $(seq 1 60); do
		window=$(find_window "$bundle_id")
		[ -n "$window" ] && { echo "$window"; return; }
		sleep 0.05
	done
}

summon() {
	local window_id="$1"
	local workspace="$2"
	aerospace move-node-to-workspace --window-id "$window_id" --focus-follows-window "$workspace"
	aerospace focus --window-id "$window_id"
	aerospace layout floating
	size_to_fraction
}

dismiss() {
	aerospace move-node-to-workspace --window-id "$1" "$SCRATCH"
}

size_to_fraction() {
	local dimensions width height
	dimensions=$(usable_screen_size)
	width=$(scale_dimension "$dimensions" 1)
	height=$(scale_dimension "$dimensions" 2)
	osascript -e "tell application \"System Events\" to tell (first application process whose frontmost is true) to set size of front window to {$width, $height}" \
		>/dev/null 2>&1 || true
}

scale_dimension() {
	awk -v d="$1" -v position="$2" -v fraction="$FRACTION" \
		'BEGIN { split(d, sides, " "); printf "%d", sides[position] * fraction }'
}

usable_screen_size() {
	osascript -l JavaScript -e \
		'ObjC.import("AppKit"); var f = $.NSScreen.mainScreen.visibleFrame; f.size.width + " " + f.size.height'
}

main "$@"
