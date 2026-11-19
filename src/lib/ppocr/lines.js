// Des boîtes lues -> lignes de texte au format attendu par labelParser.parseLabel :
// { text, conf (0-100), height, top, box, words: [{ text, conf, height, box }] }.
import { sliceBox } from './geometry.js';

/** Découpe un texte lu en mots (séparés par des espaces lus), avec boîte et confiance. Un mot chiffré prend sa plus faible confiance de chiffre. */
export function wordsOf(read, rect) {
  const words = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((c) => c.ch).join('');
    const hasDigit = /\d/.test(text);
    const probs = cur.map((c) => c.p), digits = cur.filter((c) => /\d/.test(c.ch)).map((c) => c.p);
    const conf = 100 * (hasDigit ? Math.min(...digits) : probs.reduce((s, p) => s + p, 0) / probs.length);
    const f0 = cur[0].t0 / read.T, f1 = cur[cur.length - 1].t1 / read.T;
    words.push({ text, conf, height: rect.h, box: sliceBox(rect, f0, f1) });
    cur = [];
  };
  for (const c of read.chars) { if (/\s/.test(c.ch)) flush(); else cur.push(c); }
  flush();
  return words;
}

const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const COS_MAX_TILT = Math.cos((12 * Math.PI) / 180);

/**
 * Deux fragments appartiennent-ils à la même ligne ? Test dans le repère du texte (et non sur des boîtes alignées aux axes,
 * qui se chevauchent sur une étiquette penchée et mélangeraient des lignes différentes) :
 * même direction (±12°), centres presque alignés perpendiculairement, et écart le long du texte petit devant sa hauteur.
 */
export function sameLine(a, b, gapRatio = 0.6) {
  // La direction d'une boîte presque carrée (« g », « F ») est ambiguë : on prend celle de la boîte la plus allongée.
  const asp = (r) => r.w / r.h;
  const ref = asp(a) >= asp(b) ? a : b, other = ref === a ? b : a;
  if (asp(other) >= 2 && a.ux * b.ux + a.uy * b.uy < COS_MAX_TILT) return false;
  const ux = ref.ux, uy = ref.uy;
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const along = dx * ux + dy * uy, perp = -dx * uy + dy * ux;
  const hMax = Math.max(a.h, b.h);
  if (Math.abs(perp) > 0.5 * hMax) return false;
  const gap = Math.abs(along) - (a.w + b.w) / 2;
  return gap <= gapRatio * hMax && gap >= -0.5 * Math.min(a.w, b.w);
}

/**
 * Regroupe les fragments d'une même ligne. Le détecteur coupe souvent « 4 250 » en « 4 » et « 250 », ou isole « FCFA » :
 * lus à part, ces morceaux feraient prendre 250 pour le prix.
 */
export function buildLines(fragments, { gapRatio = 0.6 } = {}) {
  const frags = fragments.filter((f) => f.words.length);
  const parent = frags.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < frags.length; i += 1) for (let j = i + 1; j < frags.length; j += 1) {
    if (sameLine(frags[i].rect, frags[j].rect, gapRatio)) parent[find(j)] = find(i);
  }
  const groups = new Map();
  frags.forEach((f, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); });
  const lines = [];
  for (const g of groups.values()) {
    const { ux, uy } = g[0].rect;
    g.sort((a, b) => (a.rect.cx * ux + a.rect.cy * uy) - (b.rect.cx * ux + b.rect.cy * uy));
    const words = g.flatMap((f) => f.words);
    const box = words.map((w) => w.box).reduce(union);
    const conf = words.reduce((s, w) => s + w.conf, 0) / words.length;
    lines.push({ text: words.map((w) => w.text).join(' '), conf, height: Math.max(...words.map((w) => w.height)), top: box.y0, box, words });
  }
  return lines.sort((a, b) => a.top - b.top);
}
