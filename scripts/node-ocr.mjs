// Utilitaire de test : fait tourner la vraie chaîne PP-OCRv6 sous Node (onnxruntime-web, backend WASM, comme le navigateur).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import * as ort from 'onnxruntime-web/wasm';
import { createPipeline } from '../src/lib/ppocr/pipeline.js';
import { parseDict } from '../src/lib/ppocr/recognize.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export async function loadPipeline() {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmBinary = readFileSync(join(root, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'));   // Node : pas de fetch d'URL file://
  const opt = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  const detSession = await ort.InferenceSession.create(readFileSync(join(root, 'public/models/ppocrv6/det_small.onnx')), opt);
  const recSession = await ort.InferenceSession.create(readFileSync(join(root, 'public/models/ppocrv6/rec_small.onnx')), opt);
  const dict = parseDict(readDictFallback());
  return createPipeline({ ort, detSession, recSession, dict });
}
function readDictFallback() { return readFileSync(join(root, 'public/models/ppocrv6/dict.txt'), 'utf8'); }
export function decodeImage(path) {
  const buf = readFileSync(path);
  if (/\.png$/i.test(path)) { const p = PNG.sync.read(buf); return { data: new Uint8ClampedArray(p.data), width: p.width, height: p.height }; }
  const j = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  return { data: new Uint8ClampedArray(j.data), width: j.width, height: j.height };
}
