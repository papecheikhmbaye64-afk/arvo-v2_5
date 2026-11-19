import test from 'node:test';
import assert from 'node:assert/strict';
import { convexHull, minAreaRect, unclip, corners } from '../src/lib/ppocr/geometry.js';
import { boxesFromMap, detSize } from '../src/lib/ppocr/detect.js';
import { decodeCTC, parseDict } from '../src/lib/ppocr/recognize.js';
import { wordsOf, buildLines, sameLine } from '../src/lib/ppocr/lines.js';
import { cropRect } from '../src/lib/ppocr/image.js';

const near = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('géométrie : rectangle orienté minimal retrouve taille et angle d\'un rectangle tourné', () => {
  const a = (20 * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  const pts = [[-100, -20], [100, -20], [100, 20], [-100, 20]].map(([s, t]) => [300 + s * ux + t * vx, 200 + s * uy + t * vy]);
  const r = minAreaRect(pts);
  near(r.w, 200); near(r.h, 40); near(r.cx, 300); near(r.cy, 200);
  near(Math.atan2(r.uy, r.ux), a, 0.01);
  assert.equal(convexHull([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 0.5]]).length, 4);
  assert.equal(corners(r).length, 4);
});

test('géométrie : « unclip » agrandit selon aire x ratio / périmètre', () => {
  const u = unclip({ cx: 0, cy: 0, w: 200, h: 40, ux: 1, uy: 0 }, 1.6);
  const d = (200 * 40 * 1.6) / (2 * 240);
  near(u.w, 200 + 2 * d, 1e-6); near(u.h, 40 + 2 * d, 1e-6);
});

test('détection : taille d\'entrée en multiples de 32, plafonnée, agrandie si minuscule', () => {
  const big = detSize(4000, 3000, 960); assert.ok(big.W % 32 === 0 && big.H % 32 === 0 && Math.max(big.W, big.H) <= 960 + 32);
  const small = detSize(300, 200, 960); assert.ok(Math.max(small.W, small.H) >= 600);
});

test('détection : la carte de probabilité donne des boîtes, les zones peu sûres sont écartées', () => {
  const W = 160, H = 96, prob = new Float32Array(W * H);
  const fill = (x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) prob[y * W + x] = v; };
  fill(20, 20, 120, 34, 0.9);     // une ligne de texte sûre
  fill(20, 60, 100, 72, 0.35);    // une tache incertaine (au-dessus du seuil de binarisation, sous celui de la boîte)
  const boxes = boxesFromMap(prob, W, H, { sx: 2, sy: 2 });
  assert.equal(boxes.length, 1);
  const b = boxes[0];
  assert.ok(b.w > 200 && b.h > 28, `${b.w}x${b.h}`);   // agrandie, et ramenée à l'image d'origine (x2)
  near(b.cx, 140, 3); near(b.cy, 54, 3);
});

test('reconnaissance : décodage CTC (blancs retirés, répétitions fusionnées), dictionnaire + espace', () => {
  const dict = parseDict('a\nb\nc');           // classes : 0 blanc, 1 a, 2 b, 3 c, 4 espace
  assert.deepEqual(dict, ['a', 'b', 'c', ' ']);
  const C = 5, T = 7, out = new Float32Array(T * C);
  const set = (t, k, p) => { out[t * C + k] = p; };
  [[0, 1, 0.9], [1, 1, 0.8], [2, 0, 0.9], [3, 1, 0.7], [4, 4, 0.95], [5, 3, 0.6], [6, 0, 0.9]].forEach(([t, k, p]) => set(t, k, p));
  const r = decodeCTC(out, T, C, dict);
  assert.equal(r.text, 'aa c');                // a (fusionné), blanc, a, espace, c
  near(r.conf, (0.9 + 0.7 + 0.95 + 0.6) / 4, 1e-6);
  assert.deepEqual(r.chars.map((c) => [c.t0, c.t1]), [[0, 2], [3, 4], [4, 5], [5, 6]]);
});

test('lignes : mots séparés par les espaces lus, un chiffre douteux fait baisser la confiance du mot', () => {
  const rect = { cx: 100, cy: 50, w: 200, h: 40, ux: 1, uy: 0 };
  const chars = [...'9 500'].map((ch, i) => ({ ch, p: ch === '0' && i === 3 ? 0.55 : 0.99, t0: i, t1: i + 1 }));
  const words = wordsOf({ chars, T: 5 }, rect);
  assert.deepEqual(words.map((w) => w.text), ['9', '500']);
  near(words[1].conf, 55, 1e-6);
  assert.ok(words[0].box.x1 <= words[1].box.x0 + 1);
});

const frag = (text, cx, cy, w, h, ux = 1, uy = 0) => {
  const rect = { cx, cy, w, h, ux, uy };
  return { rect, words: [{ text, conf: 99, height: h, box: { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 } }] };
};

test('lignes : « 4 », « 250 » et « FCFA » détectés séparément redeviennent une seule ligne', () => {
  const lines = buildLines([frag('250', 400, 284, 430, 180), frag('4', 130, 282, 180, 160), frag('FCFA', 690, 300, 200, 110), frag('Riz parfumé 5 kg', 300, 83, 516, 80)]);
  assert.deepEqual(lines.map((l) => l.text), ['Riz parfumé 5 kg', '4 250 FCFA']);
  assert.ok(lines[1].height >= 160);
});

test('lignes : deux lignes superposées d\'une étiquette penchée ne se mélangent pas', () => {
  const a = (12 * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
  // même direction, centres décalés de 130 px perpendiculairement au texte : lignes distinctes, même si leurs boîtes alignées sur les axes se chevauchent
  const top = frag('au lieu de 2 500 F', 500, 300, 420, 70, ux, uy);
  const price = frag('1 990 F', 520 - 130 * uy, 300 + 130 * ux, 380, 120, ux, uy);
  assert.equal(sameLine(top.rect, price.rect), false);
  assert.equal(buildLines([top, price]).length, 2);
});

test('lignes : la direction d\'une boîte presque carrée (lettre « g ») est ignorée', () => {
  const name = frag('Savon de Marseille 300', 300, 100, 560, 62, 0.996, 0.087);
  const g = frag('g', 620, 112, 40, 38, 0, 1);               // direction ambiguë (verticale)
  assert.equal(sameLine(name.rect, g.rect), true);
  assert.equal(buildLines([name, g])[0].text, 'Savon de Marseille 300 g');
});

test('image : découpe d\'un rectangle tourné -> bande horizontale, hauteur 48', () => {
  const W = 200, H = 120, data = new Uint8ClampedArray(W * H * 4).fill(255);
  const a = (15 * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
  for (let s = -60; s <= 60; s += 1) for (let t = -4; t <= 4; t += 1) {   // trait noir le long de l'axe du texte
    const x = Math.round(100 + s * ux - t * uy), y = Math.round(60 + s * uy + t * ux);
    data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
  }
  const crop = cropRect({ data, width: W, height: H }, { cx: 100, cy: 60, w: 140, h: 30, ux, uy }, 48);
  assert.equal(crop.height, 48);
  for (const x of [20, 100, 200]) assert.ok(crop.data[(24 * crop.width + x) * 4] < 60, `centre du trait en x=${x}`);   // le trait traverse le milieu de la bande
  assert.ok(crop.data[(2 * crop.width + 100) * 4] > 200);   // le bord haut reste blanc
});
