# Testing Standards

- Put happy path tests first, then sad tests, then bad tests.
- Don't use the word 'mock' in variable names as its obvious from the context of the test.
- Don't use top-level describe statements for the function or class name when its already obvious from the file name.
- Don't add a top-level describe when its obvious from the filename what's being tested.

## Cypress E2E

Cypress tests should be organised such that they mirror the route they are testing. So in a NextJS application the route
`/blog/[slug]` would be tested by `cypress/e2e/blog/slug.cy.ts`.
