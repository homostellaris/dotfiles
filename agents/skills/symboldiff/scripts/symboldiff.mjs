#!/usr/bin/env node

/**
 * SymbolDiff CLI: Symbol-level & File-tree diff engine with keyboard-driven HTML visualizer.
 * Universal zero-dependency Node.js ESM script.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseSymbols } from './parser.mjs';
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

  // Get list of changed files
  let diffNameStatusCmd = isWorkingTreeTarget
    ? `diff --name-status ${baseRef}`
    : `diff --name-status ${baseRef} ${targetRef}`;

  const diffOutput = runGit(diffNameStatusCmd, gitRoot);
  if (diffOutput === null) {
    console.error(`❌ Error running git diff against '${baseRef}'. Check that the reference exists.`);
    process.exit(1);
  }

  const lines = diffOutput.trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
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

  for (const line of lines) {
    const parts = line.split(/\s+/);
    const statusCode = parts[0];
    const filePath = parts[1];

    // Filter non-code files or lock files
    if (filePath.endsWith('.lock') || filePath.endsWith('-lock.json') || filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.ico')) {
      continue;
    }

    let oldContent = '';
    let newContent = '';

    // Old content
    if (!statusCode.startsWith('A')) {
      oldContent = runGit(`show ${baseRef}:"${filePath}"`, gitRoot) || '';
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

    const oldSymbols = parseSymbols(oldContent, filePath);
    const newSymbols = parseSymbols(newContent, filePath);

    const oldMap = new Map(oldSymbols.map(s => [s.id, s]));
    const newMap = new Map(newSymbols.map(s => [s.id, s]));

    const changedSymbols = [];

    // Check for modified and added symbols
    for (const [id, newSym] of newMap.entries()) {
      if (!oldMap.has(id)) {
        changedSymbols.push({
          ...newSym,
          status: 'ADDED',
          oldSignature: null
        });
        totalAdded++;
      } else {
        const oldSym = oldMap.get(id);
        const sigChanged = oldSym.signature !== newSym.signature;
        const bodyChanged = oldSym.bodyHash !== newSym.bodyHash;

        if (sigChanged) {
          changedSymbols.push({
            ...newSym,
            status: 'SIGNATURE_MODIFIED',
            oldSignature: oldSym.signature
          });
          totalSigMod++;
        } else if (bodyChanged) {
          changedSymbols.push({
            ...newSym,
            status: 'BODY_MODIFIED',
            oldSignature: null
          });
          totalBodyMod++;
        }
      }
    }

    // Check for deleted symbols
    for (const [id, oldSym] of oldMap.entries()) {
      if (!newMap.has(id)) {
        changedSymbols.push({
          ...oldSym,
          status: 'DELETED',
          oldSignature: oldSym.signature
        });
        totalDeleted++;
      }
    }

    if (changedSymbols.length > 0) {
      fileDiffs.push({
        path: filePath,
        statusCode,
        symbols: changedSymbols
      });
    }
  }

  const diffData = {
    comparisonTitle,
    timestamp: new Date().toISOString(),
    summary: {
      files: fileDiffs.length,
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
  console.log(`**Summary**: \`${diffData.summary.files}\` files modified | \`${diffData.summary.totalSymbols}\` symbols changed (\`⚡ ${diffData.summary.signatureModified}\` sig mod, \`📝 ${diffData.summary.bodyModified}\` body mod, \`✨ ${diffData.summary.added}\` added, \`🔥 ${diffData.summary.deleted}\` deleted)\n`);
  console.log(`🖥️ **Interactive Visualizer**: [Open in Browser](file://${htmlOutPath})`);
  console.log(`📱 **Tailscale Phone Host**: \`share "${htmlOutPath}"\`\n`);

  for (const file of fileDiffs) {
    console.log(`### 📂 \`${file.path}\``);
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
