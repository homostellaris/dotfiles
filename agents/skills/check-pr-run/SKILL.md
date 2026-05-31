---
name: check-pr-run
description: Monitor and report on the status of a triggered GitHub Actions PR pipeline
---

# check-pr-run

Watch the GitHub Actions PR workflow that has just been triggered.
When its finished let me know if its successful.
If it failed then look at the logs to see what the issue is.
Make sure you check the actual logs and not just the annotations for the run as sometimes they're just warnings.
You can check the logs with the --log-failed option, e.g. `gh run view 21035175853 --log-failed`.

