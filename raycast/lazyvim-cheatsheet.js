#!/usr/bin/env bun

// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title LazyVim Cheatsheet
// @raycast.mode fullOutput

// Optional parameters:
// @raycast.icon ⌨️

// Documentation:
// @raycast.description View LazyVim keyboard shortcuts
// @raycast.author homostellaris
// @raycast.authorURL https://raycast.com/homostellaris

console.log(await Bun.file("/Users/dan/Documents/Reality Sculptor/LazyVim cheatsheet.md").text());
