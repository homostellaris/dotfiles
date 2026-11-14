# Coding Standards

- Don't use code comments unless its to explain a non-obvious choice about the implementation.
- Don't abbreviate variable names.
- Follow the stepdown approach to writing code.

## TypeScript

- Keep props types inline unless they need to be exported.

# Testing

- Put happy path tests first, then sad tests, then bad tests.
- Don't use the word 'mock' in variable names as its obvious from the context of the test.
- Don't use top-level describe statements when already obvious from the filename.

## Cypress E2E

Cypress tests should be organised such that they mirror the route they are testing. So in a NextJS application the route `/blog/[slug]` would be tested by `cypress/e2e/blog/slug.cy.ts`.

# Workflow

- **Main Worktree Reserved for User**: The root repository directory (main worktree) is reserved exclusively for the user. Agents must never make direct or uncommitted edits in the root worktree.
- **Dedicated Agent Worktrees**: Agents must always create and work inside an isolated worktree for each task (e.g. `<repo>/.worktrees/<spec_or_task_id>`).
- **Local Verification**: Verify changes locally inside the worktree while uncommitted — run local test suites (e.g. `bun test`) and test/preview interactively via Tailscale on the worktree's port.
- **Merge & Push to Default Branch**: Once verified and approved by the user, commit following Gitmoji conventions, merge the worktree into the default branch (`main` or `master`), push directly to `origin`, and clean up the worktree. No GitHub PRs are created.
- **Minimal CI**: Nothing runs in CI unless strictly required for deployment (CI test pipelines are redundant with local and Tailscale verification).

# Agent Skills

Common automation skills and artifact sharing are located under `agents/skills/`:
- **`share`**: Publish standalone HTML reports, visual plans, and multi-file task dashboards (`$XDG_PUBLICSHARE_DIR/<spec_id>/`, defaulting to `~/Public/<spec_id>/`) using the Shadcn house style.
- **`symboldiff`**: Generate symbol-level code reviews with interactive visualization.
- **`commit-and-push`**: Co-author Git commits following Gitmoji standards.
- **`check-pr-run`**: Monitor and report GitHub Actions CI status.
- **`omarchy-log`**: Record, structure, and maintain systematic incident, debugging, and system configuration logs in the user's Obsidian vault (`~/Work/Reality Sculptor/Omarchy log/`).

# Agentic Build Orchestrator (`build`)

Automate full feature lifecycles from StarFocus spec to production with Antigravity and Herdr:
- **CLI Command**: `build <spec-id>` (e.g. `build canvas-section_y2vtpcom`)
- **Lifecycle**: Spec Discovery → Planner Agent → Tailscale Visual Plan (`share --task`) → Worktree Setup (`<repo>/.worktrees/<spec_id>`) → Implementer Agent → Local Test Gate (`bun test`) & Tailscale Verification → Human Approval → Merge to Default Branch & Direct Push → Worktree Cleanup → Deployment.
- **Herdr Integration**: Uses `herdr` for session management and interactive agent panes (`herdr session attach <spec-id>`).
- **Idempotency**: Pure external state evaluation (AGY transcripts, Git worktrees, tests, Git status) without requiring flags.

<posthog>
## PostHog

Use `posthog-cli api` for all PostHog-related data queries and operations. You should use `posthog-cli api` over direct MCP tool calls whenever the CLI is available.

Before your first PostHog command in a session, run `posthog-cli api --agent-help` and load its full output into your context. It prints the complete agent guide — command reference, schema drill-down rules, data discovery workflow, and the tool index — for interacting with PostHog APIs. Treat that output as instructions to follow, not just documentation.

Before starting a PostHog task, run `posthog-cli api skill list` and check for a skill matching the task. If one matches, install it with `posthog-cli api skill install <skill-id>` (add `--force` to refresh an already-installed skill), then read `.agents/skills/<skill-id>/SKILL.md` and follow it. Skills contain task-specific workflows that individual tools do not.
</posthog>
