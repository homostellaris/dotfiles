#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import net from 'node:net';

const PORT = 8787;
const HOST = '127.0.0.1';

function resolveRootDir() {
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

  return defaultPublic;
}

const ROOT_DIR = resolveRootDir();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function checkPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1', timeout: 300 });
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

async function handleDevServersApi(req, res) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });

  const result = {
    starfocus: [],
    banerry: [],
    other: [],
    timestamp: Date.now(),
  };

  try {
    const psOut = execSync('ps -eo pid,command', { encoding: 'utf-8', timeout: 2000 });
    const lines = psOut.split('\n');
    const seen = new Set();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || /grep|ps -eo/i.test(line)) continue;

      const isDev = /next dev|bun dev|bun run dev|start-server\.js|convex dev|vite/i.test(line);
      if (!isDev) continue;

      const pidMatch = line.match(/^(\d+)\s+(.*)$/);
      if (!pidMatch) continue;
      const pid = parseInt(pidMatch[1], 10);
      const cmd = pidMatch[2];

      let project = 'other';
      if (/starfocus/i.test(cmd)) project = 'starfocus';
      else if (/banerry/i.test(cmd)) project = 'banerry';

      let port = null;
      const portMatch = cmd.match(/-p\s+(\d+)|--port\s+(\d+)/);
      if (portMatch) {
        port = parseInt(portMatch[1] || portMatch[2], 10);
      } else if (project === 'starfocus') {
        port = 6600;
      } else if (project === 'banerry') {
        port = 6700;
      }

      let worktree = 'main';
      const wtMatch = cmd.match(/\.worktrees\/([^\/\s]+)/);
      if (wtMatch) worktree = wtMatch[1];

      // Try reading exact working directory from /proc/pid/cwd
      try {
        const cwdLink = fs.readlinkSync(`/proc/${pid}/cwd`);
        const subMatch = cwdLink.match(/\.worktrees\/([^\/\s]+)/);
        if (subMatch) worktree = subMatch[1];
      } catch {}

      const key = `${project}:${port}:${worktree}`;
      if (port && !seen.has(key)) {
        seen.add(key);
        const isOpen = await checkPortListening(port);
        const serverInfo = {
          project,
          port,
          worktree,
          pid,
          command: cmd.slice(0, 100),
          isOpen,
          localUrl: `http://localhost:${port}`,
          tailscaleUrl: `http://omarchy.tail29c7da.ts.net:${port}`,
        };
        if (project === 'starfocus') result.starfocus.push(serverInfo);
        else if (project === 'banerry') result.banerry.push(serverInfo);
        else result.other.push(serverInfo);
      }
    }

    // Default port fallbacks check
    const is6600 = await checkPortListening(6600);
    if (is6600 && !result.starfocus.some(s => s.port === 6600)) {
      result.starfocus.push({
        project: 'starfocus',
        port: 6600,
        worktree: 'main',
        isOpen: true,
        localUrl: 'http://localhost:6600',
        tailscaleUrl: 'http://omarchy.tail29c7da.ts.net:6600',
      });
    }
    const is6603 = await checkPortListening(6603);
    if (is6603 && !result.starfocus.some(s => s.port === 6603)) {
      result.starfocus.push({
        project: 'starfocus',
        port: 6603,
        worktree: 'legacy-6603',
        isOpen: true,
        localUrl: 'http://localhost:6603',
        tailscaleUrl: 'http://omarchy.tail29c7da.ts.net:6603',
      });
    }
    const is6700 = await checkPortListening(6700);
    if (is6700 && !result.banerry.some(s => s.port === 6700)) {
      result.banerry.push({
        project: 'banerry',
        port: 6700,
        worktree: 'main',
        isOpen: true,
        localUrl: 'http://localhost:6700',
        tailscaleUrl: 'http://omarchy.tail29c7da.ts.net:6700',
      });
    }
  } catch (err) {
    result.error = err.message;
  }

  res.end(JSON.stringify(result, null, 2));
}

const server = http.createServer(async (req, res) => {
  // Parse URL pathname
  let reqPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);

  if (reqPath === '/api/dev-servers') {
    await handleDevServersApi(req, res);
    return;
  }

  if (reqPath === '/assets/symboldiff-app.js' || reqPath === '/assets/symboldiff.js') {
    const clientScriptPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../skills/symboldiff/scripts/symboldiff-client.js');
    if (fs.existsSync(clientScriptPath)) {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      fs.createReadStream(clientScriptPath).pipe(res);
      return;
    }
  }

  // Normalize path to prevent path traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(ROOT_DIR, safePath);

  // If path is a directory, ensure trailing slash for relative asset resolution
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    if (!reqPath.endsWith('/')) {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      res.writeHead(301, { 'Location': reqPath + '/' + urlObj.search });
      res.end();
      return;
    }
    const indexPath = path.join(filePath, 'index.html');
    if (fs.existsSync(indexPath)) {
      filePath = indexPath;
    }
  } else if (!fs.existsSync(filePath)) {
    // If not found, try appending .html (e.g. /lift -> /lift.html)
    const withHtml = filePath + '.html';
    if (fs.existsSync(withHtml)) {
      filePath = withHtml;
    }
  }

  // Check if file exists and is a file
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 Not Found</h1><p><a href="/">Return to Dashboard</a></p>');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  let contentType = MIME_TYPES[ext] || 'application/octet-stream';
  if (filePath.endsWith(path.join('api', 'timers')) || ext === '.json') {
    contentType = 'application/json; charset=utf-8';
  }

  const headers = {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
  };

  // Prevent aggressive browser caching of HTML, manifest, and service worker files
  if (ext === '.html' || ext === '.webmanifest' || path.basename(filePath) === 'sw.js') {
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
  } else {
    headers['Cache-Control'] = 'public, max-age=3600';
  }

  if (ext === '.html') {
    let htmlContent = fs.readFileSync(filePath, 'utf-8');
    if (htmlContent.includes('const diffData =') && htmlContent.includes('// Router Render Dispatcher')) {
      htmlContent = htmlContent.replace(
        /<script>[\s\S]*?const diffData = (\{[\s\S]*?\});[\s\S]*?<\/script>/,
        '<script>window.__SYMBOLDIFF_DATA__ = $1; const diffData = window.__SYMBOLDIFF_DATA__;</script><script src="/assets/symboldiff-app.js"></script>'
      );
    }
    res.writeHead(200, headers);
    res.end(htmlContent);
    return;
  }

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Tailscale Share Server listening on http://${HOST}:${PORT}`);
  console.log(`Serving directory: ${ROOT_DIR}`);
});
