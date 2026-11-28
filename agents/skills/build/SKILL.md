---
name: build
description: Orchestrate feature development, bug fixes, and spec builds in external repositories using the `build` CLI (`~/.local/bin/build`) instead of spawning raw `agy` or `claude` agents directly. Use whenever asked to build a feature, fix a bug in a codebase (starfocus, banerry, dotfiles, etc.), check build status, inspect agent transcripts, approve a plan/review gate, or send feedback to an active build.
---

# Build Orchestrator (`build`)

Use `build` (`~/.local/bin/build`) for all coding work in external repositories (e.g. `~/code/homostellaris/starfocus`, `~/code/homostellaris/banerry`, `~/code/homostellaris/dotfiles`). It handles isolated git worktrees, non-interactive `agy --print` agent runs, local test gates, verifier reviews, `symboldiff` + Tailscale previews, approval gates, and squashing/merging/pushing to the default branch.

> **Do not** spawn raw `agy` or `acpx` commands for external repo work when `build` can manage the lifecycle. (For OpenClaw's own scripts in `~/.openclaw/workspace/`, edit files directly instead.)

## Quick Reference

```bash
# Start a build from an inline prompt (run from target repo or pass --cwd)
build -p "Fix the header alignment on mobile" --cwd ~/code/homostellaris/starfocus

# Start a build from an existing Obsidian/todo spec
build --spec canvas-section_y2vtpcom

# Preview what build will do without spawning agents or modifying state
build -p "..." --cwd <repo> --dry-run

# Resume an existing build by ID
build --id <build-id>

# List active builds (or all including completed) and act interactively ([a]pprove / [f]eedback / [r]esume / [q]uit)
build ls
build ls --all
build ls --json

# Check status of a specific build
build status --id <build-id>

# Inspect agents that participated in a build and read their transcripts
build agents --id <build-id> [--json]
build transcript --id <build-id> [--agent <#|role|conversation-id>] [--full]

# Approve a waiting gate (scoped to one gate at a time)
build --id <build-id> --approve-plan
build --id <build-id> --approve-review
build --id <build-id> --approve

# Send feedback to replan or update implementation
build --id <build-id> --feedback "Use a dropdown instead of radio buttons"

# Clean up / remove a build state
build rm <build-id>
```

*(`--spec` / `--spec-id` still work as aliases for `--id`, but prefer `-p` / `--spec` when starting a build and `--id` when resuming or inspecting one.)*

## Choosing `--effort` (Token & Speed Guidance)

**Every** effort level pauses at the **Human Review Gate** (`AWAIT_HUMAN_REVIEW`) with a Tailscale preview URL, task dashboard, and automatically generated `symboldiff` so Dan can always review and test before merging. `--effort` controls **agent count and model tier** — always pick the lowest effort level that fits the task:

| Effort | Flag | Pipeline | Models Used | When to Use |
| :--- | :--- | :--- | :--- | :--- |
| **1 (Default)** | `-e 1` (or omit) | Worktree → Implement + Test Gate → **Human Review Gate** → Squash, Merge & Push | `gemini-4-hydrogen-high` | **Small, clear tasks:** bug fixes, typos, single-file edits, well-defined tweaks. Single fast agent; cheapest and fastest, still pauses for human review. |
| **2** | `-e 2` | Worktree → Implement + Test Gate → **Verifier** → **Human Review Gate** → Squash, Merge & Push | `gemini-4-hydrogen-high` (impl/repair), `claude-sonnet-5-5-high` (verifier) | **Medium features:** when you also want a Sonnet verifier pass before human review. |
| **3** | `-e 3` | **Planner** → **Plan Approval Gate** → Worktree → Implement → **Verifier** → **Human Review Gate** → Squash, Merge & Push | `gemini-4-argon-high` (plan/impl), `gemini-4-hydrogen-high` (repair), `claude-opus-5-5-high` (verifier) | **Large or architectural work:** multi-file features, schema/data-model changes, ambiguous specs, or anything needing an explicit technical plan first. |

Whenever a plan file exists (or `effort >= 2`), `build` automatically runs the **Verifier** (`RUN_VERIFIER_AGENT`) before `AWAIT_HUMAN_REVIEW`, and re-runs it after any feedback pass.

## Lifecycle & Git Behavior

- **Non-interactive execution:** All agent stages run via `agy --print` (no `herdr-core` / `hc attach` needed, and no workspace trust prompts on new worktrees).
- **Working tree until approval:** Implementation, repair, verifier, and feedback passes leave all changes uncommitted in the worktree until `--approve-review`.
- **Squash & Gitmoji lint on merge:** On `--approve-review`, `build` rebases onto `origin/<defaultBranch>`, squashes all changes into a single Gitmoji-validated commit, pushes directly to `origin/<defaultBranch>`, stops the dev server & `tailscale serve`, and removes the worktree.
- **Vercel toolbar comments:** On `AWAIT_HUMAN_REVIEW`, `build` checks `vercel comments --branch <id>` when re-run, addresses any new unresolved comments once, and hashes them (`addressed_toolbar_hash`) so it doesn't loop on the same thread.

## Project & Directory Targeting

- `build` infers the target project from the current working directory.
- **Always pass `--cwd <repo-path>`** (or `cd` into the repo first) when running from `~/.openclaw/workspace/` so it does not target the wrong repository.
- Use `--project <name>` only if you need to override the inferred project name.

## Safe Execution Workflow

1. **Dry-run first if unsure:** Run with `--dry-run` to verify the resolved `spec_id`, `Target Repo`, `Worktree Path`, and `Evaluated Next` stage before spending tokens.
2. **Never bypass gates blindly:** Only pass `--approve-plan` or `--approve-review` after Dan explicitly approves.
3. **Debugging failed or stalled runs:** Use `build status --id <id>`, `build agents --id <id>`, and `build transcript --id <id>` to inspect what each agent did instead of guessing or re-running blindly.
