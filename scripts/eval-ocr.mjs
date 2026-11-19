// Mesure la lecture d'étiquettes sur le jeu synthétique de scripts/make_test_labels.py (vérité terrain : truth.json).
// Usage : node scripts/eval-ocr.mjs <dossier d'images> [--out resultats.json] [--max-side 960] [--unclip 1.6] [--passes 1]
// Les résultats sont des mesures sur images SYNTHÉTIQUES : un plancher de cohérence, pas une garantie en rayon.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPipeline, decodeImage } from './node-ocr.mjs';
import { readPixels } from '../src/lib/scanner.js';

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const truth = JSON.parse(readFileSync(join(dir, 'truth.json'), 'utf8'));
const pipe = await loadPipeline();
const cfg = { maxSide: Number(opt('max-side', 960)), passes: Number(opt('passes', 3)) };
const only = opt('only', null);
const rows = [];
for (const t of truth) {
  if (only && !t.file.includes(only)) continue;
  const img = decodeImage(join(dir, t.file));
  const t0 = performance.now();
  const trace = [];
  const parsed = await readPixels((im, o) => pipe.read(im, { ...o }), img, { currency: t.currency || 'XOF', maxSide: cfg.maxSide, passes: cfg.passes, trace });
  rows.push({ ...t, ms: Math.round(performance.now() - t0), parsed, trace });
  process.stderr.write('.');
}
process.stderr.write('\n');
writeFileSync(opt('out', '/tmp/eval-paddle.json'), JSON.stringify(rows, null, 1));
console.log(`${rows.length} images, ${Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length)} ms en moyenne`);
