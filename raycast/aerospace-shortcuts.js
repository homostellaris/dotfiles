#!/usr/bin/env bun

// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title AeroSpace Config
// @raycast.mode fullOutput

// Optional parameters:
// @raycast.icon ⌨️

// Documentation:
// @raycast.description View your AeroSpace config
// @raycast.author homostellaris
// @raycast.authorURL https://raycast.com/homostellaris

const candidates = [
	`${process.env.HOME}/.config/aerospace/aerospace.toml`,
	`${process.env.HOME}/.config/hyprspace/config.toml`,
];

for (const candidate of candidates) {
	const file = Bun.file(candidate);
	if (await file.exists()) {
		console.log(await file.text());
		break;
	}
}
