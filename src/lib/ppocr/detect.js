// Détection du texte (PP-OCRv6 det, DBNet) : préparation de l'image, puis transformation de la carte de probabilité en boîtes.
import { resize, toTensorBGR } from './image.js';
import { minAreaRect, unclip } from './geometry.js';

export const DET = { thresh: 0.3, boxThresh: 0.6, unclip: 1.6, minSide: 3, minLong: 640 };

/** Taille d'entrée : côté long ramené à `maxSide` (ou agrandi jusqu'à `minLong` si la photo est minuscule), multiples de 32. */
export function detSize(w, h, maxSide, minLong = DET.minLong) {
  const long = Math.max(w, h);
  const k = long > maxSide ? maxSide / long : long < minLong ? minLong / long : 1;
  const m32 = (v) => Math.max(32, Math.round((v * k) / 32) * 32);
  return { W: m32(w), H: m32(h) };
}

export function prepareDet(img, maxSide) {
  const { W, H } = detSize(img.width, img.height, maxSide);
  const scaled = W === img.width && H === img.height ? img : resize(img, W, H);
  return { tensor: toTensorBGR(scaled), W, H, sx: img.width / W, sy: img.height / H };
}

/**
 * Carte de probabilité (W×H) -> boîtes orientées dans le repère de l'image d'origine.
 * Seuil, léger épaississement (2×2), composantes connexes, rectangle orienté minimal, score moyen, agrandissement.
 */
export function boxesFromMap(prob, W, H, { sx = 1, sy = 1, thresh = DET.thresh, boxThresh = DET.boxThresh, unclipRatio = DET.unclip } = {}) {
  const n = W * H;
  const bin = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) bin[i] = prob[i] > thresh ? 1 : 0;
  const dil = new Uint8Array(n);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const i = y * W + x;
    dil[i] = bin[i] | (x + 1 < W ? bin[i + 1] : 0) | (y + 1 < H ? bin[i + W] : 0) | (x + 1 < W && y + 1 < H ? bin[i + W + 1] : 0);
  }
  const seen = new Uint8Array(n), stack = new Int32Array(n), boxes = [];
  for (let s = 0; s < n; s += 1) {
    if (!dil[s] || seen[s]) continue;
    let top = 0, count = 0, sum = 0;
    const rowMin = new Map(), rowMax = new Map();
    stack[top++] = s; seen[s] = 1;
    while (top) {
      const i = stack[--top], y = (i / W) | 0, x = i - y * W;
      if (bin[i]) { count += 1; sum += prob[i]; }
      const a = rowMin.get(y); if (a === undefined || x < a) rowMin.set(y, x);
      const b = rowMax.get(y); if (b === undefined || x > b) rowMax.set(y, x);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (dil[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
      }
    }
    if (count < 4) continue;
    if (sum / count < boxThresh) continue;
    const pts = [];
    for (const [y, x0] of rowMin) { pts.push([x0, y], [rowMax.get(y) + 1, y + 1], [x0, y + 1], [rowMax.get(y) + 1, y]); }
    const r = minAreaRect(pts);
    if (!r || Math.min(r.w, r.h) < DET.minSide) continue;
    const u = unclip(r, unclipRatio);
    // Repère de l'image d'origine (l'échelle peut différer selon x et y : on convertit les axes).
    const ax = u.ux * sx, ay = u.uy * sy, aLen = Math.hypot(ax, ay) || 1;
    const bx = -u.uy * sx, by = u.ux * sy, bLen = Math.hypot(bx, by) || 1;
    boxes.push({ cx: u.cx * sx, cy: u.cy * sy, w: u.w * aLen, h: u.h * bLen, ux: ax / aLen, uy: ay / aLen, score: sum / count });
  }
  return boxes;
}
