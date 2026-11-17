---
name: build
description: Orchestrate feature development, bug fixes, and spec builds in external repositories using the `build` CLI (`~/.local/bin/build`) instead of spawning raw `agy` or `claude` agents directly. Use whenever asked to build a feature, fix a bug in a codebase (starfocus, banerry, dotfiles, etc.), check build status, approve a plan/review gate, or send feedback to an active build.
---

# Build Orchestrator (`build`)

Use `build` (`~/.local/bin/build`) for all coding work in external repositories (e.g. `~/code/homostellaris/starfocus`, `~/code/homostellaris/banerry`, `~/code/homostellaris/dotfiles`). It handles isolated git worktrees, `herdr-core` (`hc`) agent terminals, local test gates, Tailscale previews, approval gates, and merging/pushing to the default branch.

> **Do not** spawn raw `agy` or `acpx` commands for external repo work when `build` can manage the lifecycle. (For OpenClaw's own scripts in `~/.openclaw/workspace/`, edit files directly instead.)

## Quick Reference

```bash
# Start a build from an inline prompt (run from target repo or pass --cwd)
build -p "Fix the header alignment on mobile" --cwd ~/code/homostellaris/starfocus

# Start a build from an existing Obsidian/todo spec
build --spec canvas-section_y2vtpcom

# Preview what build will do without spawning agents or modifying state
build -p "..." --cwd <repo> --dry-run

# List active builds (or all including completed)
build ls
build ls --all
build ls --json

# Check status of a specific build
build status --spec <spec-id>

# Approve a waiting gate (scoped to one gate at a time)
build --spec <spec-id> --approve-plan
build --spec <spec-id> --approve-review
build --spec <spec-id> --approve

# Send feedback to replan or update implementation
build --spec <spec-id> --feedback "Use a dropdown instead of radio buttons"

# Clean up / remove a build and its worktree
build rm <spec-id>
```

## Choosing `--effort` (Token & Speed Guidance)

Always pick the lowest effort level that fits the task:

| Effort | Flag | Pipeline | Models Used | When to Use |
| :--- | :--- | :--- | :--- | :--- |
| **1 (Default)** | `-e 1` (or omit) | Worktree → Implement + Test Gate → Merge & Push | `gemini-4-hydrogen-high` | **Small, clear tasks:** bug fixes, typos, single-file edits, well-defined tweaks. Cheapest and fastest; no human pause gates. |
| **2** | `-e 2` | Worktree → Implement + Test Gate → **Human Review Gate** → Verify → Merge & Push | `gemini-4-hydrogen-high` (impl/repair), `claude-sonnet-5-5-high` (verifier) | **Medium features / UI changes:** when you want to inspect the Tailscale preview or diff (`--approve-review` / `--feedback`) before it merges. |
| **3** | `-e 3` | **Planner** → **Plan Approval Gate** → Worktree → Implement → **Human Review Gate** → Verify → Merge & Push | `gemini-4-argon-high` (plan/impl), `gemini-4-hydrogen-high` (repair), `claude-opus-5-5-high` (verifier) | **Large or architectural work:** multi-file features, schema/data-model changes, ambiguous specs, or anything needing an explicit technical plan first. |

## Project & Directory Targeting

- `build` infers the target project from the current working directory.
- **Always pass `--cwd <repo-path>`** (or `cd` into the repo first) when running from `~/.openclaw/workspace/` so it does not target the wrong repository.
- Use `--project <name>` only if you need to override the inferred project name.

## Safe Execution Workflow

1. **Dry-run first if unsure:** Run with `--dry-run` to verify the resolved `spec_id`, `Target Repo`, `Worktree Path`, and `Evaluated Next` stage before spending tokens.
2. **Run asynchronously for long builds:** `build` waits on `herdr-core` terminals (up to a 30-minute turn cap) and sends notifications via OpenClaw when it hits a gate (`AWAIT_PLAN_APPROVAL`, `AWAIT_HUMAN_REVIEW`) or finishes.
3. **Never bypass gates blindly:** Only pass `--approve-plan` or `--approve-review` after Dan explicitly approves.
4. **If a terminal blocks or times out:** `build` preserves the `herdr-core` terminal and prints `hc attach <id>`. Report the attach command and `build status --spec <id>` rather than re-running in a loop.
