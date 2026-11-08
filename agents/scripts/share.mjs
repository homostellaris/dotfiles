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

function resolveShareDir() {
  if (process.env.SHARE_DIR && process.env.SHARE_DIR.trim() !== '') {
    return path.resolve(process.env.SHARE_DIR);
  }
  if (process.env.XDG_PUBLICSHARE_DIR && process.env.XDG_PUBLICSHARE_DIR.trim() !== '' && process.env.XDG_PUBLICSHARE_DIR !== os.homedir()) {
    return path.resolve(process.env.XDG_PUBLICSHARE_DIR);
  }
  try {
    const queried = execSync('xdg-user-dir PUBLICSHARE 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (queried && queried !== os.homedir() && fs.existsSync(queried)) {
      return queried;
    }
  } catch {}

  const defaultPublic = path.join(os.homedir(), 'Public');
  if (fs.existsSync(defaultPublic)) return defaultPublic;

  const legacyWorkTasks = path.join(os.homedir(), 'Work', 'tasks');
  if (fs.existsSync(legacyWorkTasks)) return legacyWorkTasks;

  const legacyShare = path.join(os.homedir(), 'share');
  if (fs.existsSync(legacyShare)) return legacyShare;

  const legacyAgentReports = path.join(os.homedir(), '.local/share/agent-reports');
  if (fs.existsSync(legacyAgentReports)) return legacyAgentReports;

  return defaultPublic;
}

const REPORTS_DIR = resolveShareDir();

function getTailscaleInfo() {
  let hostname = 'panther';
  let ip = null;
  let magicDns = 'https://panther.tail29c7da.ts.net';

  try {
    const statusJson = execSync('tailscale status --json 2>/dev/null', { encoding: 'utf-8', timeout: 1000 });
    const status = JSON.parse(statusJson);
    if (status.Self) {
      hostname = status.Self.HostName || hostname;
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

function decodeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

function escapeHtml(str) {
  if (!str) return '';
  return decodeHtmlEntities(str)
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

    <a href="/" class="task-nav-back">← Portal</a>

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

function generatePortalHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Homo Stellaris</title>
  
  <!-- PWA Manifest & Meta Tags -->
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#050609">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Portal">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Honk&family=Lexend:wght@700;800;900&family=Press+Start+2P&family=Fredoka:wght@700;800;900&family=JetBrains+Mono:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    @font-palette-values --redshift {
      font-family: Honk;
      override-colors:
        2 #60a5fa,
        3 #a78bfa,
        4 #e879f9,
        5 #fb7185,
        6 #f43f5e,
        7 #881337;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    html, body {
      width: 100%;
      height: 100%;
      background: #050609;
      color: #fff;
      overflow-x: hidden;
    }

    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      min-height: 100dvh;
      padding: 2rem 1.5rem;
    }

    .portal-nav {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: clamp(1.8rem, 4.5vh, 3.2rem);
      width: 100%;
      max-width: 900px;
    }

    .area-item {
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.32em;
      line-height: 1.1;
      text-align: center;
      user-select: none;
      outline: none;
    }

    .area-emoji {
      font-size: 0.85em;
      line-height: 1;
      display: inline-block;
      vertical-align: middle;
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.2s ease;
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.4));
    }

    /* 1. tasks */
    .area-tasks {
      font-family: "Press Start 2P", monospace;
      font-size: clamp(1.4rem, 3.2vw, 2.4rem);
      letter-spacing: -0.02em;
      color: #4deeea;
      text-shadow: 0 0 10px rgba(77, 238, 234, 0.35);
      transition: transform 0.15s ease, color 0.15s ease, text-shadow 0.15s ease;
    }
    .area-tasks:hover, .area-tasks:focus-visible {
      color: #ffe600;
      transform: translateX(8px) scale(1.05);
      text-shadow: 0 0 16px #4deeea, 0 0 35px #4deeea, 3px 3px 0 #000;
    }
    .area-tasks:hover .area-emoji {
      transform: scale(1.22) rotate(-8deg);
      filter: drop-shadow(0 0 12px rgba(77, 238, 234, 0.7));
    }
    .area-tasks:active {
      transform: translateX(4px) scale(0.98);
    }

    /* 2. zach */
    .area-zach {
      font-family: "Fredoka", "Press Start 2P", cursive, sans-serif;
      font-weight: 900;
      font-size: clamp(2.4rem, 5.8vw, 4.2rem);
      color: #ffb703;
      text-shadow: 0 2px 10px rgba(255, 183, 3, 0.25);
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.2s ease, text-shadow 0.25s ease;
    }
    .area-zach:hover, .area-zach:focus-visible {
      color: #ffe838;
      transform: scale(1.12) rotate(-2deg);
      text-shadow: 0 0 25px rgba(255, 183, 3, 0.8), 0 0 50px rgba(255, 183, 3, 0.5), 0 6px 14px rgba(0,0,0,0.6);
    }
    .area-zach:hover .area-emoji {
      transform: scale(1.25) rotate(15deg);
      filter: drop-shadow(0 0 16px rgba(255, 183, 3, 0.85));
    }
    .area-zach:active {
      transform: scale(0.98) rotate(1deg);
    }

    /* 3. daily briefs */
    .area-briefs {
      font-family: "JetBrains Mono", monospace;
      font-weight: 700;
      font-size: clamp(1.8rem, 4.4vw, 3.2rem);
      letter-spacing: 0.02em;
      color: #34d399;
      text-shadow: 0 0 10px rgba(52, 211, 153, 0.35);
      transition: transform 0.2s ease, letter-spacing 0.2s ease, text-shadow 0.2s ease, color 0.2s ease;
    }
    .area-briefs::after {
      content: "_";
      display: inline-block;
      color: #34d399;
      margin-left: 0.06em;
      animation: cursor-blink 1.1s step-start infinite;
    }
    @keyframes cursor-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    .area-briefs:hover, .area-briefs:focus-visible {
      color: #6ee7b7;
      letter-spacing: 0.08em;
      transform: translateX(10px) scale(1.04);
      text-shadow: 0 0 20px rgba(52, 211, 153, 0.9), 0 0 45px rgba(52, 211, 153, 0.6);
    }
    .area-briefs:hover .area-emoji {
      transform: scale(1.22) translateY(-2px);
      filter: drop-shadow(0 0 12px rgba(52, 211, 153, 0.75));
    }
    .area-briefs:active {
      transform: translateX(4px) scale(0.98);
    }

    /* 4. starfocus */
    .area-starfocus {
      font-family: "Honk", system-ui;
      font-palette: --redshift;
      font-variation-settings: "MORF" 15, "SHLN" 50;
      font-size: clamp(2.6rem, 6.4vw, 4.8rem);
      cursor: crosshair;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease;
      filter: drop-shadow(0 0 10px rgba(244, 63, 94, 0.3));
    }
    .area-starfocus:hover, .area-starfocus:focus-visible {
      transform: scale(1.1);
      filter: drop-shadow(0 0 24px rgba(244, 63, 94, 0.85)) drop-shadow(0 0 55px rgba(96, 165, 250, 0.7));
      font-variation-settings: "MORF" 30, "SHLN" 80;
    }
    .area-starfocus:active {
      transform: scale(0.98);
    }
    .starfocus-logo {
      width: 0.88em;
      height: 0.88em;
      object-fit: contain;
      display: inline-block;
      vertical-align: middle;
      border-radius: 50%;
      filter: drop-shadow(0 0 10px rgba(96, 165, 250, 0.4));
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease;
    }
    .area-starfocus:hover .starfocus-logo {
      transform: scale(1.16) rotate(12deg);
      filter: drop-shadow(0 0 20px rgba(96, 165, 250, 0.9)) drop-shadow(0 0 40px rgba(244, 63, 94, 0.7));
    }
    .area-starfocus:active .starfocus-logo {
      transform: scale(0.96);
    }

    /* 5. Banerry */
    .area-banerry {
      font-family: "Lexend", sans-serif;
      font-weight: 900;
      font-size: clamp(2.4rem, 5.8vw, 4.4rem);
      background: linear-gradient(135deg, #22c55e 0%, #eab308 50%, #ef4444 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 2px 8px rgba(34, 197, 94, 0.25));
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.25s ease;
    }
    .area-banerry:hover, .area-banerry:focus-visible {
      transform: scale(1.08) translateY(-3px);
      filter: drop-shadow(0 4px 20px rgba(34, 197, 94, 0.6)) drop-shadow(0 8px 30px rgba(239, 68, 68, 0.5));
    }
    .area-banerry:active {
      transform: scale(0.98) translateY(1px);
    }
    .banerry-logo {
      width: 0.88em;
      height: 0.88em;
      display: inline-block;
      vertical-align: middle;
      filter: drop-shadow(0 2px 8px rgba(34, 197, 94, 0.35));
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .area-banerry:hover .banerry-logo {
      transform: scale(1.15) rotate(6deg);
    }
  </style>
</head>
<body>
  <nav class="portal-nav" aria-label="Areas">
    <a href="/tasks/" class="area-item area-tasks">
      <span class="area-emoji">📋</span>
      <span>tasks</span>
    </a>
    <a href="/zach/" class="area-item area-zach">
      <span class="area-emoji">🌟</span>
      <span>zach</span>
    </a>
    <a href="/daily-briefs/" class="area-item area-briefs">
      <span class="area-emoji">🎙️</span>
      <span>daily briefs</span>
    </a>
    <a href="/starfocus/" class="area-item area-starfocus">
      <img src="/starfocus-logo.png" class="starfocus-logo" alt="" aria-hidden="true">
      <span>starfocus</span>
    </a>
    <a href="/banerry/" class="area-item area-banerry">
      <svg class="banerry-logo" viewBox="0 0 847 942" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M156.252 641C118.752 611 62.2525 604 17.7524 641C3.75237 583 -12.2476 492.5 14.2524 411C50.2524 312.5 97.2523 278.5 152.752 251.5C208.252 224.5 257.538 243 265.752 277.5C273.966 312 280.752 348.5 198.252 372C115.753 395.5 109.252 468.5 134.252 515.5C159.252 562.5 207.752 561.5 304.252 561.5C400.752 561.5 443.752 677.5 391.752 739C339.752 800.5 263.753 781 234.752 758.5C205.752 736 198.752 673.5 156.252 641Z" fill="#ef4444" />
        <path d="M212.752 777C190.752 756 178.252 704.5 136.752 662C95.2523 619.5 35.6491 661.214 25.7524 668C30.2524 685.5 38.7524 713.5 60.2524 758C83.7964 806.731 111.252 849.5 164.752 900.5C207.552 941.3 261.752 944.5 296.752 940C249.252 899.5 250.752 846.5 272.752 807C258.252 802 234.753 798 212.752 777Z" fill="#fde047" />
        <path d="M281.752 244.5C290.752 256.5 306.752 285 290.252 336C273.752 387 208.252 389 170.752 416.5C133.252 444 148.689 498.451 174.752 518.5C207.252 543.5 271.252 533 299.752 532.5C322.552 532.1 341.252 538 347.752 541C345.586 534.667 343.652 515.5 353.252 489.5C365.252 457 392.252 436 407.252 402C422.252 368 419.252 314 435.252 284C405.752 286.5 379.752 262.581 349.752 250C323.791 239.113 300.252 235 290.252 234C280.252 233 272.752 232.5 281.752 244.5Z" fill="#4ade80" />
        <path d="M384.752 485.5C369.419 508.5 361.752 546 401.252 579.5C466.252 623 496.252 536 582.252 530C617.252 526.875 666.252 548.5 680.752 565C690.752 558.5 698.252 549.5 707.252 540C693.252 525.5 704.752 451.5 687.252 427.5C669.752 403.5 639.964 406.66 599.252 384.5C559.752 363 550.752 321.5 550.752 300C550.752 278.5 558.252 262 564.252 252C570.252 242 566.752 236.5 551.752 236.5C536.752 236.5 502.752 244.5 472.252 270.5C441.752 296.5 443.752 388 428.752 419.5C413.752 451 401.752 460 384.752 485.5Z" fill="#fde047" />
        <path d="M635.252 236.5C610.67 237.981 595.252 251.001 585.752 269.501C576.252 288.001 576.652 315.6 590.252 338C610.288 371 651.252 360.001 694.252 397.001C737.252 434.001 720.625 479.5 726.752 515.5C730.752 539 751.752 561.001 785.252 561.001C821.752 561.001 840.891 535.632 845.752 509.501C849.752 488 840.752 402.5 792.252 333C743.752 263.5 676.752 234 635.252 236.5Z" fill="#ef4444" />
        <path d="M309.252 817C289.735 827.054 276.252 863 291.752 891.5C316.226 936.5 354.48 916.126 406.752 909.5C442.252 905 479.252 914.5 503.752 927C493.252 909 474.752 845 522.252 803.5C577.252 758 607.252 801.5 668.752 744C704.847 704.624 705.627 652 682.252 608C665.252 576 619.658 554.544 577.752 558C529.252 562 497.252 610 450.252 616C438.042 617.559 429.192 613.5 435.252 629.5C447.752 662.5 442.502 699.5 426.252 732C395.752 793 342.252 800 309.252 817Z" fill="#4ade80" />
        <path d="M577.252 806.5C546.575 809.687 509.252 844 517.252 882.5C525.252 921 545.706 939 588.752 939C641.752 939 725.833 874.448 773.752 789.5C828.752 692 841.752 625 846.752 569.5C833.919 576 804.252 593 775.252 588C747.634 583.238 730.586 573.5 721.252 559C714.752 567 705.252 575 696.752 582C721.252 613 739.495 683.883 711.252 732C670.752 801 615.752 802.5 577.252 806.5Z" fill="#16a34a" />
        <path d="M504.252 0C442.752 0 422.252 50.5 422.252 76V207.5C422.252 216.5 428.752 222.5 435.752 222.5C463.252 222.5 497.252 168.5 524.752 168.5H607.252C625.252 168.5 675.252 146 675.252 97.5V19.5C675.252 9 669.252 0 654.252 0H504.252Z" fill="#16a34a" />
      </svg>
      <span>Banerry</span>
    </a>
  </nav>

  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
      });
    }
  </script>
</body>
</html>`;
}

function generateProjectPageHtml(projectName, items = []) {
  const isStarfocus = projectName === "starfocus";
  const title = isStarfocus ? "starfocus" : "Banerry";
  const prodUrl = isStarfocus ? "https://starfocus.app" : "https://www.banerry.app";
  const prodDisplay = isStarfocus ? "starfocus.app" : "banerry.app";
  const defaultPort = isStarfocus ? 6600 : 6700;
  const projectKey = isStarfocus ? "starfocus" : "banerry";
  const tagLine = isStarfocus 
    ? "Gamified Space Productivity App • Star Roles & Prioritisation Engine"
    : "Communication Assistance for Visual & Gestalt Language Learners";

  const banerryLogoHtml = isStarfocus ? "" : '<svg style="width: 0.88em; height: 0.88em; display: inline-block; vertical-align: middle; margin-right: 0.25em; -webkit-text-fill-color: initial;" viewBox="0 0 847 942" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M156.252 641C118.752 611 62.2525 604 17.7524 641C3.75237 583 -12.2476 492.5 14.2524 411C50.2524 312.5 97.2523 278.5 152.752 251.5C208.252 224.5 257.538 243 265.752 277.5C273.966 312 280.752 348.5 198.252 372C115.753 395.5 109.252 468.5 134.252 515.5C159.252 562.5 207.752 561.5 304.252 561.5C400.752 561.5 443.752 677.5 391.752 739C339.752 800.5 263.753 781 234.752 758.5C205.752 736 198.752 673.5 156.252 641Z" fill="#ef4444" />' +
    '<path d="M212.752 777C190.752 756 178.252 704.5 136.752 662C95.2523 619.5 35.6491 661.214 25.7524 668C30.2524 685.5 38.7524 713.5 60.2524 758C83.7964 806.731 111.252 849.5 164.752 900.5C207.552 941.3 261.752 944.5 296.752 940C249.252 899.5 250.752 846.5 272.752 807C258.252 802 234.753 798 212.752 777Z" fill="#fde047" />' +
    '<path d="M281.752 244.5C290.752 256.5 306.752 285 290.252 336C273.752 387 208.252 389 170.752 416.5C133.252 444 148.689 498.451 174.752 518.5C207.252 543.5 271.252 533 299.752 532.5C322.552 532.1 341.252 538 347.752 541C345.586 534.667 343.652 515.5 353.252 489.5C365.252 457 392.252 436 407.252 402C422.252 368 419.252 314 435.252 284C405.752 286.5 379.752 262.581 349.752 250C323.791 239.113 300.252 235 290.252 234C280.252 233 272.752 232.5 281.752 244.5Z" fill="#4ade80" />' +
    '<path d="M384.752 485.5C369.419 508.5 361.752 546 401.252 579.5C466.252 623 496.252 536 582.252 530C617.252 526.875 666.252 548.5 680.752 565C690.752 558.5 698.252 549.5 707.252 540C693.252 525.5 704.752 451.5 687.252 427.5C669.752 403.5 639.964 406.66 599.252 384.5C559.752 363 550.752 321.5 550.752 300C550.752 278.5 558.252 262 564.252 252C570.252 242 566.752 236.5 551.752 236.5C536.752 236.5 502.752 244.5 472.252 270.5C441.752 296.5 443.752 388 428.752 419.5C413.752 451 401.752 460 384.752 485.5Z" fill="#fde047" />' +
    '<path d="M635.252 236.5C610.67 237.981 595.252 251.001 585.752 269.501C576.252 288.001 576.652 315.6 590.252 338C610.288 371 651.252 360.001 694.252 397.001C737.252 434.001 720.625 479.5 726.752 515.5C730.752 539 751.752 561.001 785.252 561.001C821.752 561.001 840.891 535.632 845.752 509.501C849.752 488 840.752 402.5 792.252 333C743.752 263.5 676.752 234 635.252 236.5Z" fill="#ef4444" />' +
    '<path d="M309.252 817C289.735 827.054 276.252 863 291.752 891.5C316.226 936.5 354.48 916.126 406.752 909.5C442.252 905 479.252 914.5 503.752 927C493.252 909 474.752 845 522.252 803.5C577.252 758 607.252 801.5 668.752 744C704.847 704.624 705.627 652 682.252 608C665.252 576 619.658 554.544 577.752 558C529.252 562 497.252 610 450.252 616C438.042 617.559 429.192 613.5 435.252 629.5C447.752 662.5 442.502 699.5 426.252 732C395.752 793 342.252 800 309.252 817Z" fill="#4ade80" />' +
    '<path d="M577.252 806.5C546.575 809.687 509.252 844 517.252 882.5C525.252 921 545.706 939 588.752 939C641.752 939 725.833 874.448 773.752 789.5C828.752 692 841.752 625 846.752 569.5C833.919 576 804.252 593 775.252 588C747.634 583.238 730.586 573.5 721.252 559C714.752 567 705.252 575 696.752 582C721.252 613 739.495 683.883 711.252 732C670.752 801 615.752 802.5 577.252 806.5Z" fill="#16a34a" />' +
    '<path d="M504.252 0C442.752 0 422.252 50.5 422.252 76V207.5C422.252 216.5 428.752 222.5 435.752 222.5C463.252 222.5 497.252 168.5 524.752 168.5H607.252C625.252 168.5 675.252 146 675.252 97.5V19.5C675.252 9 669.252 0 654.252 0H504.252Z" fill="#16a34a" />' +
  '</svg>';

  const brandLogoHtml = isStarfocus
    ? '<img src="/starfocus-logo.png" style="width: 0.88em; height: 0.88em; display: inline-block; vertical-align: middle; margin-right: 0.25em; border-radius: 50%; object-fit: contain;" alt="" aria-hidden="true">'
    : banerryLogoHtml;

  const themeVars = isStarfocus ? `
    --bg: #070912;
    --card-bg: #0d1124;
    --border: #1d2545;
    --border-hover: #3b487c;
    --accent: #60a5fa;
    --accent-glow: rgba(96, 165, 250, 0.25);
    --badge-color: #a78bfa;
    --badge-bg: rgba(167, 139, 250, 0.12);
    --header-font: "Honk", system-ui;
  ` : `
    --bg: #080c09;
    --card-bg: #101812;
    --border: #1e3023;
    --border-hover: #2e4d37;
    --accent: #22c55e;
    --accent-glow: rgba(34, 197, 94, 0.25);
    --badge-color: #22c55e;
    --badge-bg: rgba(34, 197, 94, 0.12);
    --header-font: "Lexend", sans-serif;
  `;

  const fontImports = isStarfocus ? `
    <link href="https://fonts.googleapis.com/css2?family=Honk&family=Jura:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
      @font-palette-values --redshift {
        font-family: Honk;
        override-colors:
          2 #60a5fa,
          3 #a78bfa,
          4 #e879f9,
          5 #fb7185,
          6 #f43f5e,
          7 #881337;
      }
      .brand-title {
        font-family: var(--header-font);
        font-palette: --redshift;
        font-variation-settings: "MORF" 15, "SHLN" 50;
        font-size: clamp(2.4rem, 6vw, 4rem);
        line-height: 1.1;
      }
    </style>
  ` : `
    <link href="https://fonts.googleapis.com/css2?family=Lexend:wght@700;800;900&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
      .brand-title {
        font-family: var(--header-font);
        font-weight: 900;
        font-size: clamp(2.2rem, 5.5vw, 3.8rem);
        line-height: 1.1;
        background: linear-gradient(135deg, #22c55e 0%, #eab308 50%, #ef4444 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
    </style>
  `;

  const taskCardsHtml = items.length > 0 ? items.map(t => {
    let statusClass = "status-default";
    const st = (t.status || "").toUpperCase();
    if (st.includes("COMPLET") || st.includes("VERIF")) statusClass = "status-green";
    else if (st.includes("PLAN")) statusClass = "status-purple";
    else if (st.includes("PROG") || st.includes("OPEN") || st.includes("ACTIVE")) statusClass = "status-amber";

    return `
      <a href="${t.href}" class="task-card">
        <div class="task-card-left">
          <div class="task-card-title">${escapeHtml(t.title)}</div>
          <div class="task-card-meta">
            <span class="task-status ${statusClass}">${escapeHtml(t.status || "REPORT")}</span>
            <span class="task-time">${escapeHtml(t.timeAgo || "recently")}</span>
          </div>
        </div>
        <div class="task-arrow">➜</div>
      </a>
    `;
  }).join("\n") : `
    <div class="empty-state">
      <div style="font-size: 2rem; margin-bottom: 0.75rem;">📋</div>
      <div style="font-weight: 600; margin-bottom: 0.35rem;">No tasks published yet</div>
      <div style="font-size: 0.85rem; color: #71717a;">Share tasks using <code>share --task &lt;spec_id&gt; --project ${projectKey}</code></div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${isStarfocus ? "Starfocus" : "Banerry"} • Workspace &amp; Tasks</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${fontImports}
  <style>
    :root {
      ${themeVars}
      --text: #f4f4f5;
      --text-muted: #8e95aa;
      --font-mono: "JetBrains Mono", monospace;
      --font-body: "Inter", system-ui, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-body);
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 16px 64px;
    }

    .wrapper {
      width: 100%;
      max-width: 760px;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    /* Top Back Bar */
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .back-link {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text-muted);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      transition: all 0.15s ease;
    }
    .back-link:hover {
      color: #fff;
      border-color: var(--border-hover);
      transform: translateX(-2px);
    }

    /* Header */
    .header {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .tagline {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* Section */
    .section-title {
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Environments Grid */
    .env-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    .env-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    }
    .env-card:hover {
      border-color: var(--border-hover);
      box-shadow: 0 8px 24px var(--accent-glow);
    }
    .env-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .env-card-title {
      font-size: 17px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
    }
    .env-card-desc {
      font-size: 13px;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 600;
      white-space: nowrap;
    }
    .status-badge.live {
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.35);
      color: #4ade80;
    }
    .status-badge.offline {
      background: rgba(148, 163, 184, 0.1);
      border: 1px solid rgba(148, 163, 184, 0.25);
      color: #94a3b8;
    }
    .pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #4ade80;
      box-shadow: 0 0 8px #4ade80;
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.15s ease;
      cursor: pointer;
    }
    .btn-primary {
      background: var(--accent);
      color: #05070f;
    }
    .btn-primary:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: var(--text);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--border-hover);
    }

    /* Tasks List */
    .tasks-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .task-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      text-decoration: none;
      color: inherit;
      transition: all 0.15s ease;
    }
    .task-card:hover {
      border-color: var(--border-hover);
      background: rgba(255, 255, 255, 0.03);
      transform: translateX(4px);
    }
    .task-card-title {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 6px;
    }
    .task-card-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .task-status {
      padding: 2px 8px;
      border-radius: 6px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .task-status.status-green {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
    }
    .task-status.status-purple {
      background: rgba(192, 132, 252, 0.15);
      color: #c084fc;
    }
    .task-status.status-amber {
      background: rgba(251, 191, 36, 0.15);
      color: #fbbf24;
    }
    .task-status.status-default {
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
    }
    .task-time {
      color: var(--text-muted);
    }
    .task-arrow {
      color: var(--text-muted);
      font-size: 14px;
      transition: transform 0.15s ease;
    }
    .task-card:hover .task-arrow {
      color: var(--accent);
      transform: translateX(3px);
    }

    .empty-state {
      padding: 48px 24px;
      text-align: center;
      background: var(--card-bg);
      border: 1px dashed var(--border);
      border-radius: 12px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="top-bar">
      <a href="/" class="back-link">← portal</a>
      <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${projectName}</span>
    </div>

    <header class="header">
      <h1 class="brand-title" style="display: flex; align-items: center;">${brandLogoHtml}<span>${title}</span></h1>
      <p class="tagline">${tagLine}</p>
    </header>

    <!-- Environments Section -->
    <section>
      <div class="section-title">
        <span>🌐</span>
        <span>Environments &amp; Servers</span>
      </div>
      <div class="env-grid">
        <!-- Production Website -->
        <div class="env-card">
          <div>
            <div class="env-card-top">
              <div class="env-card-title">${prodDisplay}</div>
              <span class="status-badge live">
                <span class="pulse-dot"></span>
                <span>Production</span>
              </span>
            </div>
            <div class="env-card-desc">Public production release on Vercel</div>
          </div>
          <a href="${prodUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
            <span>Open Production App</span>
            <span>↗</span>
          </a>
        </div>

        <!-- Local Dev Server Card (Live-Checked via JS) -->
        <div class="env-card" id="devServerCard">
          <div>
            <div class="env-card-top">
              <div class="env-card-title">Local Dev Server</div>
              <span class="status-badge offline" id="devServerBadge">
                <span>Checking...</span>
              </span>
            </div>
            <div class="env-card-desc" id="devServerDesc">Default port: ${defaultPort}</div>
          </div>
          <div id="devServerActions">
            <a href="http://localhost:${defaultPort}" id="devServerBtn" target="_blank" class="btn btn-secondary">
              <span>Open Port ${defaultPort}</span>
              <span>➜</span>
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- Tasks & Reports Section -->
    <section>
      <div class="section-title">
        <span>📋</span>
        <span>Tasks &amp; Reports (${items.length})</span>
      </div>
      <div class="tasks-list">
        ${taskCardsHtml}
      </div>
    </section>
  </div>

  <script>
    const projectKey = "${projectKey}";
    const defaultPort = ${defaultPort};

    async function checkDevServers() {
      try {
        const res = await fetch("/api/dev-servers", { cache: "no-store" });
        if (!res.ok) throw new Error("API offline");
        const data = await res.json();
        const servers = data[projectKey] || [];
        const running = servers.filter(s => s.isOpen);

        const badge = document.getElementById("devServerBadge");
        const desc = document.getElementById("devServerDesc");
        const actions = document.getElementById("devServerActions");
        const host = window.location.hostname || "localhost";

        if (running.length > 0) {
          badge.className = "status-badge live";
          badge.innerHTML = "<span class='pulse-dot'></span><span>LIVE</span>";
          
          if (running.length === 1) {
            const s = running[0];
            const port = s.port || defaultPort;
            const wt = s.worktree && s.worktree !== "main" && s.worktree !== "default" ? " (" + s.worktree + ")" : "";
            desc.innerHTML = "<strong style=\\"color: #4ade80;\\">Active on port " + port + wt + "</strong>";
            actions.innerHTML = '<a href="http://' + host + ':' + port + '" target="_blank" class="btn btn-primary" style="background: #22c55e; color: #000;"><span>Open Dev Server (' + port + ')</span><span>➜</span></a>';
          } else {
            desc.innerHTML = "<strong style=\\"color: #4ade80;\\">" + running.length + " dev servers active</strong>";
            actions.innerHTML = running.map(s => '<a href="http://' + host + ':' + s.port + '" target="_blank" class="btn btn-primary" style="margin-bottom: 6px; background: #22c55e; color: #000;"><span>Open ' + (s.worktree || "Server") + ' (:' + s.port + ')</span><span>➜</span></a>').join("");
          }
        } else {
          badge.className = "status-badge offline";
          badge.innerHTML = "<span>Offline</span>";
          desc.innerHTML = "Default port " + defaultPort + " • <code>bun run dev</code>";
          actions.innerHTML = '<a href="http://' + host + ':' + defaultPort + '" target="_blank" class="btn btn-secondary"><span>Try Port ' + defaultPort + '</span><span>➜</span></a>';
        }
      } catch (err) {
        const host = window.location.hostname || "localhost";
        const badge = document.getElementById("devServerBadge");
        if (badge) {
          badge.className = "status-badge offline";
          badge.innerHTML = "<span>Default Port</span>";
        }
        const btn = document.getElementById("devServerBtn");
        if (btn) btn.href = "http://" + host + ":" + defaultPort;
      }
    }

    checkDevServers();
    setInterval(checkDevServers, 3000);
  </script>
</body>
</html>`;
}

function updateIndexHtml() {
  if (!fs.existsSync(REPORTS_DIR)) return;

  const entries = fs.readdirSync(REPORTS_DIR, { withFileTypes: true });

  const seenRealPaths = new Set();
  const seenSlugs = new Set();
  const items = [];

  // 1. Task folders and directory symlinks
  for (const d of entries) {
    if (d.name.startsWith('.') || d.name === '_style' || d.name === 'tasks' || d.name === 'starfocus' || d.name === 'banerry' || d.name === 'daily-briefs') continue;
    const folderPath = path.join(REPORTS_DIR, d.name);
    try {
      const stat = fs.statSync(folderPath);
      if (!stat.isDirectory()) continue;

      const indexPath = path.join(folderPath, 'index.html');
      if (!fs.existsSync(indexPath)) continue;

      const real = fs.realpathSync(folderPath);
      if (seenRealPaths.has(real)) continue;
      seenRealPaths.add(real);
      seenSlugs.add(d.name);

      const metaPath = path.join(folderPath, 'metadata.json');
      let meta = { specId: d.name, title: d.name, project: 'tasks', status: 'COMPLETED' };
      if (d.name === 'briefs' || d.name.includes('brief')) meta.project = 'briefs';
      else if (d.name === 'lift' || d.name === 'timer-factory' || d.name === 'zach') meta.project = 'zach';

      if (fs.existsSync(metaPath)) {
        try { meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf-8')) }; } catch {}
      } else {
        const content = fs.readFileSync(indexPath, 'utf-8');
        const m = content.match(/<title>([^<]+)<\/title>/i);
        if (m) meta.title = decodeHtmlEntities(m[1].trim());
      }

      const indexStat = fs.statSync(indexPath);
      items.push({
        slug: d.name,
        href: `/${d.name}/`,
        title: meta.title || d.name,
        project: meta.project || 'tasks',
        status: meta.status || 'COMPLETED',
        mtime: indexStat.mtime.getTime(),
        timeAgo: formatTimeAgo(indexStat.mtime),
        fullDate: indexStat.mtime.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      });
    } catch {}
  }

  // 2. Standalone HTML reports
  for (const d of entries) {
    if (d.name.startsWith('.') || d.name === 'index.html' || !d.name.endsWith('.html')) continue;
    const slug = d.name.replace(/\.html$/, '');
    if (seenSlugs.has(slug)) continue;

    const filePath = path.join(REPORTS_DIR, d.name);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      const real = fs.realpathSync(filePath);
      if (seenRealPaths.has(real)) continue;
      seenRealPaths.add(real);

      const content = fs.readFileSync(filePath, 'utf-8');
      const m = content.match(/<title>([^<]+)<\/title>/i);
      let title = m ? decodeHtmlEntities(m[1].trim()) : slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      let project = 'reports';
      if (/banerry/i.test(d.name) || /banerry/i.test(title)) project = 'banerry';
      else if (/zach/i.test(d.name) || /zach/i.test(title)) project = 'zach';
      else if (/brief/i.test(d.name) || /brief/i.test(title) || /whitehall/i.test(title)) project = 'briefs';
      else if (/starfocus/i.test(d.name) || /starfocus/i.test(title)) project = 'starfocus';

      items.push({
        slug,
        href: `/${d.name}`,
        title,
        project,
        status: 'COMPLETED',
        mtime: stat.mtime.getTime(),
        timeAgo: formatTimeAgo(stat.mtime),
        fullDate: stat.mtime.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      });
    } catch {}
  }

  items.sort((a, b) => b.mtime - a.mtime);
  const tasksJson = JSON.stringify(items);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Tasks Dashboard</title>
  <link rel="icon" type="image/svg+xml" href="/tasks/favicon.svg">
  <link rel="shortcut icon" href="/tasks/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Silkscreen:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0d0e15;
      --surface: #151722;
      --border: #2a2d3d;
      --text: #f4f4f5;
      --text-muted: #8a8f9f;
      --accent: #4deeea;
      --font-sans: 'Silkscreen', 'JetBrains Mono', system-ui, monospace;
      --font-heading: 'Press Start 2P', monospace;
      --font-mono: 'JetBrains Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; border-radius: 0 !important; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 14px;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 32px 16px 64px;
      image-rendering: pixelated;
    }
    .wrapper {
      width: 100%;
      max-width: 680px;
    }
    .controls {
      margin-bottom: 24px;
    }
    .filter-input {
      width: 100%;
      background: var(--surface);
      border: 2px solid var(--border);
      box-shadow: 3px 3px 0px #000;
      padding: 10px 14px;
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 13px;
      outline: none;
      transition: border-color 0.1s ease;
    }
    .filter-input:focus {
      border-color: var(--accent);
    }
    .filter-input::placeholder {
      color: var(--text-muted);
    }
    .group-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      flex-wrap: wrap;
    }
    .group-label {
      font-family: var(--font-heading);
      font-size: 10px;
      color: var(--text-muted);
      margin-right: 2px;
    }
    .group-btn {
      background: var(--surface);
      border: 2px solid #000;
      box-shadow: 2px 2px 0px #000;
      color: var(--text-muted);
      padding: 5px 10px;
      font-size: 10px;
      font-family: var(--font-heading);
      cursor: pointer;
      transition: transform 0.05s ease, box-shadow 0.05s ease;
    }
    .group-btn:hover {
      color: var(--text);
      border-color: var(--border);
    }
    .group-btn:active {
      transform: translate(2px, 2px);
      box-shadow: 0 0 0;
    }
    .group-btn.active {
      background: var(--accent);
      color: #000;
      border-color: #000;
      font-weight: 700;
    }
    .link-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .link-item {
      border-bottom: 2px solid var(--border);
    }
    .bare-link {
      color: var(--accent);
      text-decoration: none;
      display: block;
      padding: 12px 0;
      font-size: 14px;
      line-height: 1.5;
      word-break: break-word;
      transition: color 0.1s ease;
    }
    .bare-link:hover {
      text-decoration: underline;
      color: #ffe600;
    }
    .group-section {
      margin-bottom: 28px;
    }
    .group-header {
      font-family: var(--font-heading);
      font-size: 11px;
      letter-spacing: -0.02em;
      color: var(--text-muted);
      padding-bottom: 8px;
      border-bottom: 2px solid var(--border);
      margin-bottom: 4px;
    }
    .empty {
      padding: 32px 0;
      color: var(--text-muted);
      font-family: var(--font-heading);
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div style="margin-bottom: 20px; display: flex; gap: 10px; align-items: center;">
      <a href="/" style="display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border: 2px solid var(--border); color: var(--text-muted); padding: 8px 12px; font-family: var(--font-heading); font-size: 10px; text-decoration: none; box-shadow: 2px 2px 0 #000; transition: transform 0.05s ease;">
        <span>←</span>
        <span>PORTAL</span>
      </a>
    </div>

    <div class="controls">
      <input type="text" id="filterInput" class="filter-input" placeholder="SEARCH TASKS..." autofocus autocomplete="off">
      <div class="group-bar">
        <span class="group-label">GROUP:</span>
        <button class="group-btn" data-group="recent" onclick="setGrouping('recent')">LAST UPDATED</button>
        <button class="group-btn" data-group="repo" onclick="setGrouping('repo')">REPO</button>
        <button class="group-btn" data-group="status" onclick="setGrouping('status')">STATUS</button>
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

    function getDateBucket(timestamp) {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfYesterday = startOfToday - 86400000;
      const startOf7Days = startOfToday - (6 * 86400000);
      const startOf30Days = startOfToday - (29 * 86400000);

      if (timestamp >= startOfToday) return 'Today';
      if (timestamp >= startOfYesterday) return 'Yesterday';
      if (timestamp >= startOf7Days) return 'Past 7 Days';
      if (timestamp >= startOf30Days) return 'Past 30 Days';
      return 'Older';
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
        const buckets = ['Today', 'Yesterday', 'Past 7 Days', 'Past 30 Days', 'Older'];
        const groups = {};
        for (const t of filtered) {
          const bucket = getDateBucket(t.mtime);
          if (!groups[bucket]) groups[bucket] = [];
          groups[bucket].push(t);
        }
        const html = buckets.filter(b => groups[b] && groups[b].length > 0).map(bucket => \`
          <div class="group-section">
            <div class="group-header">\${escapeHtml(bucket)} (\${groups[bucket].length})</div>
            <ul class="link-list">
              \${groups[bucket].map(t => \`
                <li class="link-item">
                  <a href="\${t.href || \`./\${t.slug}/\`}" class="bare-link">\${escapeHtml(t.title)}</a>
                </li>
              \`).join('')}
            </ul>
          </div>
        \`).join('');
        content.innerHTML = html;
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
                  <a href="\${t.href || \`./\${t.slug}/\`}" class="bare-link">\${escapeHtml(t.title)}</a>
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
                  <a href="\${t.href || \`./\${t.slug}/\`}" class="bare-link">\${escapeHtml(t.title)}</a>
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

  // 1. Write tasks dashboard to /tasks/index.html
  const tasksDir = path.join(REPORTS_DIR, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  const tasksIndexFile = path.join(tasksDir, 'index.html');
  fs.writeFileSync(tasksIndexFile, html, 'utf-8');
  try { fs.chmodSync(tasksIndexFile, 0o644); } catch {}

  // 2. Write root portal to /index.html
  const portalHtml = generatePortalHtml();
  const portalIndexFile = path.join(REPORTS_DIR, 'index.html');
  fs.writeFileSync(portalIndexFile, portalHtml, 'utf-8');
  try { fs.chmodSync(portalIndexFile, 0o644); } catch {}

  // 3. Write starfocus page to /starfocus/index.html
  const starfocusDir = path.join(REPORTS_DIR, 'starfocus');
  fs.mkdirSync(starfocusDir, { recursive: true });
  const starfocusItems = items.filter(t => t.project === 'starfocus' || t.slug.includes('starfocus') || t.title.toLowerCase().includes('starfocus'));
  const starfocusHtml = generateProjectPageHtml('starfocus', starfocusItems);
  fs.writeFileSync(path.join(starfocusDir, 'index.html'), starfocusHtml, 'utf-8');

  // 4. Write banerry page to /banerry/index.html
  const banerryDir = path.join(REPORTS_DIR, 'banerry');
  fs.mkdirSync(banerryDir, { recursive: true });
  const banerryItems = items.filter(t => t.project === 'banerry' || t.slug.includes('banerry') || t.title.toLowerCase().includes('banerry'));
  const banerryHtml = generateProjectPageHtml('banerry', banerryItems);
  fs.writeFileSync(path.join(banerryDir, 'index.html'), banerryHtml, 'utf-8');

  // 5. Write tasks.json
  fs.writeFileSync(path.join(REPORTS_DIR, 'tasks.json'), JSON.stringify(items, null, 2), 'utf-8');

  // 6. Ensure starfocus logo is in place
  const starfocusLogoSrc = '/home/dan/code/homostellaris/starfocus/public/logo.png';
  const starfocusLogoDst = path.join(REPORTS_DIR, 'starfocus-logo.png');
  try {
    if (fs.existsSync(starfocusLogoSrc) && !fs.existsSync(starfocusLogoDst)) {
      fs.copyFileSync(starfocusLogoSrc, starfocusLogoDst);
    }
    const starfocusSubLogo = path.join(starfocusDir, 'logo.png');
    if (fs.existsSync(starfocusLogoSrc) && !fs.existsSync(starfocusSubLogo)) {
      fs.copyFileSync(starfocusLogoSrc, starfocusSubLogo);
    }
  } catch {}

  // 7. Ensure PWA icons, manifest, and service worker
  const faviconSvg = path.join(REPORTS_DIR, 'favicon.svg');
  const icon192 = path.join(REPORTS_DIR, 'icon-192.png');
  const icon512 = path.join(REPORTS_DIR, 'icon-512.png');
  const appleTouch = path.join(REPORTS_DIR, 'apple-touch-icon.png');
  if (fs.existsSync(faviconSvg)) {
    try {
      if (!fs.existsSync(icon192)) execSync(`rsvg-convert -w 192 -h 192 "${faviconSvg}" -o "${icon192}"`);
      if (!fs.existsSync(icon512)) execSync(`rsvg-convert -w 512 -h 512 "${faviconSvg}" -o "${icon512}"`);
      if (!fs.existsSync(appleTouch)) execSync(`rsvg-convert -w 180 -h 180 "${faviconSvg}" -o "${appleTouch}"`);
    } catch {}
  }

  const manifest = {
    name: "Homo Stellaris Portal",
    short_name: "Portal",
    description: "Tailscale workspace portal for Homo Stellaris",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#050609",
    theme_color: "#050609",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };

  const manifestStr = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(path.join(REPORTS_DIR, 'manifest.webmanifest'), manifestStr, 'utf-8');
  fs.writeFileSync(path.join(REPORTS_DIR, 'manifest.json'), manifestStr, 'utf-8');

  const swCode = `// Service Worker for Homo Stellaris Portal PWA
const CACHE_NAME = 'portal-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => (k !== CACHE_NAME && !k.startsWith('zachs-apps') ? caches.delete(k) : null))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/zach/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
`;
  fs.writeFileSync(path.join(REPORTS_DIR, 'sw.js'), swCode, 'utf-8');

  // 8. Ensure daily-briefs symlink exists
  const briefsSymlink = path.join(REPORTS_DIR, 'daily-briefs');
  try {
    if (!fs.existsSync(briefsSymlink)) {
      fs.symlinkSync('briefs', briefsSymlink);
    }
  } catch {}
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
  console.log(`Tasks Hub: ${magicDns ? `${magicDns}/tasks/` : 'http://localhost:8787/tasks/'}`);
  console.log(`Portal:    ${magicDns ? `${magicDns}/` : 'http://localhost:8787/'}\n`);

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
    const rootUrl = magicDns ? `${magicDns}/` : (ip ? `http://${ip}:8787/` : `http://localhost:8787/`);
    const tasksUrl = magicDns ? `${magicDns}/tasks/` : (ip ? `http://${ip}:8787/tasks/` : `http://localhost:8787/tasks/`);
    const zachUrl = magicDns ? `${magicDns}/zach/` : (ip ? `http://${ip}:8787/zach/` : `http://localhost:8787/zach/`);
    console.log(`\nTailscale Share Hub Status:`);
    console.log(`Location:   ${REPORTS_DIR}`);
    console.log(`Portal:     ${rootUrl}`);
    console.log(`Tasks:      ${tasksUrl}`);
    console.log(`Zach:       ${zachUrl}`);
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
  const tasksUrl = magicDns ? `${magicDns}/tasks/` : (ip ? `http://${ip}:8787/tasks/` : `http://localhost:8787/tasks/`);
  const portalUrl = magicDns ? `${magicDns}/` : (ip ? `http://${ip}:8787/` : `http://localhost:8787/`);

  console.log(`\nHosted Report: '${slug}'`);
  console.log(`Saved to:   ${destFile}`);
  console.log(`Phone / Remote URL: ${phoneUrl}`);
  console.log(`Tasks Hub:          ${tasksUrl}`);
  console.log(`Portal:             ${portalUrl}`);
  console.log(`Local:              file://${destFile}\n`);

  if (args.includes('--open')) {
    const openCmd = process.platform === 'darwin' ? 'open' : (process.platform === 'win32' ? 'start' : 'xdg-open');
    execSync(`${openCmd} "${destFile}" 2>/dev/null || true`);
  }
}

main();
