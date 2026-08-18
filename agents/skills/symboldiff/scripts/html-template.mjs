/**
 * Standalone Keyboard-Driven HTML Visualizer Template for symboldiff.
 * Generates an interactive, zero-dependency, offline-ready HTML single-page app.
 */

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
      --bg-primary: #090d13;
      --bg-secondary: #0d1117;
      --bg-surface: #161b22;
      --bg-card: #21262d;
      --bg-hover: #30363d;
      --border-subtle: #30363d;
      --border-focus: #58a6ff;
      --text-primary: #f0f6fc;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      
      /* Change category colors */
      --color-added: #2ea043;
      --color-added-bg: rgba(46, 160, 67, 0.15);
      --color-added-border: rgba(46, 160, 67, 0.4);
      
      --color-sig-mod: #d29922;
      --color-sig-mod-bg: rgba(210, 153, 34, 0.15);
      --color-sig-mod-border: rgba(210, 153, 34, 0.4);
      
      --color-body-mod: #58a6ff;
      --color-body-mod-bg: rgba(88, 166, 255, 0.15);
      --color-body-mod-border: rgba(88, 166, 255, 0.4);
      
      --color-deleted: #f85149;
      --color-deleted-bg: rgba(248, 81, 73, 0.15);
      --color-deleted-border: rgba(248, 81, 73, 0.4);

      --color-type: #bc8cff;
      --color-interface: #a5d6ff;
      --color-fn: #7ee787;
      --color-class: #ffa657;
      
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html {
      height: 100%;
    }
    body {
      background-color: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Top Navigation Header */
    header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-subtle);
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-shrink: 0;
      z-index: 10;
    }

    .header-main {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 16px;
      letter-spacing: -0.5px;
    }
    .brand-icon {
      background: linear-gradient(135deg, #58a6ff, #bc8cff);
      color: #fff;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
    }
    .target-ref {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--bg-surface);
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid var(--border-subtle);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 260px;
    }

    /* Search & Filter Bar */
    .controls-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-grow: 1;
      max-width: 650px;
    }
    .search-wrapper {
      position: relative;
      flex-grow: 1;
    }
    .search-input {
      width: 100%;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 6px 12px 6px 32px;
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .search-input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
    }
    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      font-size: 13px;
      pointer-events: none;
    }
    .search-hint {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-muted);
      background: var(--bg-card);
      padding: 1px 5px;
      border-radius: 3px;
      border: 1px solid var(--border-subtle);
    }

    /* Category Filter Buttons */
    .filter-group {
      display: flex;
      gap: 4px;
      background: var(--bg-surface);
      padding: 2px;
      border-radius: 6px;
      border: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }
    .filter-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .filter-btn:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }
    .filter-btn.active {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .filter-badge {
      font-size: 10px;
      padding: 0 4px;
      border-radius: 10px;
      background: rgba(255,255,255,0.1);
    }

    .key-hints {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
    .key-badge {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      user-select: none;
    }
    .key-badge kbd {
      background: var(--bg-card);
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: 600;
      color: var(--text-primary);
      font-size: 10px;
      border: 1px solid var(--border-subtle);
    }

    /* Mobile Segmented Switcher Tab Bar */
    .mobile-tab-bar {
      display: none;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-subtle);
      padding: 6px 12px;
      gap: 8px;
      flex-shrink: 0;
    }
    .mobile-tab-btn {
      flex: 1;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s ease;
      user-select: none;
    }
    .mobile-tab-btn.active {
      background: var(--bg-card);
      color: var(--text-primary);
      border-color: var(--border-focus);
    }
    .mobile-tab-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      background: rgba(255,255,255,0.1);
      padding: 1px 5px;
      border-radius: 10px;
    }

    /* Main Container (Split-View) */
    .app-body {
      display: flex;
      flex-grow: 1;
      overflow: hidden;
      min-height: 0;
      position: relative;
    }

    /* Left Sidebar: File Tree */
    .sidebar {
      width: 320px;
      min-width: 250px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      min-height: 0;
    }
    .panel-header {
      padding: 10px 16px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    .file-list {
      overflow-y: auto;
      flex-grow: 1;
      padding: 8px 0;
    }
    .file-item {
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      cursor: pointer;
      user-select: none;
      transition: background 0.1s ease;
      border-left: 2px solid transparent;
    }
    .file-item:hover {
      background: var(--bg-surface);
    }
    .file-item.selected {
      background: var(--bg-surface);
      border-left-color: var(--border-focus);
    }
    .file-item.focused {
      outline: 1px solid var(--border-focus);
    }
    .file-info {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-path {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-dir {
      color: var(--text-muted);
    }
    .file-badges {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .file-count {
      font-size: 10px;
      font-family: var(--font-mono);
      padding: 1px 5px;
      border-radius: 10px;
      background: var(--bg-card);
      color: var(--text-secondary);
      border: 1px solid var(--border-subtle);
    }

    /* Right Main Panel: Symbol Stream */
    .content-stage {
      flex-grow: 1;
      overflow-y: auto;
      padding: 24px 32px;
      background: var(--bg-primary);
      min-height: 0;
    }
    .file-section {
      margin-bottom: 32px;
    }
    .file-section-title {
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border-subtle);
      word-break: break-all;
    }

    /* Symbol Cards */
    .symbol-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .symbol-card:hover {
      border-color: var(--text-muted);
    }
    .symbol-card.focused {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.2);
    }
    .symbol-header {
      padding: 10px 14px;
      background: var(--bg-surface);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      cursor: pointer;
    }
    .symbol-title-area {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .symbol-name {
      font-family: var(--font-mono);
      font-weight: 600;
      font-size: 13px;
      color: var(--text-primary);
      word-break: break-word;
    }
    .symbol-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .line-number {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    /* Badges */
    .badge {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      text-transform: capitalize;
      white-space: nowrap;
    }
    .badge-kind {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      background: var(--bg-card);
      color: var(--text-secondary);
      border: 1px solid var(--border-subtle);
    }
    .badge-kind.fn { color: var(--color-fn); border-color: rgba(126, 231, 135, 0.3); }
    .badge-kind.method { color: var(--color-fn); border-color: rgba(126, 231, 135, 0.3); }
    .badge-kind.interface { color: var(--color-interface); border-color: rgba(165, 214, 255, 0.3); }
    .badge-kind.type { color: var(--color-type); border-color: rgba(188, 140, 255, 0.3); }
    .badge-kind.class { color: var(--color-class); border-color: rgba(255, 166, 87, 0.3); }

    .badge-status {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge-status.added {
      background: var(--color-added-bg);
      color: var(--color-added);
      border: 1px solid var(--color-added-border);
    }
    .badge-status.sig_mod {
      background: var(--color-sig-mod-bg);
      color: var(--color-sig-mod);
      border: 1px solid var(--color-sig-mod-border);
    }
    .badge-status.body_mod {
      background: var(--color-body-mod-bg);
      color: var(--color-body-mod);
      border: 1px solid var(--color-body-mod-border);
    }
    .badge-status.deleted {
      background: var(--color-deleted-bg);
      color: var(--color-deleted);
      border: 1px solid var(--color-deleted-border);
    }

    /* Signature Diff Box */
    .signature-diff-box {
      padding: 12px 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.6;
      border-top: 1px solid var(--border-subtle);
    }
    .diff-line {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 4px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .diff-line:last-child { margin-bottom: 0; }
    .diff-line.old {
      background: var(--color-deleted-bg);
      color: #ffa198;
      border-left: 3px solid var(--color-deleted);
    }
    .diff-line.new {
      background: var(--color-added-bg);
      color: #7ee787;
      border-left: 3px solid var(--color-added);
    }
    .diff-line.current {
      background: var(--bg-surface);
      color: var(--text-primary);
      border-left: 3px solid var(--border-subtle);
    }
    .diff-icon {
      font-weight: 700;
      width: 14px;
      flex-shrink: 0;
      user-select: none;
    }

    /* Keyboard Modal */
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
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      width: 500px;
      max-width: 92vw;
      max-height: 85vh;
      overflow-y: auto;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .modal-title { font-weight: 700; font-size: 16px; }
    .modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 18px;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .shortcut-table {
      width: 100%;
      border-collapse: collapse;
    }
    .shortcut-table tr {
      border-bottom: 1px solid var(--border-subtle);
    }
    .shortcut-table tr:last-child { border-bottom: none; }
    .shortcut-table td {
      padding: 8px 4px;
    }
    .shortcut-keys {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-primary);
      text-align: right;
      width: 160px;
    }
    .shortcut-keys kbd {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
    }

    /* Empty state */
    .empty-state {
      padding: 48px 0;
      text-align: center;
      color: var(--text-muted);
    }
    .empty-icon { font-size: 32px; margin-bottom: 12px; }

    /* Responsive Styles for Mobile and Tablet */
    @media (max-width: 768px) {
      header {
        padding: 10px 12px;
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }
      .header-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
      }
      .brand {
        font-size: 15px;
        min-width: 0;
      }
      .target-ref {
        max-width: 130px;
        font-size: 11px;
      }
      .controls-bar {
        flex-direction: column;
        align-items: stretch;
        max-width: 100%;
        gap: 8px;
      }
      .search-hint {
        display: none;
      }
      .filter-group {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        width: 100%;
        padding: 2px;
      }
      .filter-group::-webkit-scrollbar {
        display: none;
      }
      .filter-btn {
        padding: 5px 8px;
        font-size: 11px;
      }
      .key-hints {
        display: flex;
      }
      .mobile-tab-bar {
        display: flex;
      }
      .app-body {
        flex-direction: column;
      }
      .sidebar {
        display: none;
        width: 100%;
        height: 100%;
        border-right: none;
      }
      .sidebar.mobile-active {
        display: flex;
      }
      .content-stage {
        display: none;
        width: 100%;
        height: 100%;
        padding: 12px 14px;
      }
      .content-stage.mobile-active {
        display: block;
      }
      .file-section {
        margin-bottom: 20px;
      }
      .file-section-title {
        font-size: 12px;
      }
      .symbol-header {
        padding: 8px 10px;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
      }
      .symbol-title-area {
        gap: 6px;
        width: 100%;
      }
      .symbol-name {
        font-size: 12px;
      }
      .signature-diff-box {
        padding: 8px 10px;
        font-size: 11px;
      }
      .diff-line {
        font-size: 11px;
        padding: 3px 6px;
      }
    }
  </style>
  <link rel="stylesheet" href="/_style/symboldiff.css">
</head>
<body>
  <!-- Header Bar -->
  <header>
    <div class="header-main">
      <div class="brand">
        <div class="brand-icon">⚡</div>
        <span>SymbolDiff</span>
        <span class="target-ref" id="targetRef">${escapeHtml(comparisonTitle)}</span>
      </div>
      <div class="key-hints">
        <div class="key-badge" onclick="toggleHelpModal()"><kbd>?</kbd> Shortcuts</div>
      </div>
    </div>

    <!-- Search & Filter Area -->
    <div class="controls-bar">
      <div class="search-wrapper">
        <span class="search-icon">🔍</span>
        <input type="text" id="searchInput" class="search-input" placeholder="Search file paths, symbol names, or signatures..." autocomplete="off" spellcheck="false">
        <span class="search-hint">/</span>
      </div>

      <div class="filter-group">
        <button class="filter-btn active" data-filter="all">All <span class="filter-badge" id="countAll">0</span></button>
        <button class="filter-btn" data-filter="sig_mod" title="Press 2">⚡ Sig Mod <span class="filter-badge" id="countSigMod">0</span></button>
        <button class="filter-btn" data-filter="body_mod" title="Press 3">📝 Body <span class="filter-badge" id="countBodyMod">0</span></button>
        <button class="filter-btn" data-filter="added" title="Press 4">✨ Added <span class="filter-badge" id="countAdded">0</span></button>
        <button class="filter-btn" data-filter="deleted" title="Press 5">🔥 Deleted <span class="filter-badge" id="countDeleted">0</span></button>
      </div>
    </div>
  </header>

  <!-- Mobile Segmented Tabs -->
  <div class="mobile-tab-bar">
    <button class="mobile-tab-btn" id="tabBtnFiles" onclick="switchMobileView('files')">
      📄 Files <span class="mobile-tab-badge" id="mobileFileCount">0</span>
    </button>
    <button class="mobile-tab-btn active" id="tabBtnSymbols" onclick="switchMobileView('symbols')">
      ⚡ Symbols <span class="mobile-tab-badge" id="mobileSymbolCount">0</span>
    </button>
  </div>

  <!-- Main Body Split-View -->
  <div class="app-body">
    <!-- Left: File Tree Panel -->
    <aside class="sidebar">
      <div class="panel-header">
        <span>Modified Files</span>
        <span id="fileTotalCount" style="font-family: var(--font-mono);">0 files</span>
      </div>
      <div class="file-list" id="fileList"></div>
    </aside>

    <!-- Right: Symbol Content Stage -->
    <main class="content-stage mobile-active" id="contentStage"></main>
  </div>

  <!-- Keyboard Shortcuts Help Modal -->
  <div class="modal-overlay" id="helpModal">
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">⚡ SymbolDiff Keyboard Shortcuts</div>
        <button class="modal-close" onclick="toggleHelpModal()">✕</button>
      </div>
      <table class="shortcut-table">
        <tr>
          <td>Navigate up / down</td>
          <td class="shortcut-keys"><kbd>j</kbd> / <kbd>k</kbd> or <kbd>↓</kbd> / <kbd>↑</kbd></td>
        </tr>
        <tr>
          <td>Switch panel (Files ↔ Symbols)</td>
          <td class="shortcut-keys"><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd></td>
        </tr>
        <tr>
          <td>Jump to next / previous file</td>
          <td class="shortcut-keys"><kbd>]</kbd> / <kbd>[</kbd></td>
        </tr>
        <tr>
          <td>Focus search filter</td>
          <td class="shortcut-keys"><kbd>/</kbd></td>
        </tr>
        <tr>
          <td>Clear search / close modal</td>
          <td class="shortcut-keys"><kbd>Esc</kbd></td>
        </tr>
        <tr>
          <td>Filter change category</td>
          <td class="shortcut-keys"><kbd>1</kbd> - <kbd>5</kbd></td>
        </tr>
        <tr>
          <td>Toggle this help cheat sheet</td>
          <td class="shortcut-keys"><kbd>?</kbd></td>
        </tr>
      </table>
    </div>
  </div>

  <script>
    const diffData = ${jsonStr};
    let activeFilter = 'all';
    let searchQuery = '';
    let focusedPanel = 'symbols'; // 'files' | 'symbols'
    let selectedFileIndex = 0;
    let selectedSymbolIndex = 0;

    // Elements
    const fileListEl = document.getElementById('fileList');
    const contentStageEl = document.getElementById('contentStage');
    const searchInput = document.getElementById('searchInput');
    const helpModal = document.getElementById('helpModal');

    // Counts
    let counts = { all: 0, sig_mod: 0, body_mod: 0, added: 0, deleted: 0 };

    function calculateCounts() {
      counts = { all: 0, sig_mod: 0, body_mod: 0, added: 0, deleted: 0 };
      for (const file of diffData.files) {
        for (const s of file.symbols) {
          counts.all++;
          if (s.status === 'SIGNATURE_MODIFIED') counts.sig_mod++;
          else if (s.status === 'BODY_MODIFIED') counts.body_mod++;
          else if (s.status === 'ADDED') counts.added++;
          else if (s.status === 'DELETED') counts.deleted++;
        }
      }
      document.getElementById('countAll').innerText = counts.all;
      document.getElementById('countSigMod').innerText = counts.sig_mod;
      document.getElementById('countBodyMod').innerText = counts.body_mod;
      document.getElementById('countAdded').innerText = counts.added;
      document.getElementById('countDeleted').innerText = counts.deleted;
      document.getElementById('fileTotalCount').innerText = \`\${diffData.files.length} files\`;
    }

    function filterMatches(sym, file) {
      if (activeFilter === 'sig_mod' && sym.status !== 'SIGNATURE_MODIFIED') return false;
      if (activeFilter === 'body_mod' && sym.status !== 'BODY_MODIFIED') return false;
      if (activeFilter === 'added' && sym.status !== 'ADDED') return false;
      if (activeFilter === 'deleted' && sym.status !== 'DELETED') return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inName = sym.name.toLowerCase().includes(q);
        const inSig = (sym.signature || '').toLowerCase().includes(q) || (sym.oldSignature || '').toLowerCase().includes(q);
        const inFile = file.path.toLowerCase().includes(q);
        return inName || inSig || inFile;
      }
      return true;
    }

    function switchMobileView(view) {
      currentMobileView = view;
      const tabFiles = document.getElementById('tabBtnFiles');
      const tabSymbols = document.getElementById('tabBtnSymbols');
      const sidebarEl = document.querySelector('.sidebar');
      const contentEl = document.getElementById('contentStage');

      if (view === 'files') {
        if (tabFiles) tabFiles.classList.add('active');
        if (tabSymbols) tabSymbols.classList.remove('active');
        if (sidebarEl) sidebarEl.classList.add('mobile-active');
        if (contentEl) contentEl.classList.remove('mobile-active');
      } else {
        if (tabFiles) tabFiles.classList.remove('active');
        if (tabSymbols) tabSymbols.classList.add('active');
        if (sidebarEl) sidebarEl.classList.remove('mobile-active');
        if (contentEl) contentEl.classList.add('mobile-active');
      }
    }

    function renderSidebar() {
      fileListEl.innerHTML = '';
      let matchingFileCount = 0;
      diffData.files.forEach((file, fIdx) => {
        const matchingSymbols = file.symbols.filter(s => filterMatches(s, file));
        if (matchingSymbols.length === 0 && (activeFilter !== 'all' || searchQuery)) return;

        matchingFileCount++;
        const parts = file.path.split('/');
        const fileName = parts.pop();
        const dirPath = parts.join('/') + (parts.length ? '/' : '');

        const item = document.createElement('div');
        item.className = \`file-item \${fIdx === selectedFileIndex ? 'selected' : ''} \${focusedPanel === 'files' && fIdx === selectedFileIndex ? 'focused' : ''}\`;
        item.id = \`file-item-\${fIdx}\`;
        item.onclick = () => {
          selectedFileIndex = fIdx;
          renderSidebar();
          switchMobileView('symbols');
          scrollToSection(fIdx);
        };

        item.innerHTML = \`
          <div class="file-info">
            <span style="font-size: 13px;">📄</span>
            <span class="file-path" title="\${escapeHtml(file.path)}">
              <span class="file-dir">\${escapeHtml(dirPath)}</span>\${escapeHtml(fileName)}
            </span>
          </div>
          <div class="file-badges">
            <span class="file-count">\${matchingSymbols.length}</span>
          </div>
        \`;
        fileListEl.appendChild(item);
      });

      const mobileFileCountEl = document.getElementById('mobileFileCount');
      if (mobileFileCountEl) mobileFileCountEl.innerText = matchingFileCount;
    }

    function renderContent() {
      contentStageEl.innerHTML = '';
      let visibleSymbolIndex = 0;
      let totalVisible = 0;

      diffData.files.forEach((file, fIdx) => {
        const matchingSymbols = file.symbols.filter(s => filterMatches(s, file));
        if (matchingSymbols.length === 0) return;

        totalVisible += matchingSymbols.length;

        const section = document.createElement('div');
        section.className = 'file-section';
        section.id = \`section-\${fIdx}\`;

        const title = document.createElement('div');
        title.className = 'file-section-title';
        title.innerHTML = \`<span>📂</span> <span>\${escapeHtml(file.path)}</span>\`;
        section.appendChild(title);

        matchingSymbols.forEach(sym => {
          const cardIdx = visibleSymbolIndex++;
          const card = document.createElement('div');
          card.className = \`symbol-card \${focusedPanel === 'symbols' && cardIdx === selectedSymbolIndex ? 'focused' : ''}\`;
          card.id = \`symbol-card-\${cardIdx}\`;

          let statusClass = 'body_mod';
          let statusLabel = 'Body Modified';
          if (sym.status === 'SIGNATURE_MODIFIED') { statusClass = 'sig_mod'; statusLabel = '⚡ Sig Modified'; }
          else if (sym.status === 'ADDED') { statusClass = 'added'; statusLabel = '✨ Added'; }
          else if (sym.status === 'DELETED') { statusClass = 'deleted'; statusLabel = '🔥 Deleted'; }

          let diffContent = '';
          if (sym.status === 'SIGNATURE_MODIFIED' && sym.oldSignature) {
            diffContent = \`
              <div class="signature-diff-box">
                <div class="diff-line old"><span class="diff-icon">-</span><span>\${escapeHtml(sym.oldSignature)}</span></div>
                <div class="diff-line new"><span class="diff-icon">+</span><span>\${escapeHtml(sym.signature)}</span></div>
              </div>
            \`;
          } else if (sym.status === 'ADDED') {
            diffContent = \`
              <div class="signature-diff-box">
                <div class="diff-line new"><span class="diff-icon">+</span><span>\${escapeHtml(sym.signature)}</span></div>
              </div>
            \`;
          } else if (sym.status === 'DELETED') {
            diffContent = \`
              <div class="signature-diff-box">
                <div class="diff-line old"><span class="diff-icon">-</span><span>\${escapeHtml(sym.oldSignature || sym.signature)}</span></div>
              </div>
            \`;
          } else {
            diffContent = \`
              <div class="signature-diff-box">
                <div class="diff-line current"><span class="diff-icon"> </span><span>\${escapeHtml(sym.signature)}</span></div>
              </div>
            \`;
          }

          card.innerHTML = \`
            <div class="symbol-header">
              <div class="symbol-title-area">
                <span class="badge badge-kind \${sym.kind}">\${sym.kind}</span>
                <span class="symbol-name">\${escapeHtml(sym.name)}</span>
                <span class="badge badge-status \${statusClass}">\${statusLabel}</span>
              </div>
              <div class="symbol-meta">
                <span class="line-number">L\${sym.startLine}\${sym.endLine ? \`-L\${sym.endLine}\` : ''}</span>
              </div>
            </div>
            \${diffContent}
          \`;

          card.onclick = () => {
            selectedSymbolIndex = cardIdx;
            focusedPanel = 'symbols';
            renderSidebar();
            renderContent();
          };

          section.appendChild(card);
        });

        contentStageEl.appendChild(section);
      });

      const mobileSymbolCountEl = document.getElementById('mobileSymbolCount');
      if (mobileSymbolCountEl) mobileSymbolCountEl.innerText = totalVisible;

      if (totalVisible === 0) {
        contentStageEl.innerHTML = \`
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <h3>No symbols found</h3>
            <p>Try clearing your filter or adjusting your search query.</p>
          </div>
        \`;
      }
    }

    function scrollToSection(fIdx) {
      requestAnimationFrame(() => {
        const el = document.getElementById(\`section-\${fIdx}\`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    function scrollToFocusedSymbol() {
      const el = document.getElementById(\`symbol-card-\${selectedSymbolIndex}\`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function toggleHelpModal() {
      helpModal.classList.toggle('open');
    }

    // Filter Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        selectedSymbolIndex = 0;
        renderSidebar();
        renderContent();
      };
    });

    // Live Search
    searchInput.oninput = (e) => {
      searchQuery = e.target.value;
      selectedSymbolIndex = 0;
      renderSidebar();
      renderContent();
    };

    // Keyboard Shortcuts Listener
    document.addEventListener('keydown', (e) => {
      // If typing in search input
      if (document.activeElement === searchInput) {
        if (e.key === 'Escape') {
          searchInput.blur();
          searchQuery = '';
          searchInput.value = '';
          renderSidebar();
          renderContent();
        } else if (e.key === 'Enter') {
          searchInput.blur();
          focusedPanel = 'symbols';
          renderSidebar();
          renderContent();
        }
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        toggleHelpModal();
        return;
      }

      if (e.key === 'Escape') {
        if (helpModal.classList.contains('open')) {
          toggleHelpModal();
          return;
        }
        searchQuery = '';
        searchInput.value = '';
        activeFilter = 'all';
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
        renderSidebar();
        renderContent();
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        focusedPanel = focusedPanel === 'files' ? 'symbols' : 'files';
        renderSidebar();
        renderContent();
        return;
      }

      // Quick category filters: 1 - 5
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        const filters = ['all', 'sig_mod', 'body_mod', 'added', 'deleted'];
        const target = filters[parseInt(e.key, 10) - 1];
        activeFilter = target;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === target));
        selectedSymbolIndex = 0;
        renderSidebar();
        renderContent();
        return;
      }

      // Navigation: j/k or ArrowDown/ArrowUp
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (focusedPanel === 'files') {
          selectedFileIndex = Math.min(diffData.files.length - 1, selectedFileIndex + 1);
          renderSidebar();
          scrollToSection(selectedFileIndex);
        } else {
          selectedSymbolIndex++;
          renderContent();
          scrollToFocusedSymbol();
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (focusedPanel === 'files') {
          selectedFileIndex = Math.max(0, selectedFileIndex - 1);
          renderSidebar();
          scrollToSection(selectedFileIndex);
        } else {
          selectedSymbolIndex = Math.max(0, selectedSymbolIndex - 1);
          renderContent();
          scrollToFocusedSymbol();
        }
      }

      // Next / Previous file shortcuts: [ and ]
      if (e.key === ']') {
        e.preventDefault();
        selectedFileIndex = Math.min(diffData.files.length - 1, selectedFileIndex + 1);
        renderSidebar();
        scrollToSection(selectedFileIndex);
      } else if (e.key === '[') {
        e.preventDefault();
        selectedFileIndex = Math.max(0, selectedFileIndex - 1);
        renderSidebar();
        scrollToSection(selectedFileIndex);
      }
    });

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Initial render
    calculateCounts();
    renderSidebar();
    renderContent();
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
