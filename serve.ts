// Tiny static server for local play-testing: serves game/ on :8080.
// Node 22 standard library only — no dependencies, no build step.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'game');
const port = parseInt(process.env.PORT || '8080', 10);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
    if (statSync(path, { throwIfNoEntry: false })?.isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(readFileSync(path));
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});

server.listen(port, () => {
  console.log(`SOLMAR BAY at http://localhost:${port}/  (serving game/)`);
});
