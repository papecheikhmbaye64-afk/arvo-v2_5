// Test de fumée du worker COMPILÉ (dist/assets/ocr.worker-*.js) : simule `self`, `fetch` et les messages du navigateur sous Node.
// Prérequis : `npm run build`. Usage : node scripts/smoke-worker.mjs <image.jpg>
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeImage } from './node-ocr.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const file = readdirSync(join(dist, 'assets')).find((f) => /^ocr\.worker-.*\.js$/.test(f));
if (!file) throw new Error('worker compilé introuvable : lancez npm run build');

const inbox = [];
let resolveNext;
globalThis.self = globalThis;
globalThis.location = { href: pathToFileURL(join(dist, 'assets', file)).href };   // présent dans un vrai worker
globalThis.postMessage = (m) => { inbox.push(m); resolveNext?.(); };
const realFetch = globalThis.fetch;
const base = pathToFileURL(join(dist, '/')).href;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('file:')) return new Response(readFileSync(new URL(u)), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
  return realFetch(url);
};
await import(pathToFileURL(join(dist, 'assets', file)).href);
const send = (m) => globalThis.onmessage({ data: m });
const waitFor = async (type) => { for (;;) { const i = inbox.findIndex((m) => m.type === type || m.type === 'error'); if (i >= 0) return inbox.splice(i, 1)[0]; await new Promise((r) => { resolveNext = r; setTimeout(r, 50); }); } };

const t0 = performance.now();
send({ type: 'init', base });
const ready = await waitFor('ready');
if (ready.type === 'error') throw new Error(ready.message);
const loads = inbox.filter((m) => m.type === 'progress' && m.stage === 'load').map((m) => m.pct);
console.log(`prêt en ${Math.round(performance.now() - t0)} ms ; progression de chargement : ${loads[0]}% … ${loads[loads.length - 1]}% (${loads.length} paliers)`);

const img = decodeImage(process.argv[2]);
const buf = img.data.slice().buffer;
const t1 = performance.now();
send({ type: 'read', id: 1, width: img.width, height: img.height, buffer: buf, maxSide: 960 });
const res = await waitFor('result');
if (res.type === 'error') throw new Error(res.message);
console.log(`lecture en ${Math.round(performance.now() - t1)} ms, ${res.boxes} boîtes`);
for (const l of res.lines) console.log('  ', Math.round(l.conf), l.text);
process.exit(0);
