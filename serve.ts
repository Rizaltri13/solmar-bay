// serve.ts — Solmar Bay's local development server (round 4 rewrite).
//
// A small but correct static server for the game/ folder, Node 22 standard
// library only:
//   * content-derived ETags (SHA-256 of the file bytes, truncated)
//   * Cache-Control that treats HTML as revalidate-always, text assets as
//     briefly cacheable, and everything else as cacheable a bit longer
//   * If-None-Match honoured with a bodyless 304
//   * gzip for compressible text assets when the client accepts it
//   * HEAD support, a PORT environment override, and nosniff everywhere
//
//   node serve.ts             → http://localhost:8080
//   PORT=9090 node serve.ts   → http://localhost:9090

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const serverDir = fileURLToPath(new URL('.', import.meta.url));
const documentRoot = join(serverDir, 'game');
const listenPort = Number.parseInt(process.env.PORT || '8080', 10) || 8080;

const MIME_BY_EXTENSION = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const GZIP_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);
const GZIP_MIN_BYTES = 512;

export function etagFor(bytes) {
  const digest = createHash('sha256').update(bytes).digest('hex');
  return `"${digest.slice(0, 32)}"`;
}

export function cacheControlFor(ext) {
  if (ext === '.html') return 'no-cache';
  if (GZIP_EXTENSIONS.has(ext)) return 'private, max-age=60, must-revalidate';
  return 'private, max-age=300';
}

function clientAcceptsGzip(request) {
  const header = String(request.headers['accept-encoding'] || '');
  return header
    .split(',')
    .some((token) => token.trim().toLowerCase().startsWith('gzip'));
}

function resolveRequestPath(request) {
  const url = new URL(request.url || '/', 'http://localhost');
  const decoded = decodeURIComponent(url.pathname);
  let candidate = normalize(join(documentRoot, decoded));
  if (!candidate.startsWith(documentRoot)) return null;
  const info = statSync(candidate, { throwIfNoEntry: false });
  if (info && info.isDirectory()) candidate = join(candidate, 'index.html');
  return candidate;
}

function handleRequest(request, response) {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end('method not allowed');
      return;
    }
    const filePath = resolveRequestPath(request);
    if (filePath === null) {
      response.writeHead(403);
      response.end('forbidden');
      return;
    }
    if (!existsSync(filePath)) {
      response.writeHead(404, { 'cache-control': 'no-store' });
      response.end('not found');
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const body = readFileSync(filePath);
    const etag = etagFor(body);
    const headers = {
      'content-type': MIME_BY_EXTENSION.get(ext) || 'application/octet-stream',
      etag,
      'cache-control': cacheControlFor(ext),
      vary: 'Accept-Encoding',
      'x-content-type-options': 'nosniff',
    };

    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, headers);
      response.end();
      return;
    }
    if (request.method === 'HEAD') {
      response.writeHead(200, { ...headers, 'content-length': body.length });
      response.end();
      return;
    }
    const shouldGzip = GZIP_EXTENSIONS.has(ext)
      && body.length > GZIP_MIN_BYTES
      && clientAcceptsGzip(request);
    if (shouldGzip) {
      const compressed = gzipSync(body, { level: 6 });
      response.writeHead(200, {
        ...headers,
        'content-encoding': 'gzip',
        'content-length': compressed.length,
      });
      response.end(compressed);
      return;
    }
    response.writeHead(200, { ...headers, 'content-length': body.length });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { 'cache-control': 'no-store' });
    response.end(String(error));
  }
}

const server = createServer(handleRequest);
server.on('error', (error) => {
  console.error(`serve.ts: could not listen on port ${listenPort}: ${error.message}`);
  process.exitCode = 1;
});
server.listen(listenPort, () => {
  console.log(`SOLMAR BAY at http://localhost:${listenPort}/  (serving game/, ETag + gzip enabled)`);
});
