// Worker du lecteur d'étiquettes : PP-OCRv6 (détection + reconnaissance) via onnxruntime-web (WebAssembly), hors du fil de l'interface.
// Protocole : { type: 'init', base } -> progress{load}* puis ready ; { type: 'read', id, width, height, buffer, maxSide } -> progress{read}* puis result.
import * as ort from 'onnxruntime-web/wasm';
import { createPipeline } from './ppocr/pipeline.js';
import { parseDict } from './ppocr/recognize.js';
// Moteur WebAssembly : émis par Vite avec un nom à empreinte (cache longue durée), servi par l'appli elle-même.
import wasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';

// Tailles attendues (octets) : sert à calculer l'avancement du premier chargement si le serveur n'indique pas la taille.
const FILES = [
  { key: 'wasm', url: () => new URL(wasmUrl, import.meta.url).href, size: 14_848_852 },
  { key: 'det', url: (base) => new URL('models/ppocrv6/det_small.onnx', base).href, size: 9_929_594 },
  { key: 'rec', url: (base) => new URL('models/ppocrv6/rec_small.onnx', base).href, size: 21_234_383 },
  { key: 'dict', url: (base) => new URL('models/ppocrv6/dict.txt', base).href, size: 160_000 }
];

let pipeline = null;
const post = (m) => self.postMessage(m);
const tick = () => new Promise((r) => setTimeout(r));   // laisse passer les messages (progression) entre deux boîtes

async function download(url, expected, onBytes) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const total = Number(res.headers.get('content-length')) || expected;
  if (!res.body) { const b = new Uint8Array(await res.arrayBuffer()); onBytes(b.length); return b; }
  const reader = res.body.getReader();
  const parts = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length; onBytes(value.length, total);
  }
  const out = new Uint8Array(got); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function init({ base }) {
  const total = FILES.reduce((s, f) => s + f.size, 0);
  let loaded = 0, last = -1;
  const bytes = {};
  for (const f of FILES) {
    bytes[f.key] = await download(f.url(base), f.size, (n) => {
      loaded += n;
      const pct = Math.min(99, Math.floor((loaded / total) * 100));
      if (pct !== last) { last = pct; post({ type: 'progress', stage: 'load', pct }); }
    });
  }
  ort.env.wasm.wasmBinary = bytes.wasm;
  // Sans en-têtes d'isolation (COOP + COEP), pas de SharedArrayBuffer : un seul fil. Avec, on profite des cœurs du téléphone.
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, self.navigator?.hardwareConcurrency || 2) : 1;
  ort.env.wasm.proxy = false;
  const opt = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  const detSession = await ort.InferenceSession.create(bytes.det, opt);
  const recSession = await ort.InferenceSession.create(bytes.rec, opt);
  pipeline = createPipeline({ ort, detSession, recSession, dict: parseDict(new TextDecoder().decode(bytes.dict)) });
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') { await init(m); post({ type: 'ready' }); return; }
    if (m.type === 'read') {
      if (!pipeline) throw new Error('not ready');
      const img = { data: new Uint8ClampedArray(m.buffer), width: m.width, height: m.height };
      const out = await pipeline.read(img, { maxSide: m.maxSide, onProgress: (pct) => post({ type: 'progress', stage: 'read', pct }), yieldFn: tick });
      post({ type: 'result', id: m.id, lines: out.lines, boxes: out.boxes });
    }
  } catch (err) {
    post({ type: 'error', id: m.id, message: String(err?.message || err) });
  }
};
