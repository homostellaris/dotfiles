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

  let statusClass = 'status-plan';
  if (meta.status === 'IN_PROGRESS' || meta.status === 'IMPLEMENTING') statusClass = 'status-progress';
  if (meta.status === 'PR_OPEN' || meta.status === 'AWAITING_PR_REVIEW') statusClass = 'status-pr';
  if (meta.status === 'VERIFIED' || meta.status === 'APPROVED') statusClass = 'status-verified';
  if (meta.status === 'DEPLOYED' || meta.status === 'COMPLETED') statusClass = 'status-deployed';

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
  <title>${title} | Task Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --surface: #101726;
      --surface-border: #1e293b;
      --surface-hover: #172238;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-soft: rgba(56, 189, 248, 0.12);
      --success: #34d399;
      --warning: #fbbf24;
      --purple: #c084fc;
      --font-sans: 'Inter', system-ui, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      background: rgba(16, 23, 38, 0.95);
      border-bottom: 1px solid var(--surface-border);
      padding: 1rem 1.25rem;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(12px);
    }

    .header-container {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    @media (min-width: 768px) {
      header { padding: 1.25rem 2rem; }
      .header-container {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
      }
    }

    .meta-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-family: var(--font-mono);
    }

    .status-plan { background: rgba(56, 189, 248, 0.15); color: var(--accent); border: 1px solid rgba(56, 189, 248, 0.3); }
    .status-progress { background: rgba(251, 191, 36, 0.15); color: var(--warning); border: 1px solid rgba(251, 191, 36, 0.3); }
    .status-pr { background: rgba(192, 132, 252, 0.15); color: var(--purple); border: 1px solid rgba(192, 132, 252, 0.3); }
    .status-verified { background: rgba(52, 211, 153, 0.15); color: var(--success); border: 1px solid rgba(52, 211, 153, 0.3); }
    .status-deployed { background: rgba(52, 211, 153, 0.25); color: #fff; border: 1px solid var(--success); }

    .tag-pill {
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 6px;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    h1 {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #fff;
      margin-top: 0.1rem;
    }

    @media (min-width: 768px) {
      h1 { font-size: 1.5rem; }
    }

    .main-nav {
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      padding: 0.75rem 1rem 0;
      display: flex;
      gap: 0.4rem;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .main-nav::-webkit-scrollbar { display: none; }

    .nav-tab {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      color: var(--text-muted);
      padding: 0.5rem 0.9rem;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      text-decoration: none;
      transition: all 0.15s ease;
    }

    .nav-tab:hover {
      background: var(--surface-hover);
      color: #fff;
    }

    .nav-tab.active {
      background: #1e293b;
      color: #fff;
      border-color: var(--accent);
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    }

    .content-container {
      max-width: 1200px;
      width: 100%;
      margin: 1rem auto 3rem;
      padding: 0 1rem;
      flex-grow: 1;
    }

    .tab-content {
      display: none;
      animation: fadeIn 0.15s ease-in-out;
    }

    .tab-content.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
    }

    @media (min-width: 768px) {
      .card { padding: 1.75rem; }
    }

    .card h2 {
      font-size: 1.15rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    @media (min-width: 768px) {
      .grid-2 { grid-template-columns: repeat(2, 1fr); gap: 1.25rem; }
    }

    .grid-3 {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    @media (min-width: 768px) {
      .grid-3 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; }
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--accent);
      color: #090d16;
      font-weight: 700;
      font-size: 0.85rem;
      padding: 0.6rem 1.1rem;
      border-radius: 8px;
      text-decoration: none;
      transition: all 0.15s ease;
      width: fit-content;
    }

    .action-btn:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .action-btn.secondary {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      color: var(--text);
    }

    .action-btn.secondary:hover {
      background: var(--surface-hover);
      border-color: var(--accent);
    }

    .tab-iframe {
      width: 100%;
      height: 80vh;
      min-height: 600px;
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      background: #090d16;
    }

    .prose {
      font-size: 0.9rem;
      line-height: 1.65;
      color: #cbd5e1;
    }

    .prose h1, .prose h2, .prose h3 {
      color: #fff;
      margin: 1.25rem 0 0.5rem;
    }

    .prose code {
      font-family: var(--font-mono);
      background: #0b111e;
      padding: 0.15rem 0.35rem;
      border-radius: 4px;
      font-size: 0.82rem;
      color: var(--accent);
      border: 1px solid rgba(255,255,255,0.05);
    }

    .prose pre.code-block {
      background: #050811;
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      padding: 1rem;
      overflow-x: auto;
      margin: 0.75rem 0;
    }

    .prose pre.code-block code {
      background: transparent;
      padding: 0;
      border: none;
      color: #e2e8f0;
    }

    .prose ul {
      padding-left: 1.25rem;
      margin: 0.5rem 0;
    }

    .prose li {
      margin-bottom: 0.35rem;
    }

    .prose .alert {
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin: 0.75rem 0;
      border-left: 4px solid;
    }

    .prose .alert-note { background: rgba(56,189,248,0.1); border-color: var(--accent); }
    .prose .alert-tip { background: rgba(52,211,153,0.1); border-color: var(--success); }
    .prose .alert-important { background: rgba(192,132,252,0.1); border-color: var(--purple); }
    .prose .alert-warning { background: rgba(251,191,36,0.1); border-color: var(--warning); }
  </style>
</head>
<body>

  <header>
    <div class="header-container">
      <div>
        <div class="meta-row">
          <span class="badge ${statusClass}">${status}</span>
          <span class="tag-pill">📁 ${project}</span>
          <span class="tag-pill">🔑 ${specId}</span>
        </div>
        <h1>${title}</h1>
      </div>
      <div>
        <a href="../index.html" style="color: var(--accent); text-decoration: none; font-size: 0.82rem; font-weight: 600;">← All Tasks & Hub</a>
      </div>
    </div>
  </header>

  <nav class="main-nav">
    <button class="nav-tab active" onclick="switchTab('overview')">🧭 Overview</button>
    ${hasVisualPlan ? `<button class="nav-tab" onclick="switchTab('visual-plan')">🎨 Visual Plan</button>` : ''}
    ${hasWrittenPlan ? `<button class="nav-tab" onclick="switchTab('written-plan')">📝 Written Plan</button>` : ''}
    ${hasSymbolDiff || prUrl ? `<button class="nav-tab" onclick="switchTab('pr')">📌 PR & Diffs</button>` : ''}
    ${hasSpec ? `<button class="nav-tab" onclick="switchTab('spec')">📋 Spec Source</button>` : ''}
  </nav>

  <main class="content-container">

    <!-- OVERVIEW TAB -->
    <div id="tab-overview" class="tab-content active">
      <div class="grid-2">
        
        <div class="card">
          <h2>Task Summary</h2>
          <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1rem;">
            Autonomous feature delivery tracking for <strong>${title}</strong>.
          </p>

          <div style="display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.85rem;">
            <div><strong>Spec Identifier:</strong> <code>${specId}</code></div>
            <div><strong>Target Repository:</strong> <code>~/code/homostellaris/${project}</code></div>
            <div><strong>Isolated Worktree:</strong> <code>.worktrees/${specId}</code></div>
            <div><strong>Feature Branch:</strong> <code>${specId}</code></div>
            <div><strong>Last Updated:</strong> ${updatedAt}</div>
          </div>

          <div style="display: flex; gap: 0.6rem; margin-top: 1.25rem; flex-wrap: wrap;">
            <a href="https://wa.me/447812754124?text=approve%20${specId}" class="action-btn" target="_blank">
              💬 Approve on WhatsApp
            </a>
            ${prUrl ? `<a href="${prUrl}" class="action-btn secondary" target="_blank">View GitHub PR ↗</a>` : ''}
          </div>
        </div>

        <div class="card">
          <h2>Artifacts in Folder</h2>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${hasVisualPlan ? `
              <div style="display: flex; justify-content: space-between; align-items: center; background: #0b111e; padding: 0.6rem 0.85rem; border-radius: 8px; border: 1px solid var(--surface-border);">
                <div>
                  <div style="font-weight: 600; font-size: 0.85rem; color: #fff;">🎨 Visual Plan</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Interactive UI wireframes & architecture</div>
                </div>
                <button onclick="switchTab('visual-plan')" class="action-btn secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">View</button>
              </div>` : ''}

            ${hasWrittenPlan ? `
              <div style="display: flex; justify-content: space-between; align-items: center; background: #0b111e; padding: 0.6rem 0.85rem; border-radius: 8px; border: 1px solid var(--surface-border);">
                <div>
                  <div style="font-weight: 600; font-size: 0.85rem; color: #fff;">📝 Written Plan</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Technical contract, file map & phases</div>
                </div>
                <button onclick="switchTab('written-plan')" class="action-btn secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">View</button>
              </div>` : ''}

            ${hasSymbolDiff ? `
              <div style="display: flex; justify-content: space-between; align-items: center; background: #0b111e; padding: 0.6rem 0.85rem; border-radius: 8px; border: 1px solid var(--surface-border);">
                <div>
                  <div style="font-weight: 600; font-size: 0.85rem; color: #fff;">⚡ SymbolDiff Review</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Type and function signature diffs</div>
                </div>
                <button onclick="switchTab('pr')" class="action-btn secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">View</button>
              </div>` : ''}

            ${hasSpec ? `
              <div style="display: flex; justify-content: space-between; align-items: center; background: #0b111e; padding: 0.6rem 0.85rem; border-radius: 8px; border: 1px solid var(--surface-border);">
                <div>
                  <div style="font-weight: 600; font-size: 0.85rem; color: #fff;">📋 StarFocus Spec</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Obsidian todo specification</div>
                </div>
                <button onclick="switchTab('spec')" class="action-btn secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">View</button>
              </div>` : ''}
          </div>
        </div>

      </div>
    </div>

    <!-- VISUAL PLAN TAB -->
    ${hasVisualPlan ? `
    <div id="tab-visual-plan" class="tab-content">
      <div class="card" style="padding: 0.75rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; padding: 0 0.5rem;">
          <h2 style="margin: 0; font-size: 1rem;">🎨 Interactive Visual Plan</h2>
          <a href="./visual-plan.html" target="_blank" class="action-btn secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">Open Full Page ↗</a>
        </div>
        <iframe src="./visual-plan.html" class="tab-iframe" title="Visual Plan"></iframe>
      </div>
    </div>` : ''}

    <!-- WRITTEN PLAN TAB -->
    ${hasWrittenPlan ? `
    <div id="tab-written-plan" class="tab-content">
      <div class="card">
        <h2>📝 Written Technical Implementation Plan</h2>
        <div class="prose">
          ${writtenPlanContent}
        </div>
      </div>
    </div>` : ''}

    <!-- PR & DIFF TAB -->
    ${hasSymbolDiff || prUrl ? `
    <div id="tab-pr" class="tab-content">
      <div class="card" style="padding: 0.75rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; padding: 0 0.5rem;">
          <h2 style="margin: 0; font-size: 1rem;">⚡ Pull Request & SymbolDiff Review</h2>
          ${prUrl ? `<a href="${prUrl}" target="_blank" class="action-btn" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">Open PR #${prNumber || ''} on GitHub ↗</a>` : ''}
        </div>
        ${hasSymbolDiff ? `<iframe src="./symboldiff.html" class="tab-iframe" title="Symbol Diff"></iframe>` : `<p style="padding: 1rem; color: var(--text-muted);">Pull request opened at <a href="${prUrl}" target="_blank">${prUrl}</a></p>`}
      </div>
    </div>` : ''}

    <!-- SPEC TAB -->
    ${hasSpec ? `
    <div id="tab-spec" class="tab-content">
      <div class="card">
        <h2>📋 StarFocus Obsidian Specification</h2>
        <div class="prose">
          ${specContent}
        </div>
      </div>
    </div>` : ''}

  </main>

  <script>
    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
      const activeContent = document.getElementById('tab-' + tabId);
      if (activeContent) activeContent.classList.add('active');

      const matchingButton = Array.from(document.querySelectorAll('.nav-tab')).find(b => b.getAttribute('onclick')?.includes(tabId));
      if (matchingButton) matchingButton.classList.add('active');
    }
  </script>
</body>
</html>`;
}

function updateIndexHtml() {
  if (!fs.existsSync(REPORTS_DIR)) return;

  const entries = fs.readdirSync(REPORTS_DIR, { withFileTypes: true });

  // 1. Task folders (directories with an index.html)
  const taskFolders = entries
    .filter(d => d.isDirectory())
    .map(d => {
      const folderPath = path.join(REPORTS_DIR, d.name);
      const indexPath = path.join(folderPath, 'index.html');
      const metaPath = path.join(folderPath, 'metadata.json');
      if (!fs.existsSync(indexPath)) return null;

      let meta = { specId: d.name, title: d.name, project: 'starfocus', status: 'IN_PROGRESS' };
      if (fs.existsSync(metaPath)) {
        try { meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf-8')) }; } catch {}
      }

      const stat = fs.statSync(indexPath);
      return {
        slug: d.name,
        title: meta.title || d.name,
        project: meta.project || 'starfocus',
        status: meta.status || 'IN_PROGRESS',
        mtime: stat.mtime,
        hasVisualPlan: fs.existsSync(path.join(folderPath, 'visual-plan.html')),
        hasWrittenPlan: fs.existsSync(path.join(folderPath, 'plan.html')) || fs.existsSync(path.join(folderPath, 'plan.md')),
        hasPR: fs.existsSync(path.join(folderPath, 'symboldiff.html')) || !!meta.prUrl,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  // 2. Standalone HTML files
  const standaloneFiles = entries
    .filter(d => d.isFile() && d.name.endsWith('.html') && d.name !== 'index.html')
    .map(d => {
      const filePath = path.join(REPORTS_DIR, d.name);
      const stat = fs.statSync(filePath);
      return {
        name: d.name,
        slug: d.name.replace(/\.html$/, ''),
        mtime: stat.mtime,
        size: stat.size
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const taskCards = taskFolders.map(t => {
    const formattedDate = t.mtime.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    return `
      <div class="task-dashboard-card">
        <div class="task-card-main">
          <div class="card-icon" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">📁</div>
          <div class="card-body">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span class="badge" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.25);">${escapeHtml(t.status)}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(t.project)}</span>
            </div>
            <a href="./${t.slug}/" class="card-title" style="text-decoration: none; display: block; margin-top: 0.25rem;">
              ${escapeHtml(t.title)}
            </a>
            <div class="card-meta">
              <span>🔑 ${escapeHtml(t.slug)}</span>
              <span>📅 ${formattedDate}</span>
            </div>
          </div>
        </div>
        <div class="task-sublinks">
          <a href="./${t.slug}/" class="sublink-btn primary">Dashboard ➔</a>
          ${t.hasVisualPlan ? `<a href="./${t.slug}/visual-plan.html" class="sublink-btn">Visual Plan</a>` : ''}
          ${t.hasWrittenPlan ? `<a href="./${t.slug}/#written-plan" class="sublink-btn">Written Plan</a>` : ''}
          ${t.hasPR ? `<a href="./${t.slug}/#pr" class="sublink-btn">PR & Diff</a>` : ''}
        </div>
      </div>
    `;
  }).join('\n');

  const standaloneListItems = standaloneFiles.map(e => {
    const formattedDate = e.mtime.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const sizeKb = Math.round(e.size / 1024);
    return `
      <a class="report-card" href="./${e.name}">
        <div class="card-icon">📊</div>
        <div class="card-body">
          <div class="card-title">${e.slug}</div>
          <div class="card-meta">
            <span>📅 ${formattedDate}</span>
            <span>💾 ${sizeKb} KB</span>
          </div>
        </div>
        <div class="card-arrow">➔</div>
      </a>
    `;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Reports & Task Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #090d13;
      --bg-secondary: #0d1117;
      --bg-surface: #161b22;
      --bg-hover: #21262d;
      --border: #30363d;
      --accent: #58a6ff;
      --text: #f0f6fc;
      --text-muted: #8b949e;
      --font-sans: 'Inter', system-ui, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-primary);
      color: var(--text);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 16px;
    }
    .container {
      width: 100%;
      max-width: 800px;
    }
    header {
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      background: linear-gradient(135deg, #58a6ff, #bc8cff);
      color: #fff;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    h1 { font-size: 20px; font-weight: 700; }
    .badge {
      font-family: var(--font-mono);
      font-size: 11px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      padding: 3px 8px;
      border-radius: 6px;
      color: var(--text-muted);
    }
    .search-input {
      width: 100%;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      color: var(--text);
      font-size: 14px;
      margin-bottom: 20px;
      outline: none;
    }
    .search-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(88,166,255,0.15);
    }
    .section-heading {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin: 24px 0 12px;
      font-weight: 700;
    }
    .report-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .task-dashboard-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
      transition: all 0.15s ease;
    }
    .task-dashboard-card:hover {
      border-color: var(--accent);
      background: var(--bg-surface);
    }
    .task-card-main {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .task-sublinks {
      display: flex;
      gap: 6px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.06);
      flex-wrap: wrap;
    }
    .sublink-btn {
      font-size: 11px;
      padding: 3px 8px;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-muted);
      text-decoration: none;
      font-weight: 500;
      transition: all 0.1s ease;
    }
    .sublink-btn:hover {
      color: var(--text);
      border-color: var(--accent);
    }
    .sublink-btn.primary {
      background: rgba(88,166,255,0.15);
      color: var(--accent);
      border-color: rgba(88,166,255,0.3);
      font-weight: 600;
    }
    .report-card {
      display: flex;
      align-items: center;
      gap: 14px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      text-decoration: none;
      color: inherit;
      transition: all 0.15s ease;
    }
    .report-card:hover {
      background: var(--bg-surface);
      border-color: var(--accent);
      transform: translateY(-1px);
    }
    .card-icon {
      font-size: 20px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .card-body {
      flex-grow: 1;
      overflow: hidden;
    }
    .card-title {
      font-weight: 600;
      font-size: 14px;
      color: var(--text);
      font-family: var(--font-sans);
    }
    .card-meta {
      display: flex;
      gap: 14px;
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 3px;
    }
    .card-arrow {
      color: var(--text-muted);
      font-size: 16px;
      font-weight: 600;
    }
    .empty-state {
      text-align: center;
      padding: 32px 0;
      color: var(--text-muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-icon">🌐</div>
        <div>
          <h1>Agent Reports & Tasks Hub</h1>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Hosted privately via Tailscale</div>
        </div>
      </div>
      <span class="badge">${taskFolders.length} tasks • ${standaloneFiles.length} reports</span>
    </header>

    <input type="text" id="filterInput" class="search-input" placeholder="Filter tasks and reports..." autocomplete="off">

    ${taskFolders.length > 0 ? `
      <div class="section-heading">📁 Task Dashboards ($SPEC_ID)</div>
      <div class="report-grid" id="taskGrid">
        ${taskCards}
      </div>
    ` : ''}

    <div class="section-heading">📊 Standalone Reports & Visualizers</div>
    <div class="report-grid" id="reportGrid">
      ${standaloneListItems || '<div class="empty-state">No standalone reports hosted yet.</div>'}
    </div>
  </div>

  <script>
    const filterInput = document.getElementById('filterInput');
    filterInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.task-dashboard-card, .report-card').forEach(card => {
        const text = card.innerText.toLowerCase();
        card.style.display = text.includes(q) ? '' : 'none';
      });
    });
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

  console.log(`\n✅ Task Dashboard Created for '${cleanSpecId}'`);
  console.log(`📂 Folder:    ${taskDir}`);
  console.log(`📱 Dashboard: ${dashboardUrl}`);
  console.log(`🌐 Hub:       ${magicDns ? `${magicDns}/` : 'http://localhost:8787/'}\n`);

  return dashboardUrl;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(`
🌐 share: Share artifacts, visualizers, diffs & task dashboards on Tailscale

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

  if (args.length === 1 && args.includes('--status')) {
    const { ip, magicDns } = getTailscaleInfo();
    console.log(`\n🌐 Tailscale Reports Hub Status:`);
    console.log(`📂 Location:   ${REPORTS_DIR}`);
    if (magicDns) console.log(`🔗 MagicDNS:   ${magicDns}`);
    if (ip)       console.log(`📱 Tailnet IP: http://${ip}:8787/`);
    console.log(`💻 Local:      file://${REPORTS_DIR}/index.html\n`);
    process.exit(0);
  }

  const fileArg = args.find(a => !a.startsWith('-'));
  if (!fileArg || !fs.existsSync(fileArg)) {
    console.error(`❌ Error: File '${fileArg}' does not exist.`);
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

  console.log(`\n✅ Hosted Report: '${slug}'`);
  console.log(`📂 Saved to:   ${destFile}`);
  console.log(`📱 Phone / Remote URL: ${phoneUrl}`);
  console.log(`🌐 Reports Hub:        ${hubUrl}`);
  console.log(`💻 Local:              file://${destFile}\n`);

  if (args.includes('--open')) {
    const openCmd = process.platform === 'darwin' ? 'open' : (process.platform === 'win32' ? 'start' : 'xdg-open');
    execSync(`${openCmd} "${destFile}" 2>/dev/null || true`);
  }
}

main();
