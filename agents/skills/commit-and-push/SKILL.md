---
name: commit-and-push
description: Commit and push changes, co-authoring the commit with the model and following Gitmoji conventions
---

# commit-and-push

Commit and push project changes systematically, ensuring the commit message is formatted according to the workspace's Gitmoji configuration and properly attributes co-authorship to the active AI agent.

## Core Directives

1. **Verify Workspace State & Gitmoji Settings**:
   - Check staged and unstaged files using `git status`.
   - Scan the root directory for a **`.gitmojirc.json`** file to determine the correct commit message format.
   - Adhere to `.gitmojirc.json` rules (e.g., if `"emojiFormat": "emoji"`, use raw Unicode emojis like ✨/♻️/🐛 instead of text codes like `:sparkles:`; if `"capitalizeTitle": true`, capitalize the subject line).

2. **Compose Commit Message**:
   - Prefix the subject line with a relevant Unicode Gitmoji mapping to the change type (e.g., ✨ for features, ♻️ for refactoring, 🔧 for config, 🐛 for fixes).
   - Separated from the subject by a blank line, include a descriptive list of changes in the body if needed.

3. **Incorporate AI Co-Authorship**:
   - Add a blank line at the bottom of the commit message body.
   - Append the co-author attribution trailer using the active agent's identifier:
     ```text
     Co-authored-by: Antigravity <antigravity@google.com>
     ```

4. **Execute Commit and Push**:
   - If a Gitmoji `commit-msg` linter or hook is present, let it validate the message automatically.
   - Perform the commit:
     ```bash
     git commit -m "<message>"
     ```
   - Push to the remote branch (using `--no-verify` if the environment is constrained and a CI pre-push hook fails due to headless runtime limitations).