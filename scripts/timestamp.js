#!/usr/bin/env bun

// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title Timestamp
// @raycast.mode compact

// Optional parameters:
// @raycast.icon ⏳
// @raycast.argument1 { "type": "text", "placeholder": "2024-01-01T00:00:000Z" }
// @raycast.packageName foo

// Documentation:
// @raycast.description Prints out a timestamp
// @raycast.author homostellaris
// @raycast.authorURL https://raycast.com/homostellaris

const datetimeString = process.argv.slice(2)[0];
const timestamp = new Date(datetimeString).getTime();
console.log(timestamp);
