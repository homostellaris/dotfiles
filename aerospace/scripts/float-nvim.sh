#!/bin/bash

open -na Ghostty.app --args --title=nvim-float --window-width=110 --window-height=34 -e nvim

for _ in $(seq 1 60); do
	window_id=$(aerospace list-windows --all --json | jq -r '.[] | select(.["app-name"] == "Ghostty" and (.["window-title"] | test("nvim-float"))) | .["window-id"]' | head -1)
	if [ -n "$window_id" ]; then
		aerospace focus --window-id "$window_id"
		aerospace layout floating
		break
	fi
	sleep 0.05
done
