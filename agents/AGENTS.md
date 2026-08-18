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

# Tailscale Artifact & Dashboard Sharing (`share`)

Share HTML reports, visual plans, symbol diffs, and multi-file task dashboards on your private Tailscale network:
- **Share File**: `share <file.html> [--name <slug>]`
- **Share Task Bundle**: `share --task <spec_id> [--title "..." --visual-plan <file> --written-plan <file> --spec <file> --pr-url <url>]`
- **Reports Hub**: All shared artifacts live at `~/share/` and are indexed at `https://panther.tail29c7da.ts.net/`.
- **Aliases**: `host-report`, `serve-report`.

# Agentic Build Orchestrator (`build`)

Automate full feature lifecycles from StarFocus spec to production with Antigravity and Herdr:
- **CLI Command**: `build <spec-id>` (e.g. `build canvas-section_y2vtpcom`)
- **Lifecycle**: Spec Discovery → Planner Agent → Tailscale Visual Plan (`share --task`) → Worktree Setup (`<repo>/.worktrees/<spec_id>`) → Implementer Agent → Local Test Gate (`bun test`) → Gitmoji Commit & PR → CI Monitoring → OpenClaw WhatsApp Alert → Verifier Agent Hardening → Post-Merge Deployment.
- **Herdr Integration**: Uses `herdr` for session management and interactive agent panes (`herdr session attach build-<spec-id>`).
- **Idempotency**: Pure external state evaluation (AGY transcripts, Git worktrees, tests, GitHub PRs) without requiring flags.


