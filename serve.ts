// SOLMAR BAY — local dev server (v3): serves game/ as a correct static
// server with content-based ETags, Cache-Control, gzip for text assets,
// and a PORT env override. Node 22 standard library only — no deps.
//   node serve.ts            # http://localhost:8080
//   PORT=9090 node serve.ts  # http://localhost:9090
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'game');
const port = Number.parseInt(process.env.PORT || '8080', 10) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);

export function etagFor(bytes) {
  return '"' + createHash('sha256').update(bytes).digest('hex').slice(0, 32) + '"';
}

export function cacheControlFor(ext) {
  if (ext === '.html') return 'no-cache';
  if (COMPRESSIBLE.has(ext)) return 'private, max-age=60, must-revalidate';
  return 'private, max-age=300';
}

function wantsGzip(req) {
  const enc = String(req.headers['accept-encoding'] || '');
  return enc.split(',').some((part) => part.trim().toLowerCase().startsWith('gzip'));
}

const server = createServer((req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }); res.end('method not allowed'); return;
    }
    const url = new URL(req.url || '/', 'http://localhost');
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
    if (statSync(path, { throwIfNoEntry: false })?.isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) { res.writeHead(404, { 'cache-control': 'no-store' }); res.end('not found'); return; }
    const ext = extname(path).toLowerCase();
    const raw = readFileSync(path);
    const etag = etagFor(raw);
    const baseHeaders = {
      'content-type': TYPES[ext] || 'application/octet-stream',
      etag,
      'cache-control': cacheControlFor(ext),
      vary: 'Accept-Encoding',
      // The game ships only its own static files; forbid MIME sniffing so
      // a .txt or .json can never be reinterpreted as script by a browser.
      'x-content-type-options': 'nosniff',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, baseHeaders); res.end(); return;
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, { ...baseHeaders, 'content-length': raw.length }); res.end(); return;
    }
    if (COMPRESSIBLE.has(ext) && raw.length > 512 && wantsGzip(req)) {
      const zipped = gzipSync(raw, { level: 6 });
      res.writeHead(200, { ...baseHeaders, 'content-encoding': 'gzip', 'content-length': zipped.length });
      res.end(zipped); return;
    }
    res.writeHead(200, { ...baseHeaders, 'content-length': raw.length });
    res.end(raw);
  } catch (e) {
    res.writeHead(500, { 'cache-control': 'no-store' }); res.end(String(e));
  }
});

server.listen(port, () => {
  console.log(`SOLMAR BAY at http://localhost:${port}/  (serving game/, ETag + gzip enabled)`);
});
