#!/usr/bin/env node

/**
 * Universal Agent Report & Artifact Host for Tailscale.
 * Hosts HTML reports, visualizers, diffs, and multi-file task dashboards
 * named after $SPEC_ID (containing visual plans, written plans, PR diffs, and specs).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const SHARE_DIR = path.join(os.homedir(), 'share');
const LEGACY_DIR = path.join(os.homedir(), '.local/share/agent-reports');
const REPORTS_DIR = fs.existsSync(SHARE_DIR) ? SHARE_DIR : LEGACY_DIR;

function getTailscaleInfo() {
  let hostname = 'panther';
  let ip = null;
  let magicDns = 'https://panther.tail29c7da.ts.net';

  try {
    const statusJson = execSync('tailscale status --json 2>/dev/null', { encoding: 'utf-8', timeout: 1000 });
    const status = JSON.parse(statusJson);
    if (status.Self) {
      ip = status.Self.TailscaleIPs?.[0] || ip;
      magicDns = status.Self.DNSName ? `https://${status.Self.DNSName.replace(/\.$/, '')}` : magicDns;
    }
  } catch {
    try {
      ip = execSync('tailscale ip -4 2>/dev/null', { encoding: 'utf-8', timeout: 1000 }).trim() || ip;
    } catch {}
  }

  return { hostname, ip, magicDns };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderMarkdownToHtml(markdownText) {
  if (!markdownText) return '';
  
  let html = escapeHtml(markdownText);

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Alerts
  html = html.replace(/&gt;\s*\[!NOTE\]\s*\n&gt;\s*(.*)/gim, '<div class="alert alert-note"><strong>NOTE:</strong> $1</div>');
  html = html.replace(/&gt;\s*\[!TIP\]\s*\n&gt;\s*(.*)/gim, '<div class="alert alert-tip"><strong>TIP:</strong> $1</div>');
  html = html.replace(/&gt;\s*\[!IMPORTANT\]\s*\n&gt;\s*(.*)/gim, '<div class="alert alert-important"><strong>IMPORTANT:</strong> $1</div>');
  html = html.replace(/&gt;\s*\[!WARNING\]\s*\n&gt;\s*(.*)/gim, '<div class="alert alert-warning"><strong>WARNING:</strong> $1</div>');

  // Blockquotes
  html = html.replace(/^&gt; (.*$)/gim, '<blockquote>$1</blockquote>');

  // Bold & Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<b><i>$1</i></b>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>');
  html = html.replace(/\*(.*?)\*/gim, '<i>$1</i>');

  // Inline Code
  html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

  // Fenced Code blocks
  html = html.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gim, (match, lang, code) => {
    return `<pre class="code-block language-${lang}"><code>${code.trim()}</code></pre>`;
  });

  // Checkbox lists
  html = html.replace(/^- \[x\] (.*$)/gim, '<li class="task-item checked"><input type="checkbox" checked disabled> $1</li>');
  html = html.replace(/^- \[ \] (.*$)/gim, '<li class="task-item"><input type="checkbox" disabled> $1</li>');
  html = html.replace(/^- (.*$)/gim, '<li>$1</li>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>.*?<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre[\s\S]*?<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<div class="alert[\s\S]*?<\/div>)<\/p>/g, '$1');
  html = html.replace(/<p>(<li[\s\S]*?<\/li>)<\/p>/g, '<ul>$1</ul>');

  return html;
}

function generateTaskDashboardHtml(meta) {
  const specId = escapeHtml(meta.specId);
  const title = escapeHtml(meta.title || meta.specId);
  const project = escapeHtml(meta.project || 'starfocus');
  const status = escapeHtml(meta.status || 'PLAN REVIEW');
  const prUrl = meta.prUrl ? escapeHtml(meta.prUrl) : null;
  const prNumber = meta.prNumber ? escapeHtml(meta.prNumber) : null;
  const updatedAt = new Date(meta.updatedAt || Date.now()).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  let statusBadgeClass = 'badge-default';
  if (meta.status === 'IN_PROGRESS' || meta.status === 'IMPLEMENTING') statusBadgeClass = 'badge-warning';
  if (meta.status === 'PR_OPEN' || meta.status === 'AWAITING_PR_REVIEW') statusBadgeClass = 'badge-purple';
  if (meta.status === 'VERIFIED' || meta.status === 'APPROVED') statusBadgeClass = 'badge-success';
  if (meta.status === 'DEPLOYED' || meta.status === 'COMPLETED') statusBadgeClass = 'badge-success';

  const hasVisualPlan = fs.existsSync(path.join(REPORTS_DIR, meta.specId, 'visual-plan.html'));
  const hasWrittenPlan = fs.existsSync(path.join(REPORTS_DIR, meta.specId, 'plan.html')) || fs.existsSync(path.join(REPORTS_DIR, meta.specId, 'plan.md'));
  const hasSpec = fs.existsSync(path.join(REPORTS_DIR, meta.specId, 'spec.md'));
  const hasSymbolDiff = fs.existsSync(path.join(REPORTS_DIR, meta.specId, 'symboldiff.html'));

  let writtenPlanContent = '';
  if (fs.existsSync(path.join(REPORTS_DIR, meta.specId, 'plan.md'))) {
    const rawMarkdown = fs.readFileSync(path.join(REPORTS_DIR, meta.specId, 'plan.md'), 'utf-8');
    writtenPlanContent = renderMarkdownToHtml(rawMarkdown);
  } else if (fs.existsSync(path.join(REPORTS_DIR, meta.specId, 'plan.html'))) {
    writtenPlanContent = `<iframe src="./plan.html" class="tab-iframe" title="Written Plan"></iframe>`;
  }

  let specContent = '';
  if (hasSpec) {
    const rawSpec = fs.readFileSync(path.join(REPORTS_DIR, meta.specId, 'spec.md'), 'utf-8');
    specContent = renderMarkdownToHtml(rawSpec);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} — Task</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/_style/house-style.css">
  <script src="/_style/house-style.js" defer></script>
  <style>
    .task-nav-back {
      font-size: 13px;
      margin-bottom: 16px;
      display: inline-block;
    }
    .task-header {
      margin-bottom: 20px;
    }
    .task-header h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .task-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--muted-foreground);
      flex-wrap: wrap;
    }
    .deliverable-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }
    .deliverable-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 13px;
    }
  </style>
</head>
<body class="app-shell">

  <main class="container" style="max-width: 800px; padding-top: 24px;">

    <a href="../index.html" class="task-nav-back">← All tasks</a>

    <div class="task-header">
      <h1>${title}</h1>
      <div class="task-meta">
        <span class="badge ${statusBadgeClass}">${status}</span>
        <span class="tag">${project}</span>
        <code>${specId}</code>
        <span>· Updated ${updatedAt}</span>
      </div>
    </div>

    <div data-tabs class="tabs-wrapper">
      <div class="tabs-list">
        <button class="tabs-trigger active" data-tab-target="tab-overview">Overview</button>
        ${hasVisualPlan ? `<button class="tabs-trigger" data-tab-target="tab-visual-plan">Visual Plan</button>` : ''}
        ${hasWrittenPlan ? `<button class="tabs-trigger" data-tab-target="tab-written-plan">Written Plan</button>` : ''}
        ${hasSymbolDiff || prUrl ? `<button class="tabs-trigger" data-tab-target="tab-pr">PR & Diff</button>` : ''}
        ${hasSpec ? `<button class="tabs-trigger" data-tab-target="tab-spec">Spec</button>` : ''}
      </div>

      <!-- OVERVIEW TAB -->
      <div class="tabs-content active" data-tab-content="tab-overview" id="tab-overview" style="margin-top: 16px;">
        <div class="grid-1">
          
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Task Details</h3>
            </div>
            <div class="card-content">
              <div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
                <div><strong>Spec:</strong> <code>${specId}</code></div>
                <div><strong>Repository:</strong> <code>~/code/homostellaris/${project}</code></div>
                <div><strong>Worktree:</strong> <code>.worktrees/${specId}</code></div>
                <div><strong>Branch:</strong> <code>${specId}</code></div>
              </div>

              <div style="display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap;">
                <a href="https://wa.me/447812754124?text=approve%20${specId}" class="btn btn-primary btn-sm" target="_blank">
                  Approve on WhatsApp →
                </a>
                ${prUrl ? `<a href="${prUrl}" class="btn btn-secondary btn-sm" target="_blank">View GitHub PR #${prNumber || ''} →</a>` : ''}
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Deliverables in Folder</h3>
            </div>
            <div class="card-content">
              <div class="deliverable-list">
                ${hasVisualPlan ? `
                  <div class="deliverable-item">
                    <span>Visual Plan</span>
                    <a href="./visual-plan.html" target="_blank">visual-plan.html →</a>
                  </div>` : ''}

                ${hasWrittenPlan ? `
                  <div class="deliverable-item">
                    <span>Written Technical Plan</span>
                    <a href="javascript:void(0)" onclick="document.querySelector('[data-tab-target=\\'tab-written-plan\\']')?.click()">View plan →</a>
                  </div>` : ''}

                ${hasSymbolDiff ? `
                  <div class="deliverable-item">
                    <span>SymbolDiff Review</span>
                    <a href="./symboldiff.html" target="_blank">symboldiff.html →</a>
                  </div>` : ''}

                ${hasSpec ? `
                  <div class="deliverable-item">
                    <span>Obsidian Spec</span>
                    <a href="javascript:void(0)" onclick="document.querySelector('[data-tab-target=\\'tab-spec\\']')?.click()">View spec →</a>
                  </div>` : ''}
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- VISUAL PLAN TAB -->
      ${hasVisualPlan ? `
      <div class="tabs-content" data-tab-content="tab-visual-plan" id="tab-visual-plan" style="margin-top: 16px;">
        <div class="card" style="padding: 12px;">
          <div class="card-header-row" style="margin-bottom: 8px;">
            <h3 class="card-title">Visual Plan</h3>
            <a href="./visual-plan.html" target="_blank" style="font-size: 12px;">Open full page →</a>
          </div>
          <iframe src="./visual-plan.html" class="tab-iframe" title="Visual Plan"></iframe>
        </div>
      </div>` : ''}

      <!-- WRITTEN PLAN TAB -->
      ${hasWrittenPlan ? `
      <div class="tabs-content" data-tab-content="tab-written-plan" id="tab-written-plan" style="margin-top: 16px;">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Written Implementation Plan</h3>
          </div>
          <div class="card-content">
            ${writtenPlanContent}
          </div>
        </div>
      </div>` : ''}

      <!-- PR & DIFF TAB -->
      ${hasSymbolDiff || prUrl ? `
      <div class="tabs-content" data-tab-content="tab-pr" id="tab-pr" style="margin-top: 16px;">
        <div class="card" style="padding: 12px;">
          <div class="card-header-row" style="margin-bottom: 8px;">
            <h3 class="card-title">Pull Request & SymbolDiff</h3>
            ${prUrl ? `<a href="${prUrl}" target="_blank" style="font-size: 12px;">Open PR #${prNumber || ''} on GitHub →</a>` : ''}
          </div>
          ${hasSymbolDiff ? `<iframe src="./symboldiff.html" class="tab-iframe" title="Symbol Diff"></iframe>` : `<p style="padding: 1rem;">PR URL: <a href="${prUrl}" target="_blank">${prUrl}</a></p>`}
        </div>
      </div>` : ''}

      <!-- SPEC TAB -->
      ${hasSpec ? `
      <div class="tabs-content" data-tab-content="tab-spec" id="tab-spec" style="margin-top: 16px;">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Spec Source</h3>
          </div>
          <div class="card-content">
            ${specContent}
          </div>
        </div>
      </div>` : ''}

    </div>

  </main>
</body>
</html>`;
}

function updateIndexHtml() {
  if (!fs.existsSync(REPORTS_DIR)) return;

  const entries = fs.readdirSync(REPORTS_DIR, { withFileTypes: true });

  // Only list task folders (directories with an index.html)
  const taskFolders = entries
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== '_style')
    .map(d => {
      const folderPath = path.join(REPORTS_DIR, d.name);
      const indexPath = path.join(folderPath, 'index.html');
      const metaPath = path.join(folderPath, 'metadata.json');
      if (!fs.existsSync(indexPath)) return null;

      let meta = { specId: d.name, title: d.name, project: 'starfocus', status: 'PLAN REVIEW' };
      if (fs.existsSync(metaPath)) {
        try { meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf-8')) }; } catch {}
      }

      const stat = fs.statSync(indexPath);
      return {
        slug: d.name,
        title: meta.title || d.name,
        project: meta.project || 'other',
        status: meta.status || 'PLAN REVIEW',
        mtime: stat.mtime.getTime(),
        timeAgo: formatTimeAgo(stat.mtime),
        fullDate: stat.mtime.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  const tasksJson = JSON.stringify(taskFolders);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Tasks</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --surface: #0f172a;
      --border: #1e293b;
      --text: #f8fafc;
      --text-muted: #64748b;
      --accent: #38bdf8;
      --font-sans: 'Inter', system-ui, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 14px;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 32px 16px 64px;
    }
    .wrapper {
      width: 100%;
      max-width: 680px;
    }
    .controls {
      margin-bottom: 20px;
    }
    .filter-input {
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 14px;
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .filter-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
    }
    .filter-input::placeholder {
      color: var(--text-muted);
    }
    .group-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
    }
    .group-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-right: 2px;
    }
    .group-btn {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: all 0.1s ease;
    }
    .group-btn:hover {
      color: var(--text);
      border-color: #334155;
    }
    .group-btn.active {
      background: #1e293b;
      color: #fff;
      border-color: var(--accent);
      font-weight: 600;
    }
    .link-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .link-item {
      border-bottom: 1px solid var(--border);
    }
    .bare-link {
      color: var(--accent);
      text-decoration: none;
      display: block;
      padding: 11px 0;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.4;
      word-break: break-word;
      transition: color 0.1s ease;
    }
    .bare-link:hover {
      text-decoration: underline;
    }
    .group-section {
      margin-bottom: 24px;
    }
    .group-header {
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 4px;
    }
    .empty {
      padding: 32px 0;
      color: var(--text-muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="controls">
      <input type="text" id="filterInput" class="filter-input" placeholder="Search tasks..." autofocus autocomplete="off">
      <div class="group-bar">
        <span class="group-label">Group:</span>
        <button class="group-btn" data-group="recent" onclick="setGrouping('recent')">Last Updated</button>
        <button class="group-btn" data-group="repo" onclick="setGrouping('repo')">Repo</button>
        <button class="group-btn" data-group="status" onclick="setGrouping('status')">Status</button>
      </div>
    </div>

    <div id="content"></div>
  </div>

  <script>
    const tasks = ${tasksJson};
    let currentGroup = localStorage.getItem('task_group') || 'recent';
    let searchQuery = '';

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function setGrouping(mode) {
      currentGroup = mode;
      localStorage.setItem('task_group', mode);
      render();
    }

    function render() {
      const content = document.getElementById('content');
      const q = searchQuery.toLowerCase().trim();

      const filtered = tasks.filter(t =>
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.project.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
      );

      if (filtered.length === 0) {
        content.innerHTML = '<div class="empty">No matching tasks found.</div>';
        return;
      }

      if (currentGroup === 'recent') {
        const listHtml = filtered.map(t => \`
          <li class="link-item">
            <a href="./\${t.slug}/" class="bare-link">\${escapeHtml(t.title)}</a>
          </li>
        \`).join('');
        content.innerHTML = \`<ul class="link-list">\${listHtml}</ul>\`;
      } else if (currentGroup === 'repo') {
        const groups = {};
        for (const t of filtered) {
          const k = t.project || 'other';
          if (!groups[k]) groups[k] = [];
          groups[k].push(t);
        }
        const html = Object.keys(groups).sort().map(repo => \`
          <div class="group-section">
            <div class="group-header">\${escapeHtml(repo)} (\${groups[repo].length})</div>
            <ul class="link-list">
              \${groups[repo].map(t => \`
                <li class="link-item">
                  <a href="./\${t.slug}/" class="bare-link">\${escapeHtml(t.title)}</a>
                </li>
              \`).join('')}
            </ul>
          </div>
        \`).join('');
        content.innerHTML = html;
      } else if (currentGroup === 'status') {
        const statusOrder = ['PLAN REVIEW', 'IN_PROGRESS', 'PR_OPEN', 'VERIFIED', 'DEPLOYED', 'COMPLETED'];
        const groups = {};
        for (const t of filtered) {
          const k = t.status || 'OTHER';
          if (!groups[k]) groups[k] = [];
          groups[k].push(t);
        }
        const sortedKeys = Object.keys(groups).sort((a, b) => {
          const ia = statusOrder.indexOf(a);
          const ib = statusOrder.indexOf(b);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return a.localeCompare(b);
        });
        const html = sortedKeys.map(st => \`
          <div class="group-section">
            <div class="group-header">\${escapeHtml(st)} (\${groups[st].length})</div>
            <ul class="link-list">
              \${groups[st].map(t => \`
                <li class="link-item">
                  <a href="./\${t.slug}/" class="bare-link">\${escapeHtml(t.title)}</a>
                </li>
              \`).join('')}
            </ul>
          </div>
        \`).join('');
        content.innerHTML = html;
      }

      document.querySelectorAll('.group-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.group === currentGroup);
      });
    }

    const filterInput = document.getElementById('filterInput');
    filterInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      render();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== filterInput) {
        e.preventDefault();
        filterInput.focus();
        filterInput.select();
      }
    });

    render();
  </script>
</body>
</html>`;

  const indexFile = path.join(REPORTS_DIR, 'index.html');
  fs.writeFileSync(indexFile, html, 'utf-8');
  try { fs.chmodSync(indexFile, 0o644); } catch {}
}

function hostTaskDashboard(args) {
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const specId = getArg('--task') || getArg('--folder');
  if (!specId) {
    console.error('❌ Error: --task <spec_id> is required.');
    process.exit(1);
  }

  const cleanSpecId = specId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const taskDir = path.join(REPORTS_DIR, cleanSpecId);
  fs.mkdirSync(taskDir, { recursive: true });

  const title = getArg('--title') || cleanSpecId;
  const project = getArg('--project') || 'starfocus';
  const status = getArg('--status') || 'PLAN REVIEW';
  const prUrl = getArg('--pr-url');
  const prNumber = getArg('--pr-number');

  // Copy files if passed
  const visualPlan = getArg('--visual-plan');
  if (visualPlan && fs.existsSync(visualPlan)) {
    fs.copyFileSync(visualPlan, path.join(taskDir, 'visual-plan.html'));
  }

  const writtenPlan = getArg('--written-plan');
  if (writtenPlan && fs.existsSync(writtenPlan)) {
    const ext = path.extname(writtenPlan).toLowerCase();
    const dest = ext === '.md' ? path.join(taskDir, 'plan.md') : path.join(taskDir, 'plan.html');
    fs.copyFileSync(writtenPlan, dest);
  }

  const specFile = getArg('--spec');
  if (specFile && fs.existsSync(specFile)) {
    fs.copyFileSync(specFile, path.join(taskDir, 'spec.md'));
  }

  const symboldiff = getArg('--symboldiff') || getArg('--pr-diff');
  if (symboldiff && fs.existsSync(symboldiff)) {
    fs.copyFileSync(symboldiff, path.join(taskDir, 'symboldiff.html'));
  }

  // Save metadata
  const meta = {
    specId: cleanSpecId,
    title,
    project,
    status,
    prUrl,
    prNumber,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(taskDir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf-8');

  // Render index.html
  const dashboardHtml = generateTaskDashboardHtml(meta);
  fs.writeFileSync(path.join(taskDir, 'index.html'), dashboardHtml, 'utf-8');

  updateIndexHtml();

  const { ip, magicDns } = getTailscaleInfo();
  const dashboardUrl = magicDns ? `${magicDns}/${cleanSpecId}/` : (ip ? `http://${ip}:8787/${cleanSpecId}/` : `http://localhost:8787/${cleanSpecId}/`);

  console.log(`\nTask Dashboard Created for '${cleanSpecId}'`);
  console.log(`Folder:    ${taskDir}`);
  console.log(`Dashboard: ${dashboardUrl}`);
  console.log(`Hub:       ${magicDns ? `${magicDns}/` : 'http://localhost:8787/'}\n`);

  return dashboardUrl;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(`
share: Share artifacts, visualizers, diffs & task dashboards on Tailscale

USAGE:
  # Share a single HTML file:
  share <file.html> [--name <slug>] [--open]

  # Share a full Task Dashboard bundle ($SPEC_ID folder):
  share --task <spec_id> \\
        [--title "Spec Title"] \\
        [--project "banerry"] \\
        [--status "PLAN REVIEW|IN_PROGRESS|PR_OPEN|VERIFIED|DEPLOYED"] \\
        [--visual-plan <path/to/visual-plan.html>] \\
        [--written-plan <path/to/plan.md>] \\
        [--spec <path/to/spec.md>] \\
        [--pr-url <url>] \\
        [--symboldiff <path/to/symboldiff.html>]

EXAMPLES:
  share /tmp/symboldiff.html --name banerry-diff
  share --task canvas-section_y2vtpcom --title "Canvas section" --visual-plan ./plan.html
  share --status

ALIASES:
  host-report, serve-report
`);
    process.exit(0);
  }

  // Ensure directory exists
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  if (args.includes('--task') || args.includes('--folder')) {
    hostTaskDashboard(args);
    return;
  }

  if (args.includes('--refresh') || (args.length === 1 && args.includes('--status'))) {
    updateIndexHtml();
    const { ip, magicDns } = getTailscaleInfo();
    console.log(`\nTailscale Share Hub Status:`);
    console.log(`Location:   ${REPORTS_DIR}`);
    if (magicDns) console.log(`MagicDNS:   ${magicDns}`);
    if (ip)       console.log(`Tailnet IP: http://${ip}:8787/`);
    console.log(`Local:      file://${REPORTS_DIR}/index.html\n`);
    process.exit(0);
  }

  const fileArg = args.find(a => !a.startsWith('-'));
  if (!fileArg || !fs.existsSync(fileArg)) {
    console.error(`Error: File '${fileArg}' does not exist.`);
    process.exit(1);
  }

  const nameIdx = args.indexOf('--name');
  let slug = nameIdx !== -1 && args[nameIdx + 1] ? args[nameIdx + 1] : path.basename(fileArg, path.extname(fileArg));
  slug = slug.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

  const destFile = path.join(REPORTS_DIR, `${slug}.html`);
  fs.copyFileSync(fileArg, destFile);
  try { fs.chmodSync(destFile, 0o644); } catch {}

  updateIndexHtml();

  const { ip, magicDns } = getTailscaleInfo();
  const phoneUrl = magicDns ? `${magicDns}/${slug}.html` : (ip ? `http://${ip}:8787/${slug}.html` : `http://localhost:8787/${slug}.html`);
  const hubUrl = magicDns ? `${magicDns}/` : (ip ? `http://${ip}:8787/` : `http://localhost:8787/`);

  console.log(`\nHosted Report: '${slug}'`);
  console.log(`Saved to:   ${destFile}`);
  console.log(`Phone / Remote URL: ${phoneUrl}`);
  console.log(`Reports Hub:        ${hubUrl}`);
  console.log(`Local:              file://${destFile}\n`);

  if (args.includes('--open')) {
    const openCmd = process.platform === 'darwin' ? 'open' : (process.platform === 'win32' ? 'start' : 'xdg-open');
    execSync(`${openCmd} "${destFile}" 2>/dev/null || true`);
  }
}

main();
