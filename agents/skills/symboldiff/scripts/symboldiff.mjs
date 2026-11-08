#!/usr/bin/env node

/**
 * SymbolDiff CLI: Symbol-level & File-tree diff engine with keyboard-driven HTML visualizer.
 * Universal zero-dependency Node.js ESM script.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseSymbols, diffLines, formatDiffHunks } from './parser.mjs';
import { generateHtml } from './html-template.mjs';

function printHelp() {
  console.log(`
⚡ SymbolDiff — Symbol-level & File-tree Git Diff Engine

USAGE:
  symboldiff [options] [<base_ref>] [<target_ref>]

EXAMPLES:
  symboldiff                     # Diff unstaged & staged working tree against HEAD
  symboldiff HEAD~1              # Diff working tree against HEAD~1
  symboldiff main                # Diff current branch against main
  symboldiff main feature/canvas # Diff main against feature/canvas

OPTIONS:
  --json                         # Output structured JSON for agents & tooling
  --markdown                     # Output markdown summary table only
  --no-open                      # Suppress automatic browser launch
  --html-only                    # Only generate HTML visualizer without stdout summary
  --out <path>                   # Save HTML visualizer to specific file path
  -h, --help                     # Display this help message
`);
}

function runGit(args, cwd = process.cwd()) {
  try {
    return execSync(`git ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    return null;
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.includes('-h') || rawArgs.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const isJson = rawArgs.includes('--json');
  const isMarkdown = rawArgs.includes('--markdown');
  const noOpen = rawArgs.includes('--no-open');
  const htmlOnly = rawArgs.includes('--html-only');

  const outIdx = rawArgs.indexOf('--out');
  const customOutPath = outIdx !== -1 && rawArgs[outIdx + 1] ? rawArgs[outIdx + 1] : null;

  const positional = rawArgs.filter(a => !a.startsWith('-') && a !== customOutPath);

  // Check git repository
  const gitRoot = runGit('rev-parse --show-toplevel')?.trim();
  if (!gitRoot) {
    console.error('❌ Error: Not a git repository.');
    process.exit(1);
  }

  let baseRef = null;
  let targetRef = null;
  let isWorkingTreeTarget = false;

  if (positional.length === 0) {
    baseRef = 'HEAD';
    isWorkingTreeTarget = true;
  } else if (positional.length === 1) {
    baseRef = positional[0];
    isWorkingTreeTarget = true;
  } else {
    baseRef = positional[0];
    targetRef = positional[1];
  }

  const comparisonTitle = isWorkingTreeTarget
    ? `${baseRef} ↔ Working Tree`
    : `${baseRef} ↔ ${targetRef}`;

function parseNameStatus(output) {
  if (!output) return [];
  const tokens = output.split('\0');
  const files = [];
  let i = 0;
  while (i < tokens.length) {
    const status = tokens[i++];
    if (!status) break;
    const code = status[0];
    if (code === 'R' || code === 'C') {
      const oldPath = tokens[i++];
      const newPath = tokens[i++];
      files.push({ statusCode: code, rawStatus: status, oldPath, filePath: newPath });
    } else {
      const filePath = tokens[i++];
      if (!filePath) break;
      files.push({ statusCode: code, rawStatus: status, filePath, oldPath: null });
    }
  }
  return files;
}

function parseNumstat(output) {
  if (!output) return new Map();
  const tokens = output.split('\0');
  const map = new Map();
  let i = 0;
  while (i < tokens.length) {
    const entry = tokens[i++];
    if (!entry) break;
    const tab1 = entry.indexOf('\t');
    const tab2 = entry.indexOf('\t', tab1 + 1);
    if (tab1 === -1 || tab2 === -1) break;
    const addsStr = entry.substring(0, tab1);
    const delsStr = entry.substring(tab1 + 1, tab2);
    const filePathRest = entry.substring(tab2 + 1);
    const isBinary = addsStr === '-';
    const additions = isBinary ? null : parseInt(addsStr, 10);
    const deletions = isBinary ? null : parseInt(delsStr, 10);
    if (filePathRest === '') {
      const oldPath = tokens[i++];
      const newPath = tokens[i++];
      map.set(newPath, { additions, deletions, isBinary, oldPath });
    } else {
      map.set(filePathRest, { additions, deletions, isBinary });
    }
  }
  return map;
}

function getStatusDetails(statusCode) {
  switch (statusCode) {
    case 'A': return { status: 'added', label: 'Added', char: 'A' };
    case 'D': return { status: 'deleted', label: 'Deleted', char: 'D' };
    case 'R': return { status: 'renamed', label: 'Renamed', char: 'R' };
    case 'C': return { status: 'copied', label: 'Copied', char: 'C' };
    case 'T': return { status: 'type_change', label: 'Type Change', char: 'T' };
    case 'U': return { status: 'unmerged', label: 'Unmerged', char: 'U' };
    case 'M':
    default:
      return { status: 'modified', label: 'Modified', char: 'M' };
  }
}

function calculateDiffstat(additions, deletions, isBinary) {
  if (isBinary || additions === null || deletions === null) {
    return { addBlocks: 0, delBlocks: 0, neutralBlocks: 5, total: 0 };
  }
  const total = additions + deletions;
  if (total === 0) {
    return { addBlocks: 0, delBlocks: 0, neutralBlocks: 5, total: 0 };
  }
  let add = Math.round(5 * (additions / total));
  let del = Math.round(5 * (deletions / total));
  if (additions > 0 && add === 0) add = 1;
  if (deletions > 0 && del === 0) del = 1;
  if (add + del > 5) {
    if (add > del) add = 5 - del;
    else del = 5 - add;
  }
  const neutral = Math.max(0, 5 - add - del);
  return { addBlocks: add, delBlocks: del, neutralBlocks: neutral, total };
}

function isNoiseFile(filePath) {
  return (
    filePath.endsWith('.lock') ||
    filePath.endsWith('.lockb') ||
    filePath.endsWith('-lock.json') ||
    filePath.endsWith('.png') ||
    filePath.endsWith('.jpg') ||
    filePath.endsWith('.jpeg') ||
    filePath.endsWith('.ico') ||
    filePath.endsWith('.gif') ||
    filePath.endsWith('.webp') ||
    filePath.endsWith('.woff') ||
    filePath.endsWith('.woff2') ||
    filePath.endsWith('.ttf')
  );
}

  // Get list of changed files with status and numstat
  let diffNameStatusCmd = isWorkingTreeTarget
    ? `diff --name-status -z -M ${baseRef}`
    : `diff --name-status -z -M ${baseRef} ${targetRef}`;
  let diffNumstatCmd = isWorkingTreeTarget
    ? `diff --numstat -z -M ${baseRef}`
    : `diff --numstat -z -M ${baseRef} ${targetRef}`;

  const diffNameStatusOutput = runGit(diffNameStatusCmd, gitRoot);
  const diffNumstatOutput = runGit(diffNumstatCmd, gitRoot);

  if (diffNameStatusOutput === null) {
    console.error(`❌ Error running git diff against '${baseRef}'. Check that the reference exists.`);
    process.exit(1);
  }

  let discoveredFiles = parseNameStatus(diffNameStatusOutput);
  const numstatMap = parseNumstat(diffNumstatOutput);

  // If working tree target, discover untracked files
  if (isWorkingTreeTarget) {
    const untrackedRaw = runGit('ls-files --others --exclude-standard -z', gitRoot);
    if (untrackedRaw) {
      const untrackedTokens = untrackedRaw.split('\0').filter(Boolean);
      for (const uf of untrackedTokens) {
        if (!discoveredFiles.some(f => f.filePath === uf)) {
          discoveredFiles.push({
            statusCode: 'A',
            rawStatus: '??',
            filePath: uf,
            oldPath: null,
            isUntracked: true
          });
        }
      }
    }
  }

  // Filter out lockfiles and image noise
  discoveredFiles = discoveredFiles.filter(f => !isNoiseFile(f.filePath));

  if (discoveredFiles.length === 0) {
    if (isJson) {
      console.log(JSON.stringify({ files: [], comparisonTitle, summary: { files: 0, symbols: 0 } }, null, 2));
    } else {
      console.log(`⚡ SymbolDiff: No changes detected for ${comparisonTitle}`);
    }
    process.exit(0);
  }

  const fileDiffs = [];
  let totalAdded = 0;
  let totalDeleted = 0;
  let totalSigMod = 0;
  let totalBodyMod = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;
  let totalFilesAdded = 0;
  let totalFilesModified = 0;
  let totalFilesDeleted = 0;
  let totalFilesRenamed = 0;

  for (const file of discoveredFiles) {
    const { statusCode, filePath, oldPath, isUntracked } = file;
    const statusDetails = getStatusDetails(statusCode);

    let additions = 0;
    let deletions = 0;
    let isBinary = false;

    if (isUntracked) {
      const fullPath = path.join(gitRoot, filePath);
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        additions = fileContent.split('\n').length;
        deletions = 0;
      } catch {
        isBinary = true;
        additions = null;
        deletions = null;
      }
    } else if (numstatMap.has(filePath)) {
      const stat = numstatMap.get(filePath);
      additions = stat.additions;
      deletions = stat.deletions;
      isBinary = stat.isBinary;
    } else if (statusCode === 'A') {
      additions = 0;
      deletions = 0;
    } else if (statusCode === 'D') {
      additions = 0;
      deletions = 0;
    }

    if (additions !== null) totalAdditions += additions;
    if (deletions !== null) totalDeletions += deletions;

    if (statusCode === 'A') totalFilesAdded++;
    else if (statusCode === 'D') totalFilesDeleted++;
    else if (statusCode === 'R' || statusCode === 'C') totalFilesRenamed++;
    else totalFilesModified++;

    let oldContent = '';
    let newContent = '';

    // Old content
    if (!statusCode.startsWith('A') && !isUntracked) {
      oldContent = runGit(`show ${baseRef}:"${oldPath || filePath}"`, gitRoot) || '';
    }

    // New content
    if (!statusCode.startsWith('D')) {
      if (isWorkingTreeTarget) {
        const fullPath = path.join(gitRoot, filePath);
        if (fs.existsSync(fullPath)) {
          try {
            newContent = fs.readFileSync(fullPath, 'utf-8');
          } catch {
            newContent = '';
          }
        }
      } else {
        newContent = runGit(`show ${targetRef}:"${filePath}"`, gitRoot) || '';
      }
    }

    const oldSymbols = parseSymbols(oldContent, oldPath || filePath);
    const newSymbols = parseSymbols(newContent, filePath);

    const oldMap = new Map(oldSymbols.map(s => [s.id, s]));
    const newMap = new Map(newSymbols.map(s => [s.id, s]));

    const changedSymbols = [];

    // Check for modified and added symbols
    for (const [id, newSym] of newMap.entries()) {
      if (!oldMap.has(id)) {
        const hunks = formatDiffHunks(diffLines(null, newSym.code));
        changedSymbols.push({
          ...newSym,
          status: 'ADDED',
          oldSignature: null,
          actualCode: newSym.code || '',
          hunks
        });
        totalAdded++;
      } else {
        const oldSym = oldMap.get(id);
        const sigChanged = oldSym.signature !== newSym.signature;
        const bodyChanged = oldSym.bodyHash !== newSym.bodyHash;

        if (sigChanged) {
          const hunks = formatDiffHunks(diffLines(oldSym.code, newSym.code));
          changedSymbols.push({
            ...newSym,
            status: 'SIGNATURE_MODIFIED',
            oldSignature: oldSym.signature,
            actualCode: newSym.code || '',
            oldCode: oldSym.code || '',
            hunks
          });
          totalSigMod++;
        } else if (bodyChanged) {
          const hunks = formatDiffHunks(diffLines(oldSym.code, newSym.code));
          changedSymbols.push({
            ...newSym,
            status: 'BODY_MODIFIED',
            oldSignature: null,
            actualCode: newSym.code || '',
            oldCode: oldSym.code || '',
            hunks
          });
          totalBodyMod++;
        }
      }
    }

    // Check for deleted symbols
    for (const [id, oldSym] of oldMap.entries()) {
      if (!newMap.has(id)) {
        const hunks = formatDiffHunks(diffLines(oldSym.code, null));
        changedSymbols.push({
          ...oldSym,
          status: 'DELETED',
          oldSignature: oldSym.signature,
          actualCode: oldSym.code || '',
          oldCode: oldSym.code || '',
          hunks
        });
        totalDeleted++;
      }
    }

    let fileSymbolsAdded = 0;
    let fileSymbolsDeleted = 0;
    let fileSymbolsModified = 0;
    for (const s of changedSymbols) {
      if (s.status === 'ADDED') fileSymbolsAdded++;
      else if (s.status === 'DELETED') fileSymbolsDeleted++;
      else fileSymbolsModified++;
    }

    let fileHunks = [];
    if (changedSymbols.length === 0 && !isBinary && (oldContent || newContent)) {
      fileHunks = formatDiffHunks(diffLines(oldContent, newContent));
    }

    fileDiffs.push({
      path: filePath,
      oldPath: oldPath || null,
      statusCode,
      status: statusDetails.status,
      statusLabel: statusDetails.label,
      statusChar: statusDetails.char,
      additions,
      deletions,
      isBinary,
      symbolsAdded: fileSymbolsAdded,
      symbolsDeleted: fileSymbolsDeleted,
      symbolsModified: fileSymbolsModified,
      diffstat: calculateDiffstat(additions, deletions, isBinary),
      symbols: changedSymbols,
      fileHunks
    });
  }

  const diffData = {
    comparisonTitle,
    timestamp: new Date().toISOString(),
    summary: {
      files: fileDiffs.length,
      filesAdded: totalFilesAdded,
      filesModified: totalFilesModified,
      filesDeleted: totalFilesDeleted,
      filesRenamed: totalFilesRenamed,
      totalAdditions,
      totalDeletions,
      totalSymbols: totalAdded + totalDeleted + totalSigMod + totalBodyMod,
      added: totalAdded,
      deleted: totalDeleted,
      signatureModified: totalSigMod,
      bodyModified: totalBodyMod
    },
    files: fileDiffs
  };

  // JSON mode
  if (isJson) {
    console.log(JSON.stringify(diffData, null, 2));
    process.exit(0);
  }

  // Generate HTML visualizer
  const htmlContent = generateHtml({ diffData, comparisonTitle, timestamp: diffData.timestamp });
  const htmlOutPath = customOutPath || path.join(os.tmpdir(), `symboldiff_${Date.now()}.html`);
  fs.writeFileSync(htmlOutPath, htmlContent, 'utf-8');

  // If --host is passed, host in ~/share
  if (rawArgs.includes('--host')) {
    try {
      const repoName = path.basename(gitRoot);
      const slug = `symboldiff-${repoName}`;
      execSync(`share "${htmlOutPath}" --name "${slug}" 2>/dev/null || host-report "${htmlOutPath}" --name "${slug}" 2>/dev/null || true`);
    } catch {}
  }

  // Launch browser unless --no-open is passed
  if (!noOpen) {
    try {
      const openCmd = process.platform === 'darwin' ? 'open' : (process.platform === 'win32' ? 'start' : 'xdg-open');
      execSync(`${openCmd} "${htmlOutPath}" 2>/dev/null || true`);
    } catch {
      // Ignore open error in headless
    }
  }

  if (htmlOnly) {
    console.log(`⚡ SymbolDiff HTML generated: ${htmlOutPath}`);
    process.exit(0);
  }

  // Print Markdown summary table to stdout for Agent / Terminal
  console.log(`\n# ⚡ SymbolDiff: ${comparisonTitle}\n`);
  console.log(`**Summary**: \`${diffData.summary.files}\` files changed (\`+${diffData.summary.totalAdditions}\` \`-${diffData.summary.totalDeletions}\` lines: \`${diffData.summary.filesAdded}\` added, \`${diffData.summary.filesModified}\` modified, \`${diffData.summary.filesDeleted}\` deleted) | \`${diffData.summary.totalSymbols}\` symbols changed (\`⚡ ${diffData.summary.signatureModified}\` sig mod, \`📝 ${diffData.summary.bodyModified}\` body mod, \`✨ ${diffData.summary.added}\` added, \`🔥 ${diffData.summary.deleted}\` deleted)\n`);
  console.log(`🖥️ **Interactive Visualizer**: [Open in Browser](file://${htmlOutPath})`);
  console.log(`📱 **Tailscale Phone Host**: \`share "${htmlOutPath}"\`\n`);

  for (const file of fileDiffs) {
    const hasSym = file.symbolsAdded > 0 || file.symbolsDeleted > 0 || file.symbolsModified > 0;
    let symStatStr = '';
    if (hasSym) {
      const parts = [];
      if (file.symbolsAdded > 0) parts.push(`+${file.symbolsAdded}`);
      if (file.symbolsDeleted > 0) parts.push(`-${file.symbolsDeleted}`);
      let s = parts.join(' ') + (parts.length > 0 ? ' symbols' : '');
      if (file.symbolsModified > 0) s += (s ? ', ' : '') + `⚡ ${file.symbolsModified} mod`;
      symStatStr = s;
    } else {
      let locParts = [];
      if (file.additions > 0) locParts.push(`+${file.additions}`);
      if (file.deletions > 0) locParts.push(`-${file.deletions}`);
      const locStr = locParts.length > 0 ? `${locParts.join(' ')} lines` : '0 lines';
      symStatStr = `${file.symbols.length > 0 ? `${file.symbols.length} symbols, ` : ''}${file.isBinary ? 'BIN' : locStr}`;
    }
    const renameNotice = file.oldPath ? ` *(renamed from \`${file.oldPath}\`)*` : '';
    console.log(`### 📂 \`${file.path}\` [${file.statusLabel}] (${symStatStr})${renameNotice}`);
    if (file.symbols.length === 0) {
      let locParts = [];
      if (file.additions > 0) locParts.push(`+${file.additions}`);
      if (file.deletions > 0) locParts.push(`-${file.deletions}`);
      const locStr = locParts.length > 0 ? `${locParts.join(' ')} lines` : '0 lines';
      console.log(`*No exported code symbols modified (${file.isBinary ? 'BIN' : locStr})*\n`);
      continue;
    }
    console.log(`| Symbol | Kind | Status | Signature / Detail |`);
    console.log(`| :--- | :--- | :--- | :--- |`);
    for (const sym of file.symbols) {
      let statusEmoji = '📝 Body Mod';
      if (sym.status === 'SIGNATURE_MODIFIED') statusEmoji = '⚡ Sig Mod';
      else if (sym.status === 'ADDED') statusEmoji = '✨ Added';
      else if (sym.status === 'DELETED') statusEmoji = '🔥 Deleted';

      const sigDetail = sym.status === 'SIGNATURE_MODIFIED' && sym.oldSignature
        ? `\`${sym.oldSignature}\` ➔ \`${sym.signature}\``
        : `\`${sym.signature}\``;

      console.log(`| **\`${sym.name}\`** | \`${sym.kind}\` | ${statusEmoji} | ${sigDetail} |`);
    }
    console.log('');
  }
}

main().catch(err => {
  console.error('❌ SymbolDiff Error:', err);
  process.exit(1);
});
