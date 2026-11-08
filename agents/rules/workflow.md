# Workflow

- **Main Worktree Reserved for User**: The root repository directory (main worktree) is reserved exclusively for the user. Agents must never make direct or uncommitted edits in the root worktree.
- **Dedicated Agent Worktrees**: Agents must always create and work inside an isolated worktree for each task (e.g. `<repo>/.worktrees/<spec_or_task_id>`).
- **Local Verification**: Verify changes locally inside the worktree while uncommitted — run local test suites (e.g. `bun test`) and test/preview interactively via Tailscale on the worktree's port.
- **Merge & Push to Default Branch**: Once verified and approved by the user, commit following Gitmoji conventions, merge the worktree into the default branch (`main` or `master`), push directly to `origin`, and clean up the worktree. No GitHub PRs are created.
- **Minimal CI**: Nothing runs in CI unless strictly required for deployment (CI test pipelines are redundant with local and Tailscale verification).
