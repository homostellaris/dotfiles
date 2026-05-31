---
name: commit-and-push
description: Commit and push changes, co-authoring the commit with the model and following Gitmoji conventions
---

# commit-and-push

Commit and push project changes systematically, ensuring the commit message is descriptive, follows the **Gitmoji** specification, and properly attributes co-authorship to the active AI agent.

## Core Directives

1. **Verify Workspace State**:
   - Check staged and unstaged files using `git status`.
   - Ensure only relevant changes are staged for the commit.

2. **Compose Commit Message**:
   - Write a clear, concise subject line (maximum 50-60 characters).
   - Follow the **Gitmoji** convention (see the Gitmoji Guide below) to start the subject line with a relevant emoji code.
   - Use the imperative mood (e.g., "Add feature" instead of "Added feature" or "Adds feature").
   - Include a descriptive body if the changes require explanation, separated from the subject by a blank line.

3. **Incorporate AI Co-Authorship**:
   - Add a blank line after the commit message subject and body.
   - Append the co-author attribution trailer using the active agent's identifier (typically `Antigravity <antigravity@google.com>`).
   
   *Example formatting:*
   ```text
   ✨ feat: implement interactive canvas drag-and-drop grid

   - Add snap-to-grid alignment system
   - Implement collision detection on client drag completion
   - Optimize grid render performance

   Co-authored-by: Antigravity <antigravity@google.com>
   ```

4. **Execute Commit and Push**:
   - Perform the commit:
     ```bash
     git commit -m "<message>"
     ```
   - Push to the active remote branch. If the pre-push hook fails due to headless runtime constraints (e.g., missing Xvfb for Cypress), consult the user or bypass using `--no-verify` if safe to do so.

---

## Gitmoji Reference Guide

Use the following common Gitmojis to categorize and prefix commit subjects:

### Feature & Refactoring
* ✨ `:sparkles:` — Introducing new features
* ♻️ `:recycle:` — Refactoring or restructuring code (no behavior changes)
* 🎨 `:art:` — Improving structure / format of the code (cosmetic changes)
* ⚡️ `:zap:` — Improving performance / speed
* 🩹 `:adhesive_bandage:` — Simple fix for a non-critical issue

### Bugfixes & Security
* 🐛 `:bug:` — Fixing a bug
* 🚑 `:ambulance:` — Critical hotfix
* 🔒 `:lock:` — Fixing security issues or managing secrets

### Testing & Validation
* ✅ `:white_check_mark:` — Adding, updating, or passing tests
* 🚨 `:rotating_light:` — Fixing compiler / linter warnings

### Documentation & Assets
* 📝 `:memo:` — Writing or updating documentation
* 🍱 `:bento:` — Adding or updating media assets (images, icons, fonts)
* 💡 `:bulb:` — Adding or updating comments / inline code documentation

### Configuration & Tooling
* 🔧 `:wrench:` — Adding or updating configuration files / environment settings
* 👷 `:construction_worker:` — Adding or updating CI/CD build systems / scripts
* ➕ `:heavy_plus_sign:` — Adding a dependency
* ➖ `:heavy_minus_sign:` — Removing a dependency
* ⬆️ `:arrow_up:` — Upgrading dependencies
* ⬇️ `:arrow_down:` — Downgrading dependencies

### Metadata & Maintenance
* 🚚 `:truck:` — Moving or renaming resources (files, paths, routes)
* 💄 `:lipstick:` — Updating the UI and style sheets / visual files
* 📈 `:chart_with_upwards_trend:` — Adding analytics or tracking codes
* 🔊 `:loud_sound:` — Adding logs or diagnostics
* 🔇 `:mute_sound:` — Removing logs or diagnostics