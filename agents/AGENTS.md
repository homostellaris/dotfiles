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
