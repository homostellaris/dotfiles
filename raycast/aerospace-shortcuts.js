#!/usr/bin/env bun

// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title Hyprspace Config
// @raycast.mode fullOutput

// Optional parameters:
// @raycast.icon ⌨️

// Documentation:
// @raycast.description View your AeroSpace config
// @raycast.author homostellaris
// @raycast.authorURL https://raycast.com/homostellaris

const config = await Bun.file(`${process.env.HOME}/.config/hyprspace/config.toml`).text();
console.log(config);
