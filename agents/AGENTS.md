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

# Remote Artifact & Report Hosting (Tailscale)

When generating visual reports, interactive HTML visualizers, dashboards, or diffs:
- **Publish Utility**: Use `host-report <file.html> [--name <slug>]` (or symlinked `serve-report`).
- **Reports Hub**: All hosted artifacts live at `~/.local/share/agent-reports/` with an auto-updated `index.html` gallery.
- **Tailscale Access**: The hub is served securely across the user's private Tailnet (e.g. `https://<device-name>.ts.net/` or `http://100.x.y.z:8787/`) for seamless mobile/phone and remote review with zero public internet exposure.
- **Symbol Diffs**: Use `symboldiff [base_ref]` (or `git sdiff`) to generate symbol-level and file-tree code reviews. Passing `--host` automatically publishes the review to the Tailscale reports hub.
