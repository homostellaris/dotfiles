#!/usr/bin/env node

/**
 * Universal Agent Report & Artifact Host for Tailscale.
 * Hosts any HTML report, visualizer, or dashboard on your private Tailscale network
 * and maintains an index gallery at ~/.local/share/agent-reports/index.html.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const WIN_REPORTS_DIR = '/mnt/c/Users/mrdan/.local/share/agent-reports';
const LINUX_REPORTS_DIR = path.join(os.homedir(), '.local/share/agent-reports');
const REPORTS_DIR = fs.existsSync('/mnt/c/Users/mrdan') ? WIN_REPORTS_DIR : LINUX_REPORTS_DIR;

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

function updateIndexHtml() {
  if (!fs.existsSync(REPORTS_DIR)) return;

  const entries = fs.readdirSync(REPORTS_DIR, { withFileTypes: true })
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

  const listItems = entries.map(e => {
    const formattedDate = e.mtime.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
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
  <title>Agent Reports & Artifacts</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
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
      --font-mono: 'Fira Code', monospace;
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
      max-width: 720px;
    }
    header {
      margin-bottom: 28px;
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
    .report-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .report-card {
      display: flex;
      align-items: center;
      gap: 14px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 18px;
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
      font-size: 22px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      width: 42px;
      height: 42px;
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
      font-size: 15px;
      color: var(--text);
      font-family: var(--font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
      padding: 48px 0;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-icon">🌐</div>
        <div>
          <h1>Agent Reports & Artifacts</h1>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Hosted privately via Tailscale</div>
        </div>
      </div>
      <span class="badge">${entries.length} reports</span>
    </header>

    <input type="text" id="filterInput" class="search-input" placeholder="Filter reports by name..." autocomplete="off">

    <div class="report-grid" id="reportGrid">
      ${listItems || '<div class="empty-state">No reports hosted yet. Run <code>host-report &lt;file.html&gt;</code> to host one.</div>'}
    </div>
  </div>

  <script>
    const filterInput = document.getElementById('filterInput');
    const reportGrid = document.getElementById('reportGrid');
    filterInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const cards = reportGrid.querySelectorAll('.report-card');
      cards.forEach(card => {
        const text = card.innerText.toLowerCase();
        card.style.display = text.includes(q) ? 'flex' : 'none';
      });
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(REPORTS_DIR, 'index.html'), html, 'utf-8');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(`
🌐 host-report: Host artifacts & HTML reports on your private Tailscale network

USAGE:
  host-report <file.html> [--name <slug>] [--open]

EXAMPLES:
  host-report /tmp/symboldiff.html
  host-report /tmp/review.html --name banerry-canvas
  host-report --status

OPTIONS:
  --name <slug>      Custom name for the report (default: basename of file)
  --status           Show Tailscale Serve status and active URLs
  --open             Open the hosted report in local browser
  -h, --help         Show this help message
`);
    process.exit(0);
  }

  // Ensure directory exists
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const { hostname, ip, magicDns } = getTailscaleInfo();

  if (args.includes('--status')) {
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

  updateIndexHtml();

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
