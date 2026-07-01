#!/bin/bash

open -na Ghostty.app --args --title=nvim-float --window-width=110 --window-height=34 -e nvim

for _ in $(seq 1 60); do
	window_id=$(hyprspace list-windows --all --json | jq -r '.[] | select(.["app-name"] == "Ghostty" and (.["window-title"] | test("nvim-float"))) | .["window-id"]' | head -1)
	if [ -n "$window_id" ]; then
		hyprspace focus --window-id "$window_id"
		hyprspace layout floating
		hyprspace position center
		break
	fi
	sleep 0.05
done
