---
applyTo: "**/*.{ts,js,tsx,jsx}"
---

# Coding Standards

- Don't use code comments unless its to explain a non-obvious choice about the implementation.
- Don't abbreviate variable names.
- Follow the stepdown approach to writing code.

## Testing

- Put happy path tests first, then sad tests, then bad tests.
- Don't use the word 'mock' in variable names as its obvious from the context of the test.
- Don't use top-level describe statements for the function or class name when its already obvious from the file name.
- Don't add a top-level describe when its obvious from the filename what's being tested