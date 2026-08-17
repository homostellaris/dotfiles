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

- **Symbol Diffs**: Use `symboldiff [base_ref]` (or `git sdiff`) to generate symbol-level and file-tree code reviews. Passing `--host` automatically publishes the review to the Tailscale reports hub.

# Agentic Build Orchestrator (`build`)

Automate full feature lifecycles from StarFocus spec to production with Antigravity and Herdr:
- **CLI Command**: `build <spec-id>` (e.g. `build canvas-section_y2vtpcom`)
- **Lifecycle**: Spec Discovery → Planner Agent → Tailscale Visual Plan → Worktree Setup (`<repo>/.worktrees/<spec_id>`) → Implementer Agent → Local Test Gate (`bun test`) → Gitmoji Commit & PR → CI Monitoring → OpenClaw WhatsApp Alert → Verifier Agent Hardening → Post-Merge Deployment.
- **Herdr Integration**: Uses `herdr` for session management and interactive agent panes (`herdr session attach build-<spec-id>`).
- **Idempotency**: Pure external state evaluation (AGY transcripts, Git worktrees, tests, GitHub PRs) without requiring flags.

