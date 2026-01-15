#!/usr/bin/env bun

// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title Timestamp
// @raycast.mode compact

// Optional parameters:
// @raycast.icon ⏳
// @raycast.argument1 { "type": "text", "placeholder": "2024-01-01 00:00:000", "optional": true }
// @raycast.packageName foo

// Documentation:
// @raycast.description Prints out a timestamp
// @raycast.author homostellaris
// @raycast.authorURL https://raycast.com/homostellaris

const datetimeString = process.argv.slice(2)[0];
const timestamp = (
  datetimeString ? new Date(datetimeString) : new Date()
).getTime();
console.log(timestamp);
