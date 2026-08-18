---
name: symboldiff
description: Generate a symbol-level and file-tree diff view with type and method signatures, rendered as a keyboard-driven HTML visualizer and CLI summary.
---

# symboldiff

Analyze git diffs at the abstraction level of file paths and code symbols (functions, methods, types, interfaces, classes, structs), identifying exact signature mutations vs. internal body modifications.

## Purpose & Overview

When reviewing PRs, inspecting feature branches, or understanding large refactors, line-by-line diffs introduce overwhelming noise (formatting changes, small internal logic tweaks, re-ordering).

`symboldiff` lifts the review abstraction to:
1. **File Tree**: Which files were touched.
2. **Symbols**: Which functions, types, interfaces, or classes changed.
3. **Signatures**: Exact parameter and return type changes (⚡ **`Signature Modified`** vs 📝 **`Body Modified`** vs ✨ **`Added`** vs 🔥 **`Deleted`**).
4. **Visualizer**: An offline, standalone, keyboard-driven HTML app with Vim-style navigation (`j`/`k`, `Tab`, `1`-`5`, `/`, `?`).

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

---

## Keyboard-Driven Visualizer Navigation

When the HTML visualizer opens in the browser:

| Key | Action |
| :--- | :--- |
| **`j` / `k`** or **`↓` / `↑`** | Navigate down / up items in the active panel |
| **`Tab` / `Shift-Tab`** | Switch focus between **File Tree** and **Symbol Inspector** |
| **`/`** | Focus live search bar (filters files, symbols, and signatures) |
| **`Esc`** | Clear search filter and close modals |
| **`1` - `5`** | Filter by category: `1` All, `2` Sig Mod, `3` Body Mod, `4` Added, `5` Deleted |
| **`[` / `]`** | Jump to previous / next modified file |
| **`?`** | Open keyboard shortcut cheat sheet overlay |
