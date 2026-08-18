# House Style Component System (Shadcn Architecture)

All agent-generated web pages, visual plans, dashboards, tool reports, and prototypes shared on Tailscale MUST follow this design system to ensure strict UI/UX consistency, accessibility, and mobile responsiveness.

## 1. Quick Start Template

Link the global stylesheet and interactive controller from the Tailscale share root:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Page Title</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/_style/house-style.css">
  <script src="/_style/house-style.js" defer></script>
</head>
<body>

  <!-- Sticky Header Shell -->
  <header class="header-shell">
    <div class="header-container">
      <div class="brand-row">
        <div class="brand-icon">⚡</div>
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="badge badge-success">IN PROGRESS</span>
            <span style="font-size: 0.75rem; color: var(--muted-foreground); font-family: var(--font-mono);">banerry</span>
          </div>
          <h1 style="margin-top: 0.15rem;">Canvas Section Feature</h1>
        </div>
      </div>
      <div>
        <a href="../index.html" class="btn btn-secondary btn-sm">← Back to Hub</a>
      </div>
    </div>
  </header>

  <!-- Main Content Container -->
  <main class="container">
    <!-- Content goes here -->
  </main>

</body>
</html>
```

---

## 2. Component Primitives

### Cards
```html
<div class="card">
  <div class="card-header">
    <div class="card-header-row">
      <h3 class="card-title">Card Heading</h3>
      <span class="badge badge-outline">v1.2</span>
    </div>
    <div class="card-description">Subtitle or contextual detail</div>
  </div>
  <div class="card-content">
    <p>Main content area inside the structured container.</p>
  </div>
  <div class="card-footer">
    <span style="font-size: 0.8rem; color: var(--muted-foreground);">Updated 2m ago</span>
    <button class="btn btn-primary btn-sm">Action</button>
  </div>
</div>
```

### Interactive Tabs (Radix / Shadcn Style)
```html
<div data-tabs class="tabs-wrapper">
  <div class="tabs-list">
    <button class="tabs-trigger active" data-tab-target="tab-overview">🧭 Overview</button>
    <button class="tabs-trigger" data-tab-target="tab-architecture">🏗️ Architecture</button>
    <button class="tabs-trigger" data-tab-target="tab-diff">⚡ Code Diff</button>
  </div>

  <div class="tabs-content active" data-tab-content="tab-overview">
    <!-- Overview Tab Content -->
  </div>
  <div class="tabs-content" data-tab-content="tab-architecture">
    <!-- Architecture Tab Content -->
  </div>
  <div class="tabs-content" data-tab-content="tab-diff">
    <!-- Code Diff Tab Content -->
  </div>
</div>
```

### Buttons
```html
<button class="btn btn-primary">Primary Action</button>
<button class="btn btn-secondary">Secondary Action</button>
<button class="btn btn-outline">Outline Action</button>
<button class="btn btn-ghost">Ghost Action</button>
<button class="btn btn-destructive">Delete</button>

<!-- WhatsApp Approval Action Button -->
<a href="https://wa.me/447812754124?text=approve%20$SPEC_ID" class="btn btn-primary" target="_blank">
  💬 Approve on WhatsApp
</a>
```

### Status Badges
```html
<span class="badge badge-default">DEFAULT</span>
<span class="badge badge-secondary">SECONDARY</span>
<span class="badge badge-outline">OUTLINE</span>
<span class="badge badge-success">COMPLETED</span>
<span class="badge badge-warning">IN PROGRESS</span>
<span class="badge badge-destructive">FAILED</span>
<span class="badge badge-purple">PR OPEN</span>
```

### Accordions / Collapsibles
```html
<div class="accordion" data-accordion>
  <div class="accordion-item">
    <button class="accordion-trigger">
      <span>Database Migrations</span>
      <span class="accordion-icon">▼</span>
    </button>
    <div class="accordion-content">
      <p>Detailed breakdown of schema changes.</p>
    </div>
  </div>
</div>
```

### Data Tables
```html
<div class="table-container">
  <table class="table">
    <thead>
      <tr>
        <th>Symbol</th>
        <th>Kind</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>useCanvasState</code></td>
        <td>Hook</td>
        <td><span class="badge badge-success">Added</span></td>
      </tr>
    </tbody>
  </table>
</div>
```

### Code Blocks with Copy Button
```html
<div class="code-box">
  <div class="code-header">
    <span>convex/canvas.ts</span>
    <button class="btn btn-ghost btn-sm" data-copy="#code-canvas">Copy</button>
  </div>
  <pre><code id="code-canvas">export const getCanvas = query({ ... });</code></pre>
</div>
```
