/**
 * Standalone Client Application for SymbolDiff Visualizer.
 * Supports dynamic serving via share-server (/assets/symboldiff-app.js)
 * and offline inlined execution.
 */

(function () {
  if (window.__SYMBOLDIFF_INITIALIZED__) return;
  window.__SYMBOLDIFF_INITIALIZED__ = true; window.__SYMBOLDIFF_VERSION__ = "2.1.0";

  const diffData = window.__SYMBOLDIFF_DATA__ || window.diffData;
  if (!diffData) {
    console.error("[SymbolDiff] No diffData found to render.");
    return;
  }

  let fileFilterQuery = '';
    let selectedIndex = 0;
    let currentSymbolTab = 'diff'; // 'diff' | 'code'
    let collapsedFolderPaths = new Set();
    let lastBuiltTree = null;

    const viewContainer = document.getElementById('viewContainer');
    const helpModal = document.getElementById('helpModal');

    function getFileExt(filePath) {
      if (!filePath) return '';
      const parts = filePath.split('/');
      const fileName = parts.pop();
      const dotParts = fileName.split('.');
      return dotParts.length > 1 ? dotParts.pop().toLowerCase() : '';
    }

    function formatSymbolType(sym) {
      if (!sym) return '';
      const kind = sym.kind || '';

      if (kind === 'function' || kind === 'method') {
        const sig = sym.signature || '';
        const openParenIdx = sig.indexOf('(');
        if (openParenIdx !== -1) {
          let typeStr = sig.slice(openParenIdx).trim();
          typeStr = typeStr.replace(/\s*(?:\{|=>)\s*$/, '').trim();
          typeStr = typeStr.replace(/,\s*\}/g, ' }');
          typeStr = typeStr.replace(/(?:\s+\|\s+){2,}/g, ' | ');
          if (sym.generics && !typeStr.startsWith('<')) {
            typeStr = sym.generics + typeStr;
          }
          return typeStr;
        }
        if (sym.returnType) {
          return '(): ' + sym.returnType;
        }
        return '()';
      }

      if (kind === 'interface') {
        return sym.generics ? 'interface ' + sym.generics : 'interface';
      }

      if (kind === 'type') {
        if (sym.returnType) {
          let t = sym.returnType.replace(/(?:\s+\|\s+){2,}/g, ' | ').trim();
          if (t.length > 50) t = t.slice(0, 47) + '...';
          return '= ' + t;
        }
        return 'type';
      }

      if (kind === 'class') {
        return sym.generics ? 'class ' + sym.generics : 'class';
      }

      if (kind === 'enum') {
        return 'enum';
      }

      return kind || '';
    }

    function copyText(text, btn, feedbackLabel) {
      const doFeedback = () => {
        const orig = btn.innerHTML;
        btn.innerHTML = '✓ ' + (feedbackLabel || 'Copied');
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.classList.remove('copied');
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(doFeedback).catch(() => {
          fallbackCopy(text);
          doFeedback();
        });
      } else {
        fallbackCopy(text);
        doFeedback();
      }
    }

    function fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    function toggleHelpModal() {
      helpModal.classList.toggle('open');
    }

    // Route Parser: Hash-based routing
    // #/                         -> Files View
    // #/file/:fIdx               -> File Detail / Symbols View
    // #/file/:fIdx/sym/:sIdx     -> Symbol Inspection View
    function parseRoute() {
      const raw = window.location.hash || '';
      const clean = raw.indexOf('#') !== -1 ? raw.substring(raw.indexOf('#') + 1) : '';
      const parts = clean.split('/').filter(Boolean);

      if (parts.length === 0) {
        return { view: 'files' };
      }
      if (parts[0] === 'file' && parts.length === 2) {
        const fIdx = parseInt(parts[1], 10);
        return { view: 'file', fIdx: isNaN(fIdx) ? 0 : fIdx };
      }
      if (parts[0] === 'file' && parts[2] === 'sym' && parts.length === 4) {
        const fIdx = parseInt(parts[1], 10);
        const sIdx = parseInt(parts[3], 10);
        return { view: 'symbol', fIdx: isNaN(fIdx) ? 0 : fIdx, sIdx: isNaN(sIdx) ? 0 : sIdx };
      }
      return { view: 'files' };
    }

    function navigateTo(hash) {
      window.location.hash = hash;
    }

    // Router Render Dispatcher
    function renderApp(options = {}) {
      const route = parseRoute();
      viewContainer.innerHTML = '';

      if (route.view === 'files') {
        renderFilesView();
      } else if (route.view === 'file') {
        renderFileSymbolsView(route.fIdx);
      } else if (route.view === 'symbol') {
        renderSymbolView(route.fIdx, route.sIdx);
      }

      const listRows = getVisibleListRows();
      if (selectedIndex >= listRows.length) {
        selectedIndex = Math.max(0, listRows.length - 1);
      }
      updateFocusedItem({ scrollIntoView: false });

      if (options.scrollToTop) {
        window.scrollTo(0, 0);
      }
    }

    window.addEventListener('hashchange', () => {
      selectedIndex = 0;
      renderApp({ scrollToTop: true });
    });

    // ==========================================
    // TREE DATA STRUCTURE BUILDER
    // ==========================================
    function buildFileTree(filesList) {
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

      // Compact intermediate single-child directories with no direct files
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

      // Bottom-up aggregation of file counts and symbols
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

    function getAllDirPaths(node) {
      if (!node) return [];
      const paths = [];
      for (const child of node.dirs.values()) {
        paths.push(child.path);
        paths.push(...getAllDirPaths(child));
      }
      return paths;
    }

    // ==========================================
    // LEVEL 1: ALL FILES VIEW (COLLAPSIBLE TREE)
    // ==========================================
    function renderFilesView() {
      const query = fileFilterQuery.toLowerCase().trim();
      const filteredFiles = diffData.files
        .map((f, fIdx) => ({ file: f, fIdx }))
        .filter(item => {
          if (!query) return true;
          return item.file.path.toLowerCase().includes(query) ||
            item.file.symbols.some(s => s.name.toLowerCase().includes(query));
        });

      let totalAdded = 0;
      let totalDeleted = 0;
      let totalMod = 0;
      for (const f of diffData.files) {
        totalAdded += (f.symbolsAdded || 0);
        totalDeleted += (f.symbolsDeleted || 0);
        totalMod += (f.symbolsModified || 0);
      }

      // Page Banner with clear summary
      let bannerStatsHtml = '';
      const hasAnySymChanges = (totalAdded > 0 || totalDeleted > 0 || totalMod > 0);
      if (hasAnySymChanges) {
        let parts = [];
        if (totalAdded > 0) parts.push('<span class="sym-stat-add">+' + totalAdded + ' sym</span>');
        if (totalDeleted > 0) parts.push('<span class="sym-stat-del">-' + totalDeleted + ' sym</span>');
        let symStr = parts.join(' ') + (parts.length > 0 ? ' changed' : '');
        if (totalMod > 0) {
          symStr += (symStr ? ', ' : '') + '<span class="sym-stat-mod">⚡ ' + totalMod + ' mod</span>';
        }
        bannerStatsHtml = diffData.files.length + ' files touched &bull; ' + symStr;
      } else {
        bannerStatsHtml = diffData.files.length + ' files touched &bull; No code symbol modifications';
      }

      const banner = document.createElement('div');
      banner.className = 'page-banner';
      banner.innerHTML =
        '<div class="page-banner-main">' +
          '<div class="page-title">Changed Files</div>' +
          '<div class="page-subtitle">' + bannerStatsHtml + '</div>' +
        '</div>';
      viewContainer.appendChild(banner);

      // Filter Search Input
      const searchBox = document.createElement('div');
      searchBox.className = 'filter-input-wrapper';
      searchBox.innerHTML =
        '<span class="filter-icon">🔍</span>' +
        '<input type="text" id="fileFilterInput" class="filter-input" placeholder="Filter files or symbol names... (press /)" value="' + escapeHtml(fileFilterQuery) + '" autocomplete="off">';
      viewContainer.appendChild(searchBox);

      const inputEl = searchBox.querySelector('#fileFilterInput');
      inputEl.oninput = (e) => {
        fileFilterQuery = e.target.value;
        selectedIndex = 0;
        renderApp();
        const activeInput = document.getElementById('fileFilterInput');
        if (activeInput) {
          activeInput.focus();
          activeInput.setSelectionRange(fileFilterQuery.length, fileFilterQuery.length);
        }
      };

      if (filteredFiles.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<div class="empty-icon">🔍</div><div>No files matching "' + escapeHtml(fileFilterQuery) + '"</div>';
        viewContainer.appendChild(empty);
        return;
      }

      // Build Tree & Cache for shortcuts
      const tree = buildFileTree(filteredFiles);
      lastBuiltTree = tree;

      // Tree Toolbar Controls
      const toolbar = document.createElement('div');
      toolbar.className = 'tree-toolbar';
      toolbar.innerHTML =
        '<div class="tree-actions">' +
          '<button class="icon-btn" id="btnExpandAll" title="Expand All Folders (e)">⊞ Expand All</button>' +
          '<button class="icon-btn" id="btnCollapseAll" title="Collapse All Folders (c)">⊟ Collapse All</button>' +
        '</div>' +
        '<div class="tree-stats-summary">' +
          filteredFiles.length + ' changed ' + (filteredFiles.length === 1 ? 'file' : 'files') +
        '</div>';
      viewContainer.appendChild(toolbar);

      toolbar.querySelector('#btnExpandAll').onclick = () => {
        expandAllFolders();
      };
      toolbar.querySelector('#btnCollapseAll').onclick = () => {
        collapseAllFolders();
      };

      const listCard = document.createElement('div');
      listCard.className = 'list-card';

      const isSearchActive = Boolean(query);

      function renderTreeNode(node, depth, container) {
        // 1. Render Subdirectories (alphabetical)
        const sortedDirNames = Array.from(node.dirs.keys()).sort();
        for (const dirName of sortedDirNames) {
          const dirNode = node.dirs.get(dirName);
          const isCollapsed = !isSearchActive && collapsedFolderPaths.has(dirNode.path);

          const folderGroup = document.createElement('div');
          folderGroup.className = 'tree-folder-group' + (isCollapsed ? ' is-collapsed' : '');
          folderGroup.dataset.folderPath = dirNode.path;

          const folderRow = document.createElement('div');
          folderRow.className = 'list-row tree-folder-row';
          folderRow.dataset.rowType = 'folder';
          folderRow.dataset.folderPath = dirNode.path;
          folderRow.style.setProperty('--depth', depth);

          const hasFolderSymChanges = (dirNode.symbolsAdded > 0 || dirNode.symbolsDeleted > 0 || dirNode.symbolsModified > 0);
          let folderBadgesHtml = '';
          if (hasFolderSymChanges) {
            let parts = '';
            if (dirNode.symbolsAdded > 0) {
              parts += '<span class="sym-add-badge" title="' + dirNode.symbolsAdded + ' added symbols">+' + dirNode.symbolsAdded + ' sym</span>';
            }
            if (dirNode.symbolsDeleted > 0) {
              parts += '<span class="sym-del-badge" title="' + dirNode.symbolsDeleted + ' deleted symbols">-' + dirNode.symbolsDeleted + ' sym</span>';
            }
            if (dirNode.symbolsModified > 0) {
              parts += '<span class="sym-mod-badge" title="' + dirNode.symbolsModified + ' modified symbols">⚡ ' + dirNode.symbolsModified + ' mod</span>';
            }
            if (parts) {
              folderBadgesHtml = '<span class="folder-dot">&bull;</span>' + parts;
            }
          }

          folderRow.innerHTML =
            '<div class="list-row-left">' +
              '<span class="tree-chevron">' + (isCollapsed ? '▶' : '▼') + '</span>' +
              '<span class="folder-icon">📁</span>' +
              '<span class="folder-name">' + escapeHtml(dirNode.name) + '/</span>' +
            '</div>' +
            '<div class="list-row-right">' +
              '<div class="folder-stats-pill">' +
                '<span class="folder-files-count">' + dirNode.totalFiles + ' ' + (dirNode.totalFiles === 1 ? 'file' : 'files') + '</span>' +
                folderBadgesHtml +
              '</div>' +
            '</div>';

          folderRow.onclick = (e) => {
            e.preventDefault();
            toggleFolder(folderGroup);
          };

          folderGroup.appendChild(folderRow);

          const childrenContainer = document.createElement('div');
          childrenContainer.className = 'tree-folder-children';
          if (isCollapsed) {
            childrenContainer.style.display = 'none';
          }
          renderTreeNode(dirNode, depth + 1, childrenContainer);
          folderGroup.appendChild(childrenContainer);

          container.appendChild(folderGroup);
        }

        // 2. Render Files in this directory (with full file paths!)
        const sortedFiles = [...node.files].sort((a, b) => a.file.path.localeCompare(b.file.path));
        for (const item of sortedFiles) {
          const file = item.file;
          const fIdx = item.fIdx;

          const parts = file.path.split('/');
          const fileName = parts.pop();
          const dirPath = parts.join('/') + (parts.length ? '/' : '');
          const ext = getFileExt(fileName);
          const statusChar = file.statusChar || (file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : file.status === 'renamed' ? 'R' : 'M');
          const statusClass = 'status-' + statusChar.toLowerCase();

          const fileRow = document.createElement('a');
          fileRow.className = 'list-row tree-file-row';
          fileRow.href = '#/file/' + fIdx;
          fileRow.dataset.rowType = 'file';
          fileRow.dataset.fIdx = fIdx;
          fileRow.style.setProperty('--depth', depth > 0 ? depth : 0);

          const renameNotice = file.oldPath
            ? '<span class="rename-badge">← ' + escapeHtml(file.oldPath) + '</span>'
            : '';

          const hasFileSymChanges = (file.symbolsAdded > 0 || file.symbolsDeleted > 0 || file.symbolsModified > 0);
          let fileStatsHtml = '';
          if (hasFileSymChanges) {
            let badges = '';
            if (file.symbolsAdded > 0) {
              badges += '<span class="sym-add-badge" title="' + file.symbolsAdded + ' added symbols">+' + file.symbolsAdded + ' sym</span>';
            }
            if (file.symbolsDeleted > 0) {
              badges += '<span class="sym-del-badge" title="' + file.symbolsDeleted + ' deleted symbols">-' + file.symbolsDeleted + ' sym</span>';
            }
            if (file.symbolsModified > 0) {
              badges += '<span class="sym-mod-badge" title="' + file.symbolsModified + ' modified symbols">⚡ ' + file.symbolsModified + ' mod</span>';
            }
            if (file.symbols.length > 0) {
              badges += '<span class="sym-total-tag">' + file.symbols.length + ' sym</span>';
            }
            fileStatsHtml = '<div class="sym-counts-pill">' + badges + '</div>';
          } else {
            let locParts = [];
            if (file.additions > 0) locParts.push('+' + file.additions);
            if (file.deletions > 0) locParts.push('-' + file.deletions);
            if (locParts.length > 0) {
              fileStatsHtml = '<span class="loc-badge" title="Lines of code changed">' + locParts.join(' ') + ' loc</span>';
            }
          }

          fileRow.innerHTML =
            '<div class="list-row-left">' +
              '<span class="status-pill ' + statusClass + '" title="' + escapeHtml(file.statusLabel || file.status) + '">' + statusChar + '</span>' +
              (ext ? '<span class="type-pill ' + ext + '">' + ext + '</span>' : '') +
              '<div class="path-display" title="' + escapeHtml(file.path) + '">' +
                (dirPath ? '<span class="path-dir">' + escapeHtml(dirPath) + '</span>' : '') +
                '<span class="path-file">' + escapeHtml(fileName) + '</span>' +
              '</div>' +
              renameNotice +
            '</div>' +
            '<div class="list-row-right">' +
              fileStatsHtml +
              '<span class="row-arrow">›</span>' +
            '</div>';

          fileRow.onclick = () => {
            const listRows = getVisibleListRows();
            const idx = listRows.indexOf(fileRow);
            if (idx !== -1) selectedIndex = idx;
          };

          container.appendChild(fileRow);
        }
      }

      renderTreeNode(tree, 0, listCard);
      viewContainer.appendChild(listCard);
    }

    // ==========================================
    // LEVEL 2: FILE DETAIL & SYMBOLS VIEW
    // ==========================================
    function renderFileSymbolsView(fIdx) {
      const file = diffData.files[fIdx];
      if (!file) {
        navigateTo('#/');
        return;
      }

      const parts = file.path.split('/');
      const fileName = parts.pop();
      const ext = getFileExt(fileName);
      const statusChar = file.statusChar || (file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : file.status === 'renamed' ? 'R' : 'M');
      const statusClass = 'status-' + statusChar.toLowerCase();

      // Breadcrumb Navigation
      const nav = document.createElement('div');
      nav.className = 'breadcrumb-nav';
      nav.innerHTML =
        '<a href="#/" class="back-btn"><span style="font-size: 15px;">←</span> <span>All Files</span> <kbd>Esc</kbd></a>' +
        '<div class="breadcrumb-trail">' +
          '<a href="#/" class="breadcrumb-crumb">Files</a>' +
          '<span class="breadcrumb-sep">/</span>' +
          '<span class="breadcrumb-crumb active" title="' + escapeHtml(file.path) + '">' + escapeHtml(fileName) + '</span>' +
        '</div>';
      viewContainer.appendChild(nav);

      // File Info Card
      let fileSubtitleHtml = '';
      const hasCurrentFileSymChanges = file.symbolsAdded > 0 || file.symbolsDeleted > 0 || file.symbolsModified > 0;
      if (hasCurrentFileSymChanges) {
        let parts = [];
        if (file.symbolsAdded > 0) parts.push('<span class="sym-add-badge">+' + file.symbolsAdded + ' sym</span>');
        if (file.symbolsDeleted > 0) parts.push('<span class="sym-del-badge">-' + file.symbolsDeleted + ' sym</span>');
        let changeStr = parts.join(' ') + (parts.length > 0 ? ' changed' : '');
        if (file.symbolsModified > 0) {
          changeStr += (changeStr ? ', ' : '') + '<span class="sym-mod-badge">⚡ ' + file.symbolsModified + ' mod</span>';
        }
        fileSubtitleHtml = changeStr + (file.symbols.length > 0 ? ' &bull; ' + file.symbols.length + ' total symbols' : '');
      } else if (file.symbols.length > 0) {
        fileSubtitleHtml = file.symbols.length + ' total symbols &bull; No symbol modifications';
      } else {
        let locParts = [];
        if (file.additions > 0) locParts.push('+' + file.additions);
        if (file.deletions > 0) locParts.push('-' + file.deletions);
        const linesDiffNote = file.isBinary
          ? 'Binary file'
          : (locParts.length > 0 ? locParts.join(' ') + ' loc' : 'No line changes');
        fileSubtitleHtml = 'No exported code symbols &bull; ' + linesDiffNote;
      }

      const banner = document.createElement('div');
      banner.className = 'page-banner';
      banner.innerHTML =
        '<div class="page-banner-main">' +
          '<div class="page-title">' +
            '<span class="status-pill ' + statusClass + '">' + statusChar + '</span>' +
            (ext ? '<span class="type-pill ' + ext + '">' + ext + '</span>' : '') +
            '<span style="font-family: var(--font-mono); font-size: 14px;">' + escapeHtml(file.path) + '</span>' +
          '</div>' +
          '<div class="page-subtitle">' + fileSubtitleHtml + '</div>' +
        '</div>' +
        '<button class="icon-btn" data-copy="' + escapeHtml(file.path) + '" onclick="copyText(this.dataset.copy, this)">📋 Copy Path</button>';
      viewContainer.appendChild(banner);

      // If file has NO symbols (e.g. README.md, config)
      if (file.symbols.length === 0) {
        const noSymCard = document.createElement('div');
        noSymCard.className = 'list-card';

        let locParts = [];
        if (file.additions > 0) locParts.push('+' + file.additions);
        if (file.deletions > 0) locParts.push('-' + file.deletions);
        const linesDiffNote = file.isBinary
          ? 'Binary file modification'
          : 'File lines changed: ' + (locParts.length > 0 ? locParts.join(' ') + ' loc' : '0 loc');

        let fileHunksHtml = '';
        if (file.fileHunks && file.fileHunks.length > 0) {
          fileHunksHtml = renderDiffTableHtml(file.fileHunks);
        }

        noSymCard.innerHTML =
          '<div style="padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between;">' +
            '<div style="display: flex; align-items: center; gap: 8px; color: var(--text-secondary);">' +
              '<span>📄</span>' +
              '<span>No exported code symbols in this file (' + linesDiffNote + ')</span>' +
            '</div>' +
          '</div>' +
          (fileHunksHtml || '<div style="padding: 24px; text-align: center; color: var(--text-muted);">No diff hunks available.</div>');

        viewContainer.appendChild(noSymCard);
        return;
      }

      // Symbols List Card
      const listCard = document.createElement('div');
      listCard.className = 'list-card';

      file.symbols.forEach((sym, sIdx) => {
        let statusBadgeClass = 'body_mod';
        let statusLabel = 'Body Mod';
        if (sym.status === 'SIGNATURE_MODIFIED') { statusBadgeClass = 'sig_mod'; statusLabel = '⚡ Sig Mod'; }
        else if (sym.status === 'ADDED') { statusBadgeClass = 'added'; statusLabel = '✨ Added'; }
        else if (sym.status === 'DELETED') { statusBadgeClass = 'deleted'; statusLabel = '🔥 Deleted'; }

        const row = document.createElement('a');
        row.className = 'list-row sym-list-row' + (selectedIndex === sIdx ? ' focused' : '');
        row.href = '#/file/' + fIdx + '/sym/' + sIdx;
        row.id = 'list-item-' + sIdx;

        const symType = formatSymbolType(sym);

        row.innerHTML =
          '<div class="sym-row-header">' +
            '<div class="sym-row-badges">' +
              '<span class="sym-status-badge ' + statusBadgeClass + '">' + statusLabel + '</span>' +
              '<span class="kind-pill ' + (sym.kind || 'fn') + '">' + (sym.kind || 'fn') + '</span>' +
            '</div>' +
            '<div class="sym-row-meta">' +
              '<span class="sym-line-tag">L' + sym.startLine + (sym.endLine && sym.endLine !== sym.startLine ? '-L' + sym.endLine : '') + '</span>' +
              '<span class="row-arrow">›</span>' +
            '</div>' +
          '</div>' +
          '<div class="sym-row-body">' +
            '<span class="sym-name-text">' + escapeHtml(sym.name) + '</span>' +
            (symType ? '<span class="sym-type-text">' + escapeHtml(symType) + '</span>' : '') +
          '</div>';

        row.onclick = () => {
          selectedIndex = sIdx;
        };

        listCard.appendChild(row);
      });

      viewContainer.appendChild(listCard);
    }

    // ==========================================
    // LEVEL 3: SYMBOL INSPECTION VIEW
    // ==========================================
    function renderSymbolView(fIdx, sIdx) {
      const file = diffData.files[fIdx];
      if (!file || !file.symbols[sIdx]) {
        navigateTo('#/');
        return;
      }
      const sym = file.symbols[sIdx];
      const parts = file.path.split('/');
      const fileName = parts.pop();

      let statusBadgeClass = 'body_mod';
      let statusLabel = 'Body Modified';
      if (sym.status === 'SIGNATURE_MODIFIED') { statusBadgeClass = 'sig_mod'; statusLabel = '⚡ Signature Modified'; }
      else if (sym.status === 'ADDED') { statusBadgeClass = 'added'; statusLabel = '✨ Added Symbol'; }
      else if (sym.status === 'DELETED') { statusBadgeClass = 'deleted'; statusLabel = '🔥 Deleted Symbol'; }

      // Breadcrumb Navigation
      const nav = document.createElement('div');
      nav.className = 'breadcrumb-nav';
      nav.innerHTML =
        '<a href="#/file/' + fIdx + '" class="back-btn"><span style="font-size: 15px;">←</span> <span>' + escapeHtml(fileName) + '</span> <kbd>Esc</kbd></a>' +
        '<div class="breadcrumb-trail">' +
          '<a href="#/" class="breadcrumb-crumb">Files</a>' +
          '<span class="breadcrumb-sep">/</span>' +
          '<a href="#/file/' + fIdx + '" class="breadcrumb-crumb">' + escapeHtml(fileName) + '</a>' +
          '<span class="breadcrumb-sep">/</span>' +
          '<span class="breadcrumb-crumb active">' + escapeHtml(sym.name) + '</span>' +
        '</div>' +
        '<div style="display: flex; gap: 4px;">' +
          (sIdx > 0 ? '<a href="#/file/' + fIdx + '/sym/' + (sIdx - 1) + '" class="icon-btn" title="Previous Symbol ([)">‹ Prev</a>' : '') +
          (sIdx < file.symbols.length - 1 ? '<a href="#/file/' + fIdx + '/sym/' + (sIdx + 1) + '" class="icon-btn" title="Next Symbol (])">Next ›</a>' : '') +
        '</div>';
      viewContainer.appendChild(nav);

      // Symbol Header Card
      const headerCard = document.createElement('div');
      headerCard.className = 'symbol-header-card';
      headerCard.innerHTML =
        '<div class="symbol-header-top">' +
          '<div class="symbol-identity">' +
            '<span class="sym-status-badge ' + statusBadgeClass + '">' + statusLabel + '</span>' +
            '<span class="kind-pill ' + sym.kind + '">' + sym.kind + '</span>' +
            '<span class="symbol-main-name">' + escapeHtml(sym.name) + '</span>' +
          '</div>' +
          '<span class="sym-line-tag">Line ' + sym.startLine + (sym.endLine && sym.endLine !== sym.startLine ? ' to ' + sym.endLine : '') + '</span>' +
        '</div>' +
        (sym.signature ? '<div class="signature-block">' + escapeHtml(sym.signature) + '</div>' : '');
      viewContainer.appendChild(headerCard);

      // Viewer Card (Tabs for Diff & Actual Code)
      const viewerCard = document.createElement('div');
      viewerCard.className = 'viewer-card';

      const toolbar = document.createElement('div');
      toolbar.className = 'viewer-toolbar';
      toolbar.innerHTML =
        '<div class="tab-btn-group">' +
          '<button class="tab-btn ' + (currentSymbolTab === 'diff' ? 'active' : '') + '" id="tabBtnDiff">⚡ Traditional Diff <kbd style="font-size:9px;opacity:0.6;">1</kbd></button>' +
          '<button class="tab-btn ' + (currentSymbolTab === 'code' ? 'active' : '') + '" id="tabBtnCode">📄 Actual Code <kbd style="font-size:9px;opacity:0.6;">2</kbd></button>' +
        '</div>' +
        '<button class="icon-btn" id="btnCopyContent">📋 Copy ' + (currentSymbolTab === 'code' ? 'Code' : 'Diff') + ' <kbd>c</kbd></button>';

      viewerCard.appendChild(toolbar);

      toolbar.querySelector('#tabBtnDiff').onclick = () => {
        currentSymbolTab = 'diff';
        renderApp();
      };
      toolbar.querySelector('#tabBtnCode').onclick = () => {
        currentSymbolTab = 'code';
        renderApp();
      };
      toolbar.querySelector('#btnCopyContent').onclick = (e) => {
        const btn = e.currentTarget;
        const nl = String.fromCharCode(10);
        let textToCopy = '';
        if (currentSymbolTab === 'code') {
          textToCopy = sym.actualCode || '';
        } else {
          textToCopy = (sym.hunks || []).map(h => (h.header ? h.header + nl : '') + h.lines.map(l => (l.type === 'add' ? '+' : (l.type === 'del' ? '-' : ' ')) + l.text).join(nl)).join(nl);
        }
        copyText(textToCopy, btn, currentSymbolTab === 'code' ? 'Code Copied' : 'Diff Copied');
      };

      const contentBox = document.createElement('div');
      if (currentSymbolTab === 'diff') {
        contentBox.innerHTML = renderDiffTableHtml(sym.hunks);
      } else {
        contentBox.innerHTML = renderCodeTableHtml(sym.actualCode || '', sym.startLine);
      }

      viewerCard.appendChild(contentBox);
      viewContainer.appendChild(viewerCard);
    }

    // Helper to render unified diff table
    function renderDiffTableHtml(hunks) {
      if (!hunks || hunks.length === 0) {
        return '<div style="padding: 24px; text-align: center; color: var(--text-muted);">No modifications in body content.</div>';
      }
      let html = '<div class="diff-table-container">';
      for (const hunk of hunks) {
        if (hunk.header) {
          html += '<div class="diff-hunk-header">' + escapeHtml(hunk.header) + '</div>';
        }
        for (const line of hunk.lines) {
          const typeClass = line.type === 'add' ? 'add' : (line.type === 'del' ? 'del' : 'context');
          const prefix = line.type === 'add' ? '+' : (line.type === 'del' ? '-' : ' ');
          const oldNum = line.oldLine !== null ? line.oldLine : '';
          const newNum = line.newLine !== null ? line.newLine : '';
          html +=
            '<div class="diff-row ' + typeClass + '">' +
              '<div class="num-col">' + oldNum + '</div>' +
              '<div class="num-col">' + newNum + '</div>' +
              '<div class="prefix-col">' + prefix + '</div>' +
              '<div class="code-col">' + escapeHtml(line.text) + '</div>' +
            '</div>';
        }
      }
      html += '</div>';
      return html;
    }

    // Helper to render actual code view
    function renderCodeTableHtml(code, startLine) {
      if (!code) {
        return '<div style="padding: 24px; text-align: center; color: var(--text-muted);">No source code available.</div>';
      }
      const lines = code.split(String.fromCharCode(10));
      const baseLine = startLine || 1;
      let html = '<div class="diff-table-container" style="padding: 6px 0;">';
      for (let i = 0; i < lines.length; i++) {
        const lineNum = baseLine + i;
        html +=
          '<div class="diff-row context">' +
            '<div class="num-col">L' + lineNum + '</div>' +
            '<div class="code-col">' + escapeHtml(lines[i]) + '</div>' +
          '</div>';
      }
      html += '</div>';
      return html;
    }

    // Keyboard Shortcuts Listener
    document.addEventListener('keydown', (e) => {
      const route = parseRoute();
      const filterInput = document.getElementById('fileFilterInput');

      // If active typing in filter search
      if (document.activeElement === filterInput) {
        if (e.key === 'Escape') {
          filterInput.blur();
          fileFilterQuery = '';
          renderApp();
        } else if (e.key === 'Enter') {
          filterInput.blur();
          const visibleRows = getVisibleListRows();
          if (visibleRows.length > 0) visibleRows[0].click();
        }
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        toggleHelpModal();
        return;
      }

      // Back navigation: Esc, Backspace, or h / ArrowLeft
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'h' || e.key === 'ArrowLeft') {
        if (helpModal.classList.contains('open')) {
          toggleHelpModal();
          return;
        }
        if (route.view === 'symbol') {
          e.preventDefault();
          navigateTo('#/file/' + route.fIdx);
          return;
        } else if (route.view === 'file') {
          e.preventDefault();
          navigateTo('#/');
          return;
        }
      }

      // Quick tab toggle on Level 3
      if (route.view === 'symbol') {
        if (e.key === '1') {
          e.preventDefault();
          currentSymbolTab = 'diff';
          renderApp();
          return;
        }
        if (e.key === '2' || e.key === 'Tab') {
          e.preventDefault();
          currentSymbolTab = currentSymbolTab === 'diff' ? 'code' : 'diff';
          renderApp();
          return;
        }
        if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const copyBtn = document.getElementById('btnCopyContent');
          if (copyBtn) copyBtn.click();
          return;
        }
        if (e.key === ']' && route.sIdx < diffData.files[route.fIdx].symbols.length - 1) {
          e.preventDefault();
          navigateTo('#/file/' + route.fIdx + '/sym/' + (route.sIdx + 1));
          return;
        }
        if (e.key === '[' && route.sIdx > 0) {
          e.preventDefault();
          navigateTo('#/file/' + route.fIdx + '/sym/' + (route.sIdx - 1));
          return;
        }
      }

      // Search focus: /
      if (e.key === '/' && route.view === 'files') {
        e.preventDefault();
        if (filterInput) {
          filterInput.focus();
          filterInput.select();
        }
        return;
      }

      // List navigation: j / k or ArrowDown / ArrowUp
      const listRows = getVisibleListRows();
      if (listRows.length > 0) {
        if (e.key === 'j' || e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = Math.min(listRows.length - 1, selectedIndex + 1);
          updateFocusedItem();
          return;
        }
        if (e.key === 'k' || e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = Math.max(0, selectedIndex - 1);
          updateFocusedItem();
          return;
        }
        // Expand folder: ArrowRight on Level 1
        if (e.key === 'ArrowRight' && route.view === 'files') {
          const cur = listRows[selectedIndex];
          if (cur && cur.dataset.rowType === 'folder') {
            const folderGroup = cur.closest('.tree-folder-group');
            if (folderGroup && folderGroup.classList.contains('is-collapsed')) {
              e.preventDefault();
              toggleFolder(folderGroup, false);
              return;
            }
          }
        }
        // Collapse folder: ArrowLeft on Level 1
        if (e.key === 'ArrowLeft' && route.view === 'files') {
          const cur = listRows[selectedIndex];
          if (cur && cur.dataset.rowType === 'folder') {
            const folderGroup = cur.closest('.tree-folder-group');
            if (folderGroup && !folderGroup.classList.contains('is-collapsed')) {
              e.preventDefault();
              toggleFolder(folderGroup, true);
              return;
            }
          }
        }
        // Expand all folders: e on Level 1
        if (e.key === 'e' && route.view === 'files') {
          e.preventDefault();
          expandAllFolders();
          return;
        }
        // Collapse all folders: c on Level 1
        if (e.key === 'c' && route.view === 'files' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          collapseAllFolders();
          return;
        }
        // Drill down / Toggle folder: Enter, Space, l or ArrowRight (for files or non-files view)
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'l' || (e.key === 'ArrowRight' && route.view !== 'files')) {
          e.preventDefault();
          const cur = listRows[selectedIndex];
          if (cur) cur.click();
          return;
        }
      }
    });

    function getVisibleListRows() {
      const rows = document.querySelectorAll('.list-row');
      const visibleRows = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.offsetParent !== null) {
          visibleRows.push(row);
        }
      }
      return visibleRows;
    }

    function updateFocusedItem(options = {}) {
      const shouldScroll = options.scrollIntoView !== false;
      const listRows = getVisibleListRows();
      listRows.forEach((r, idx) => {
        r.classList.toggle('focused', idx === selectedIndex);
      });
      const cur = listRows[selectedIndex];
      if (cur && shouldScroll) {
        cur.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function toggleFolder(folderGroup, forceCollapse) {
      if (!folderGroup) return;
      const folderPath = folderGroup.dataset.folderPath;
      const childrenContainer = folderGroup.querySelector(':scope > .tree-folder-children');
      const chevron = folderGroup.querySelector(':scope > .tree-folder-row .tree-chevron');
      if (!childrenContainer) return;

      const shouldCollapse = (typeof forceCollapse === 'boolean')
        ? forceCollapse
        : !collapsedFolderPaths.has(folderPath);

      if (shouldCollapse) {
        collapsedFolderPaths.add(folderPath);
        folderGroup.classList.add('is-collapsed');
        childrenContainer.style.display = 'none';
        if (chevron) chevron.textContent = '▶';
      } else {
        collapsedFolderPaths.delete(folderPath);
        folderGroup.classList.remove('is-collapsed');
        childrenContainer.style.display = '';
        if (chevron) chevron.textContent = '▼';
      }

      const listRows = getVisibleListRows();
      const folderRow = folderGroup.querySelector(':scope > .tree-folder-row');
      const newIndex = listRows.indexOf(folderRow);
      if (newIndex !== -1) {
        selectedIndex = newIndex;
      } else if (selectedIndex >= listRows.length) {
        selectedIndex = Math.max(0, listRows.length - 1);
      }
      updateFocusedItem({ scrollIntoView: false });
    }

    function expandAllFolders() {
      collapsedFolderPaths.clear();
      const folderGroups = document.querySelectorAll('.tree-folder-group');
      folderGroups.forEach((group) => {
        group.classList.remove('is-collapsed');
        const children = group.querySelector(':scope > .tree-folder-children');
        if (children) children.style.display = '';
        const chevron = group.querySelector(':scope > .tree-folder-row .tree-chevron');
        if (chevron) chevron.textContent = '▼';
      });
      const listRows = getVisibleListRows();
      if (selectedIndex >= listRows.length) {
        selectedIndex = Math.max(0, listRows.length - 1);
      }
      updateFocusedItem({ scrollIntoView: false });
    }

    function collapseAllFolders() {
      const folderGroups = document.querySelectorAll('.tree-folder-group');
      folderGroups.forEach((group) => {
        const path = group.dataset.folderPath;
        if (path) collapsedFolderPaths.add(path);
        group.classList.add('is-collapsed');
        const children = group.querySelector(':scope > .tree-folder-children');
        if (children) children.style.display = 'none';
        const chevron = group.querySelector(':scope > .tree-folder-row .tree-chevron');
        if (chevron) chevron.textContent = '▶';
      });
      const listRows = getVisibleListRows();
      if (selectedIndex >= listRows.length) {
        selectedIndex = Math.max(0, listRows.length - 1);
      }
      updateFocusedItem({ scrollIntoView: false });
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

    function start() {
      renderApp({ scrollToTop: true });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
})();
