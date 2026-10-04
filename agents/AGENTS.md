@rules/style.md

# Testing

# Cypress

## E2E

Cypress tests should be organised such that they mirror the route they are testing. So in a NextJS application the route
`/blog/[slug]` would be tested by `cypress/e2e/blog/slug.cy.ts`.

# TypeScript

- Keep props types inline unless they need to be exported.

# Workflow

- **Strict Rule**: Never commit or push changes directly to default branches (`master`, `main`, `develop`) under any circumstances unless explicitly requested by the user in the current session. Always develop on a separate feature branch and raise a PR.

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
- **Lifecycle**: Spec Discovery → Planner Agent → Tailscale Visual Plan (`share --task`) → Worktree Setup (`<repo>/.worktrees/<spec_id>`) → Implementer Agent → Local Test Gate (`bun test`) → Gitmoji Commit & PR → CI Monitoring → OpenClaw WhatsApp Alert → Verifier Agent Hardening → Post-Merge Deployment.
- **Herdr Integration**: Uses `herdr` for session management and interactive agent panes (`herdr session attach build-<spec-id>`).
- **Idempotency**: Pure external state evaluation (AGY transcripts, Git worktrees, tests, GitHub PRs) without requiring flags.

<posthog>
## PostHog

Use `posthog-cli api` for all PostHog-related data queries and operations. You should use `posthog-cli api` over direct MCP tool calls whenever the CLI is available.

Before your first PostHog command in a session, run `posthog-cli api --agent-help` and load its full output into your context. It prints the complete agent guide — command reference, schema drill-down rules, data discovery workflow, and the tool index — for interacting with PostHog APIs. Treat that output as instructions to follow, not just documentation.

Before starting a PostHog task, run `posthog-cli api skill list` and check for a skill matching the task. If one matches, install it with `posthog-cli api skill install <skill-id>` (add `--force` to refresh an already-installed skill), then read `.agents/skills/<skill-id>/SKILL.md` and follow it. Skills contain task-specific workflows that individual tools do not.
</posthog>
