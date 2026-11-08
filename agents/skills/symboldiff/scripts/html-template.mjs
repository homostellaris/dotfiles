/**
 * Standalone Keyboard-Driven HTML Visualizer Template for symboldiff.
 * Beautifully minimal multi-page drilldown architecture with full browser back/forward history support.
 *
 * Layers:
 *   Level 1 (#/):              All Files (status, path, +/- symbol counts)
 *   Level 2 (#/file/:fIdx):    File Symbols (list of symbols in selected file)
 *   Level 3 (#/file/:fIdx/sym/:sIdx): Symbol Diff & Actual Code (focused traditional diff & full implementation)
 *
 * Zero external npm dependencies, offline-ready single-page app.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientScriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'symboldiff-client.js');
let cachedClientScript = null;

function getClientScript() {
  if (!cachedClientScript) {
    cachedClientScript = fs.readFileSync(clientScriptPath, 'utf-8');
  }
  return cachedClientScript;
}

export function generateHtml({ diffData, comparisonTitle, timestamp }) {
  const jsonStr = JSON.stringify(diffData).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SymbolDiff — ${escapeHtml(comparisonTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0d12;
      --bg-surface: #10141d;
      --bg-card: #161b26;
      --bg-hover: #1f2636;
      --border-subtle: #242c3d;
      --border-focus: #388bfd;
      --text-primary: #f0f6fc;
      --text-secondary: #8b949e;
      --text-muted: #656d76;

      --color-added: #2ea043;
      --color-added-bg: rgba(46, 160, 67, 0.12);
      --color-added-line-bg: rgba(46, 160, 67, 0.18);
      --color-added-border: rgba(46, 160, 67, 0.35);

      --color-deleted: #f85149;
      --color-deleted-bg: rgba(248, 81, 73, 0.12);
      --color-deleted-line-bg: rgba(248, 81, 73, 0.18);
      --color-deleted-border: rgba(248, 81, 73, 0.35);

      --color-sig-mod: #d29922;
      --color-sig-mod-bg: rgba(210, 153, 34, 0.12);
      --color-sig-mod-border: rgba(210, 153, 34, 0.35);

      --color-body-mod: #58a6ff;
      --color-body-mod-bg: rgba(88, 166, 255, 0.12);
      --color-body-mod-border: rgba(88, 166, 255, 0.35);

      --color-renamed: #bc8cff;
      --color-renamed-bg: rgba(188, 140, 255, 0.12);
      --color-renamed-border: rgba(188, 140, 255, 0.35);

      --color-type: #bc8cff;
      --color-interface: #a5d6ff;
      --color-fn: #7ee787;
      --color-class: #ffa657;

      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
    }

    /* Top Global Header */
    header {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .brand-link {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      color: var(--text-primary);
      text-decoration: none;
      letter-spacing: -0.3px;
      flex-shrink: 0;
    }
    .brand-icon {
      background: linear-gradient(135deg, #58a6ff, #bc8cff);
      color: #fff;
      width: 24px;
      height: 24px;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      flex-shrink: 0;
    }

    .target-ref {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      background: var(--bg-card);
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid var(--border-subtle);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }

    .shortcuts-label {
      display: inline;
    }

    .sym-stat-add { color: var(--color-added); }
    .sym-stat-del { color: var(--color-deleted); }
    .sym-stat-mod { color: var(--color-sig-mod); }

    .header-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .icon-btn {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      padding: 4px 8px;
      border-radius: 5px;
      font-size: 11px;
      font-family: var(--font-mono);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
      user-select: none;
    }
    .icon-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
      border-color: var(--border-focus);
    }

    /* Main Scroll Stage */
    main {
      min-height: calc(100vh - 50px);
      padding: 28px 20px 80px 20px;
      display: flex;
      justify-content: center;
    }

    .view-container {
      width: 100%;
      max-width: 1000px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      animation: fadeIn 0.12s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Breadcrumbs Navigation Bar */
    .breadcrumb-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 4px;
    }
    .back-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      text-decoration: none;
      user-select: none;
    }
    .back-btn:hover {
      background: var(--bg-hover);
      border-color: var(--border-focus);
    }
    .back-btn kbd {
      background: var(--bg-card);
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
    }

    .breadcrumb-trail {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-muted);
      overflow: hidden;
      min-width: 0;
    }
    .breadcrumb-crumb {
      color: var(--text-secondary);
      text-decoration: none;
      white-space: nowrap;
    }
    .breadcrumb-crumb:hover {
      color: var(--text-primary);
      text-decoration: underline;
    }
    .breadcrumb-crumb.active {
      color: var(--text-primary);
      font-weight: 600;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .breadcrumb-sep {
      color: var(--text-muted);
      font-size: 10px;
    }

    /* Page View Banner */
    .page-banner {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .page-banner-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .page-title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }
    .page-subtitle {
      font-size: 12px;
      color: var(--text-secondary);
    }

    /* Search Input on Files View */
    .filter-input-wrapper {
      position: relative;
      width: 100%;
    }
    .filter-input {
      width: 100%;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 8px 14px 8px 34px;
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 13px;
      outline: none;
      transition: all 0.15s ease;
    }
    .filter-input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
    }
    .filter-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      font-size: 12px;
      pointer-events: none;
    }

    /* Tree Toolbar & Actions */
    .tree-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .tree-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tree-stats-summary {
      font-size: 12px;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    /* Minimal Card Lists (Level 1 & Level 2) */
    .list-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }
    .list-row {
      padding: 11px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      cursor: pointer;
      user-select: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      transition: background-color 0.12s ease;
      text-decoration: none;
      color: inherit;
    }
    .list-row:last-child {
      border-bottom: none;
    }
    .list-row:hover {
      background: var(--bg-hover);
    }
    .list-row.focused {
      background: var(--bg-hover);
      outline: 2px solid var(--border-focus);
    }

    /* Tree Indentation & Folder Styling */
    .tree-folder-children {
      display: flex;
      flex-direction: column;
    }
    .tree-folder-row {
      background: rgba(255, 255, 255, 0.02);
      font-weight: 600;
      padding-left: calc(16px + var(--depth, 0) * 16px) !important;
    }
    .tree-folder-row:hover {
      background: var(--bg-hover);
    }
    .tree-file-row {
      padding-left: calc(16px + var(--depth, 0) * 16px) !important;
    }
    .tree-chevron {
      font-size: 9px;
      color: var(--text-muted);
      width: 14px;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      transition: transform 0.12s ease;
      flex-shrink: 0;
    }
    .folder-icon {
      font-size: 14px;
      flex-shrink: 0;
    }
    .folder-name {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text-primary);
      font-weight: 600;
    }
    .folder-stats-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .folder-files-count {
      color: var(--text-secondary);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 500;
    }
    .folder-dot {
      color: var(--text-muted);
      font-size: 10px;
    }

    .list-row-left {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;
      min-width: 0;
      flex: 1;
    }
    .list-row-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    /* Badges */
    .status-pill {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      text-transform: uppercase;
      line-height: 1;
    }
    .status-pill.status-a {
      color: var(--color-added);
      background: var(--color-added-bg);
      border: 1px solid var(--color-added-border);
    }
    .status-pill.status-m {
      color: var(--color-sig-mod);
      background: var(--color-sig-mod-bg);
      border: 1px solid var(--color-sig-mod-border);
    }
    .status-pill.status-d {
      color: var(--color-deleted);
      background: var(--color-deleted-bg);
      border: 1px solid var(--color-deleted-border);
    }
    .status-pill.status-r {
      color: var(--color-renamed);
      background: var(--color-renamed-bg);
      border: 1px solid var(--color-renamed-border);
    }

    .type-pill {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      text-transform: uppercase;
      flex-shrink: 0;
      background: var(--bg-card);
      color: var(--text-muted);
      border: 1px solid var(--border-subtle);
    }
    .type-pill.ts, .type-pill.tsx { color: #3178c6; border-color: rgba(49, 120, 198, 0.4); }
    .type-pill.js, .type-pill.jsx, .type-pill.mjs { color: #f7df1e; border-color: rgba(247, 223, 30, 0.4); }
    .type-pill.py { color: #3776ab; border-color: rgba(55, 118, 171, 0.4); }
    .type-pill.rs { color: #dea584; border-color: rgba(222, 165, 132, 0.4); }
    .type-pill.go { color: #00add8; border-color: rgba(0, 173, 216, 0.4); }
    .type-pill.md { color: #8b949e; }
    .type-pill.json { color: #f0883e; border-color: rgba(240, 136, 62, 0.4); }

    .path-display {
      font-family: var(--font-mono);
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .path-dir { color: var(--text-muted); }
    .path-file { color: var(--text-primary); font-weight: 600; }

    .rename-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    /* Symbol stats pill */
    .sym-counts-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 600;
    }
    .sym-add-badge {
      color: var(--color-added);
      background: var(--color-added-bg);
      padding: 2px 7px;
      border-radius: 10px;
      border: 1px solid var(--color-added-border);
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 600;
      white-space: nowrap;
    }
    .sym-del-badge {
      color: var(--color-deleted);
      background: var(--color-deleted-bg);
      padding: 2px 7px;
      border-radius: 10px;
      border: 1px solid var(--color-deleted-border);
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 600;
      white-space: nowrap;
    }
    .sym-mod-badge {
      color: var(--color-sig-mod);
      background: var(--color-sig-mod-bg);
      padding: 2px 7px;
      border-radius: 10px;
      border: 1px solid var(--color-sig-mod-border);
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 600;
      white-space: nowrap;
    }
    .loc-badge {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.03);
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid var(--border-subtle);
      white-space: nowrap;
    }
    .sym-total-tag {
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 500;
      color: var(--text-secondary);
      background: var(--bg-card);
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid var(--border-subtle);
      white-space: nowrap;
    }

    .row-arrow {
      color: var(--text-muted);
      font-size: 13px;
      transition: transform 0.15s ease, color 0.15s ease;
    }
    .list-row:hover .row-arrow {
      color: var(--text-primary);
      transform: translateX(3px);
    }

    /* Symbol Badges */
    .sym-status-badge {
      font-family: var(--font-sans);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .sym-status-badge.added {
      background: var(--color-added-bg);
      color: var(--color-added);
      border: 1px solid var(--color-added-border);
    }
    .sym-status-badge.sig_mod {
      background: var(--color-sig-mod-bg);
      color: var(--color-sig-mod);
      border: 1px solid var(--color-sig-mod-border);
    }
    .sym-status-badge.body_mod {
      background: var(--color-body-mod-bg);
      color: var(--color-body-mod);
      border: 1px solid var(--color-body-mod-border);
    }
    .sym-status-badge.deleted {
      background: var(--color-deleted-bg);
      color: var(--color-deleted);
      border: 1px solid var(--color-deleted-border);
    }

    .kind-pill {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      background: var(--bg-card);
      color: var(--text-secondary);
      border: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }
    .kind-pill.fn, .kind-pill.function, .kind-pill.method { color: var(--color-fn); border-color: rgba(126, 231, 135, 0.3); }
    .kind-pill.interface { color: var(--color-interface); border-color: rgba(165, 214, 255, 0.3); }
    .kind-pill.type { color: var(--color-type); border-color: rgba(188, 140, 255, 0.3); }
    .kind-pill.class { color: var(--color-class); border-color: rgba(255, 166, 87, 0.3); }

    /* Level 2: Symbol List Row Layout */
    .sym-list-row {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 12px 18px;
    }
    .sym-row-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
    }
    .sym-row-badges {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .sym-row-meta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .sym-row-body {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
      width: 100%;
    }
    .sym-name-text {
      font-family: var(--font-mono);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--text-primary);
      word-break: break-word;
    }
    .sym-type-text {
      font-family: var(--font-mono);
      font-size: 12px;
      color: #79c0ff;
      word-break: break-all;
      line-height: 1.4;
    }
    .sym-line-tag {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    /* Level 3: Symbol Inspection Page */
    .symbol-header-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .symbol-header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .symbol-identity {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .symbol-main-name {
      font-family: var(--font-mono);
      font-size: 16px;
      font-weight: 700;
      color: var(--text-primary);
    }
    .signature-block {
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 10px 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-secondary);
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Tabs & Viewer Card */
    .viewer-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }
    .viewer-toolbar {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .tab-btn-group {
      display: flex;
      gap: 4px;
    }
    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-secondary);
      padding: 5px 12px;
      border-radius: 5px;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.12s ease;
      user-select: none;
    }
    .tab-btn:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }
    .tab-btn.active {
      background: var(--bg-card);
      color: var(--text-primary);
      border-color: var(--border-subtle);
      box-shadow: 0 1px 2px rgba(0,0,0,0.3);
    }

    .diff-table-container {
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.55;
    }
    .diff-hunk-header {
      background: rgba(56, 139, 253, 0.1);
      color: #79c0ff;
      padding: 5px 16px;
      font-size: 11px;
      font-weight: 600;
      border-top: 1px solid rgba(56, 139, 253, 0.15);
      border-bottom: 1px solid rgba(56, 139, 253, 0.15);
      user-select: none;
    }
    .diff-row {
      display: flex;
      align-items: stretch;
      width: 100%;
    }
    .diff-row.add { background-color: var(--color-added-line-bg); color: #aff5b4; }
    .diff-row.del { background-color: var(--color-deleted-line-bg); color: #ffdcd7; }
    .diff-row.context { color: var(--text-primary); }

    .num-col {
      width: 48px;
      padding: 2px 8px;
      text-align: right;
      color: var(--text-muted);
      user-select: none;
      font-size: 11px;
      flex-shrink: 0;
      border-right: 1px solid rgba(255, 255, 255, 0.05);
    }
    .prefix-col {
      width: 24px;
      text-align: center;
      user-select: none;
      font-weight: 700;
      flex-shrink: 0;
    }
    .code-col {
      flex: 1;
      padding: 2px 10px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      backdrop-filter: blur(4px);
    }
    .modal-overlay.open { display: flex; }
    .modal-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      width: 480px;
      max-width: 92vw;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .modal-title { font-weight: 700; font-size: 15px; }
    .modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 18px;
      padding: 4px;
    }
    .shortcut-table { width: 100%; border-collapse: collapse; }
    .shortcut-table tr { border-bottom: 1px solid var(--border-subtle); }
    .shortcut-table tr:last-child { border-bottom: none; }
    .shortcut-table td { padding: 8px 4px; font-size: 13px; }
    .shortcut-keys { text-align: right; font-family: var(--font-mono); }
    .shortcut-keys kbd {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
    }

    /* Empty states */
    .empty-state {
      padding: 48px 20px;
      text-align: center;
      color: var(--text-muted);
    }
    .empty-icon { font-size: 28px; margin-bottom: 10px; }

    @media (max-width: 768px) {
      header { padding: 8px 14px; height: 46px; }
      .shortcuts-label { display: none; }
      .target-ref { max-width: 140px; }
      main { padding: 14px 10px 60px 10px; }
      .sym-sig-preview { display: none; }
      .tree-folder-row { padding-left: calc(12px + var(--depth, 0) * 10px) !important; }
      .tree-file-row { padding-left: calc(12px + var(--depth, 0) * 10px) !important; }
      .path-display { font-size: 12px; white-space: normal; word-break: break-all; }
      .sym-list-row { padding: 10px 14px; }
      .sym-name-text { font-size: 13px; }
      .sym-type-text { font-size: 11px; }
    }

    @media (max-width: 480px) {
      header { padding: 8px 10px; }
      .brand-link span { font-size: 13px; }
      .target-ref { max-width: 100px; font-size: 10px; padding: 2px 5px; }
      .sym-total-tag { display: none; }
      .folder-stats-pill .sym-mod-badge { display: none; }
      .tree-stats-summary { display: none; }
      .sym-list-row { padding: 9px 12px; gap: 4px; }
      .sym-row-body { flex-direction: column; align-items: flex-start; gap: 2px; }
      .sym-name-text { font-size: 13px; }
      .sym-type-text { font-size: 11px; }
    }
  </style>
</head>
<body>
  <!-- Header Bar -->
  <header>
    <div class="header-left">
      <a href="#/" class="brand-link" title="Return to All Files">
        <div class="brand-icon">⚡</div>
        <span>SymbolDiff</span>
      </a>
      <span class="target-ref" id="targetRef">${escapeHtml(comparisonTitle)}</span>
    </div>

    <div class="header-right">
      <button class="icon-btn" onclick="toggleHelpModal()" title="Shortcuts (?)">
        <kbd>?</kbd><span class="shortcuts-label"> Shortcuts</span>
      </button>
    </div>
  </header>

  <!-- Main View Container (Re-rendered on hash change) -->
  <main>
    <div class="view-container" id="viewContainer"></div>
  </main>

  <!-- Help Modal -->
  <div class="modal-overlay" id="helpModal">
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">⚡ SymbolDiff Shortcuts</div>
        <button class="modal-close" onclick="toggleHelpModal()">✕</button>
      </div>
      <table class="shortcut-table">
        <tr>
          <td>Navigate up / down in lists</td>
          <td class="shortcut-keys"><kbd>j</kbd> / <kbd>k</kbd> or <kbd>↓</kbd> / <kbd>↑</kbd></td>
        </tr>
        <tr>
          <td>Open item / Toggle folder</td>
          <td class="shortcut-keys"><kbd>Enter</kbd> / <kbd>Space</kbd> / <kbd>→</kbd></td>
        </tr>
        <tr>
          <td>Collapse folder / Go back</td>
          <td class="shortcut-keys"><kbd>←</kbd> / <kbd>Esc</kbd> / <kbd>Backspace</kbd> / <kbd>h</kbd></td>
        </tr>
        <tr>
          <td>Expand all / Collapse all folders</td>
          <td class="shortcut-keys"><kbd>e</kbd> / <kbd>c</kbd></td>
        </tr>
        <tr>
          <td>Toggle Diff / Code tab in Level 3</td>
          <td class="shortcut-keys"><kbd>Tab</kbd> or <kbd>1</kbd> / <kbd>2</kbd></td>
        </tr>
        <tr>
          <td>Copy code or diff</td>
          <td class="shortcut-keys"><kbd>c</kbd></td>
        </tr>
        <tr>
          <td>Focus filter / search</td>
          <td class="shortcut-keys"><kbd>/</kbd></td>
        </tr>
        <tr>
          <td>Toggle this help cheat sheet</td>
          <td class="shortcut-keys"><kbd>?</kbd></td>
        </tr>
      </table>
    </div>
  </div>

  <script>
    window.__SYMBOLDIFF_DATA__ = ${jsonStr};
    window.diffData = window.__SYMBOLDIFF_DATA__;
  </script>
  <script>
    (function () {
      const serverUrl = (location.protocol === "http:" || location.protocol === "https:")
        ? "/assets/symboldiff-app.js"
        : "http://127.0.0.1:8787/assets/symboldiff-app.js";

      const scriptElement = document.createElement("script");
      scriptElement.src = serverUrl;
      scriptElement.onerror = function () {
        loadFallback();
      };
      document.head.appendChild(scriptElement);

      function loadFallback() {
        if (window.__SYMBOLDIFF_INITIALIZED__) return;
        ${getClientScript()}
      }
    })();
  </script>
</body>
</html>`;
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

export function buildFileTree(filesList) {
  const root = {
    name: '',
    path: '',
    dirs: new Map(),
    files: [],
    totalFiles: 0,
    symbolsAdded: 0,
    symbolsDeleted: 0,
    symbolsModified: 0,
  };

  for (const item of filesList) {
    const parts = item.file.path.split('/');
    const fileName = parts.pop();
    let curr = root;
    let acc = '';
    for (const d of parts) {
      acc = acc ? acc + '/' + d : d;
      if (!curr.dirs.has(d)) {
        curr.dirs.set(d, {
          name: d,
          path: acc,
          dirs: new Map(),
          files: [],
          totalFiles: 0,
          symbolsAdded: 0,
          symbolsDeleted: 0,
          symbolsModified: 0,
        });
      }
      curr = curr.dirs.get(d);
    }
    curr.files.push(item);
  }

  function compact(node) {
    for (const [name, child] of Array.from(node.dirs.entries())) {
      compact(child);
      if (child.files.length === 0 && child.dirs.size === 1) {
        const onlyChild = child.dirs.values().next().value;
        const combinedName = child.name + '/' + onlyChild.name;
        node.dirs.delete(name);
        onlyChild.name = combinedName;
        node.dirs.set(combinedName, onlyChild);
      }
    }
  }
  compact(root);

  function aggregate(node) {
    let count = node.files.length;
    let add = 0, del = 0, mod = 0;
    for (const item of node.files) {
      add += (item.file.symbolsAdded || 0);
      del += (item.file.symbolsDeleted || 0);
      mod += (item.file.symbolsModified || 0);
    }
    for (const child of node.dirs.values()) {
      aggregate(child);
      count += child.totalFiles;
      add += child.symbolsAdded;
      del += child.symbolsDeleted;
      mod += child.symbolsModified;
    }
    node.totalFiles = count;
    node.symbolsAdded = add;
    node.symbolsDeleted = del;
    node.symbolsModified = mod;
  }
  aggregate(root);

  return root;
}

