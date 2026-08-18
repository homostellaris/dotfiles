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

# House Style & UI Component System (Artifacts & Tailscale Only)

> [!IMPORTANT]
> **Strict Boundary & Project Independence**:
> This house style applies **EXCLUSIVELY** to agent-generated visual plans (`/visual-plan`), task dashboards (`share`), symbol diffs, and standalone HTML artifacts hosted in `~/share/` on Tailscale.
> When building or editing code inside actual application repositories (e.g. `~/code/homostellaris/*`):
> - **DO NOT** use or inject `house-style.css` or `house-style.js`.
> - **ALWAYS** adhere strictly to the project's own styling approach, design tokens, and local component libraries (e.g., project-specific Tailwind, React components, CSS modules). Each project owns its own aesthetics and conventions.

Whenever an agent builds web pages, dashboards, visual plans, prototypes, or HTML artifacts to share on Tailscale:
- **Mandatory Component Library**: Link `/_style/house-style.css` and `/_style/house-style.js`.
- **Component Primitives**: Always use standardized Shadcn HTML classes (`.card`, `.card-header`, `.card-title`, `.btn`, `.btn-primary`, `.badge`, `[data-tabs]`, `.table-container`, `[data-accordion]`).
- **Mobile First**: Fluid containers, touch-scrollable tabs (`.tabs-list`), sticky header shells (`.header-shell`), and dark mode native colors.
- **Reference Catalog**: Full copy-paste examples and markup patterns are documented in [`agents/styles/COMPONENTS.md`](file:///home/openclaw/code/homostellaris/dotfiles/agents/styles/COMPONENTS.md).



# Agentic Build Orchestrator (`build`)

Automate full feature lifecycles from StarFocus spec to production with Antigravity and Herdr:
- **CLI Command**: `build <spec-id>` (e.g. `build canvas-section_y2vtpcom`)
- **Lifecycle**: Spec Discovery → Planner Agent → Tailscale Visual Plan (`share --task`) → Worktree Setup (`<repo>/.worktrees/<spec_id>`) → Implementer Agent → Local Test Gate (`bun test`) → Gitmoji Commit & PR → CI Monitoring → OpenClaw WhatsApp Alert → Verifier Agent Hardening → Post-Merge Deployment.
- **Herdr Integration**: Uses `herdr` for session management and interactive agent panes (`herdr session attach build-<spec-id>`).
- **Idempotency**: Pure external state evaluation (AGY transcripts, Git worktrees, tests, GitHub PRs) without requiring flags.


