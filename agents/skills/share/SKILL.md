---
name: share
description: Share HTML reports, visualizers, visual plans, and multi-file task dashboards on your private Tailscale network using the Shadcn house style.
---

# Share Skill: Tailscale Artifact & Dashboard Sharing

Use this skill when you need to publish standalone HTML reports, visual plans, symbol diffs, UI prototypes, or multi-file task dashboards for review on mobile (WhatsApp) or desktop over your private Tailnet (`https://panther.tail29c7da.ts.net/`).

> [!IMPORTANT]
> **Strict Boundary & Project Independence**:
> The `house-style` component library applies **EXCLUSIVELY** to standalone HTML artifacts and task dashboards hosted in `~/share/`.
> When authoring or editing code inside actual application repositories (e.g. `~/code/homostellaris/*`):
> - **NEVER** import or inject `house-style.css` or `house-style.js` into project source code.
> - **ALWAYS** adhere strictly to that specific project's own styling approach, design tokens, and local component libraries.

---

## 1. CLI Commands

The `share` command is globally installed in `~/bin/share` (with aliases `host-report` and `serve-report`).

### A. Sharing a Single File
```bash
share /tmp/my-report.html --name banerry-analysis
```
* Copies the file to `~/share/banerry-analysis.html`.
* Updates the central index at `https://panther.tail29c7da.ts.net/`.
* Outputs the live MagicDNS URL.

### B. Sharing a Multi-Artifact Task Dashboard ($SPEC_ID Folder)
```bash
share --task <spec_id> \
      --title "Feature Title" \
      --project <project_name> \
      --status "PLAN REVIEW|IN_PROGRESS|PR_OPEN|VERIFIED|DEPLOYED" \
      --visual-plan <path/to/visual-plan.html> \
      --written-plan <path/to/plan.md> \
      --spec <path/to/spec.md> \
      --pr-url <github_pr_url> \
      --pr-number <number> \
      --symboldiff <path/to/symboldiff.html>
```
* Creates `~/share/<spec_id>/` with an interactive, tabbed `index.html` Task Dashboard.
* Copies the visual plan, written plan, spec, and symbol diff into that folder.
* Adds a grouped entry to the main Reports Hub (`https://panther.tail29c7da.ts.net/`).

### C. Checking Status
```bash
share --status
```

---

## 2. House Style Component Architecture

When generating standalone HTML pages or visual plans to be shared:

1. **Link the global theme & controller**:
   ```html
   <link rel="stylesheet" href="/_style/house-style.css">
   <script src="/_style/house-style.js" defer></script>
   ```

2. **Use the standardized Shadcn component classes**:
   * Header: `<header class="header-shell">...`
   * Container: `<main class="container">...`
   * Cards: `<div class="card"><div class="card-header"><h3 class="card-title">...`
   * Segmented Tabs: `<div data-tabs class="tabs-wrapper"><div class="tabs-list"><button class="tabs-trigger active" data-tab-target="tab-id">...`
   * Buttons: `<button class="btn btn-primary">...`
   * Badges: `<span class="badge badge-success">...`
   * Tables: `<div class="table-container"><table class="table">...`
   * WhatsApp Action: `<a href="https://wa.me/447812754124?text=approve%20$SPEC_ID" class="btn btn-primary">💬 Approve on WhatsApp</a>`

For full copy-paste component templates and markup patterns, consult [references/COMPONENTS.md](references/COMPONENTS.md).
