// Static server for the GLB turnaround viewer. Serves this folder at / and the project at /repo/ (node tools/rig/viewer/server.mjs; the launch config "viewer").
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = fileURLToPath(new URL('../../..', import.meta.url)); // the project: /repo/public/fair/x.glb
const PORT = 5175;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.css': 'text/css' };

createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  let root = HERE;
  if (p.startsWith('/repo/')) { root = REPO; p = p.slice(5); }
  if (p === '/') p = '/index.html';
  const file = normalize(join(root, p));
  if (!file.startsWith(normalize(root))) { res.writeHead(403); res.end(); return; }
  let st; try { st = statSync(file); } catch { res.writeHead(404); res.end('not found: ' + p); return; }
  if (!st.isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('viewer on http://localhost:' + PORT));
