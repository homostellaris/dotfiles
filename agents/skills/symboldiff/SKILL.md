---
name: symboldiff
description: Generate a symbol-level and file-tree diff view with type and method signatures, rendered as a keyboard-driven HTML visualizer and CLI summary.
---

# symboldiff

Analyze git diffs at the abstraction level of file paths and code symbols (functions, methods, types, interfaces, classes, structs), identifying exact signature mutations vs. internal body modifications.

## Purpose & Overview

When reviewing PRs, inspecting feature branches, or understanding large refactors, line-by-line diffs introduce overwhelming noise (formatting changes, small internal logic tweaks, re-ordering).

`symboldiff` lifts the review abstraction to a beautifully minimal, multi-page drilldown experience with instant browser back/forward button navigation:
1. **Level 1 (`#/`): Collapsible File Tree**: Hierarchical directory tree of changed files with directory collapse/expand toggles (`▼`/`▶`), aggregated directory stats (`N files • +X -Y symbols`), full file paths on every row, and instant search filter.
2. **Level 2 (`#/file/:fIdx`): File Symbols**: Dedicated clean view of a selected file's modified symbols with kind, signatures, and line numbers. (Files with no symbols render their traditional diff directly here).
3. **Level 3 (`#/file/:fIdx/sym/:sIdx`): Symbol Inspection**: Uncluttered, full-width view of a single symbol featuring both **Traditional Diff** (unified hunk diff with line numbers and red/green highlights) and **Actual Code** (complete source implementation with syntax line numbers and copy button).
4. **Navigation**: Seamless browser Back / Forward button support (`history.pushState` / hash routing), breadcrumb trail (`Files / <file> / <symbol>`), and keyboard shortcuts (`j`/`k`, `Enter`/`Space`, `←`/`→`, `e`/`c`, `Tab`/`1`/`2`).

---

## When to Use This Skill

Activate or execute `symboldiff` when:
- Reviewing an open PR or branch before merging.
- Performing architectural impact analysis for breaking API or signature changes.
- Getting a high-level summary of outstanding or uncommitted changes across a repository.
- Presenting a clean, visual walkthrough of code changes to the user.

---

## Usage Instructions

The `symboldiff` engine is located at:
`~/.agents/skills/symboldiff/scripts/symboldiff.mjs`

### 1. Working Tree Diff (Unstaged & Staged vs HEAD)
```bash
~/.agents/skills/symboldiff/scripts/symboldiff.mjs
```

### 2. Compare Current Branch Against Main / Default
```bash
~/.agents/skills/symboldiff/scripts/symboldiff.mjs main
```

### 3. Compare Two Branches or Commits
```bash
~/.agents/skills/symboldiff/scripts/symboldiff.mjs main feature/canvas
~/.agents/skills/symboldiff/scripts/symboldiff.mjs HEAD~3 HEAD
```

### 4. Structured JSON Output (For Agent Tooling & Subagents)
```bash
~/.agents/skills/symboldiff/scripts/symboldiff.mjs --json main
```

### 5. Generate Standalone HTML Visualizer Without Opening Browser
```bash
~/.agents/skills/symboldiff/scripts/symboldiff.mjs --no-open --out /tmp/review.html main
```

### 6. Publish to Tailscale Portal & Task Dashboard
Always publish symbol diffs into the project's task bundle so it is directly navigable from the Portal (`https://omarchy.tail29c7da.ts.net/` or `/tasks/`):
```bash
~/.agents/skills/symboldiff/scripts/symboldiff.mjs --no-open --out /tmp/symboldiff.html master
share --task <spec_id> --project <project_name> --symboldiff /tmp/symboldiff.html
```
This ensures the symbol diff is permanently accessible via: **Portal → <Project> → <Task> → SymbolDiff** tab.

### 6. Publish to Tailscale Portal & Task Dashboard
Always publish symbol diffs into the project's task bundle so it is directly navigable from the Portal (`https://omarchy.tail29c7da.ts.net/` or `/tasks/`):
```bash
~/.agents/skills/symboldiff/scripts/symboldiff.mjs --no-open --out /tmp/symboldiff.html master
share --task <spec_id> --project <project_name> --symboldiff /tmp/symboldiff.html
```
This ensures the symbol diff is permanently accessible via: **Portal → <Project> → <Task> → SymbolDiff** tab.

---

## Keyboard-Driven Visualizer Navigation

When the HTML visualizer opens in the browser:

| Key | Action |
| :--- | :--- |
| **`j` / `k`** or **`↓` / `↑`** | Navigate down / up list items |
| **`Enter` / `Space` / `→`** | Open selected file or toggle directory folder open/close |
| **`←` / `Esc` / `Backspace` / `h`** | Collapse directory folder or go back to previous layer |
| **`e` / `c`** | Expand all / Collapse all folders (Level 1) |
| **`Tab`** or **`1` / `2`** | Toggle between **Diff** and **Actual Code** on Level 3 |
| **`c`** | Copy current diff or code snippet (Level 3) |
| **`[` / `]`** | Jump to previous / next symbol in Level 3 |
| **`/`** | Focus filter search bar on Level 1 |
| **`?`** | Open keyboard shortcut cheat sheet overlay |
