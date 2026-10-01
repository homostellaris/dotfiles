#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

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

const server = http.createServer((req, res) => {
  // Parse URL pathname
  let reqPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);

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
  if (path.basename(filePath) === 'timers' || ext === '.json') {
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

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Tailscale Share Server listening on http://${HOST}:${PORT}`);
  console.log(`Serving directory: ${ROOT_DIR}`);
});
