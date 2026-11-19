// Reconnaissance (PP-OCRv6 rec, SVTR + CTC) : tenseur d'entrée, décodage glouton, position de chaque caractère.
import { cropRect, toTensorBGR } from './image.js';

export const REC_H = 48;

/** Dictionnaire embarqué dans le modèle (métadonnée « character », un caractère par ligne). Classes : 0 = blanc, 1..N = dico, N+1 = espace. */
export function parseDict(text) {
  const chars = String(text).split('\n');
  if (chars.length && chars[chars.length - 1] === '') chars.pop();
  return [...chars, ' '];
}

/**
 * Sortie [T, C] (probabilités déjà normalisées) -> { text, conf, chars: [{ ch, p, t0, t1 }], T }.
 * Décodage CTC glouton : on fusionne les répétitions, on retire les blancs. `p` = probabilité du caractère.
 */
export function decodeCTC(out, T, C, dict) {
  const chars = [];
  let prev = -1;
  for (let t = 0; t < T; t += 1) {
    let k = 0, p = out[t * C];
    for (let c = 1; c < C; c += 1) { const v = out[t * C + c]; if (v > p) { p = v; k = c; } }
    if (k !== 0 && k === prev) { const last = chars[chars.length - 1]; last.t1 = t + 1; if (p > last.p) last.p = p; }
    else if (k !== 0) chars.push({ ch: dict[k - 1] ?? '', p, t0: t, t1: t + 1 });
    prev = k;
  }
  const kept = chars.filter((c) => c.ch !== '');
  const conf = kept.length ? kept.reduce((s, c) => s + c.p, 0) / kept.length : 0;
  return { text: kept.map((c) => c.ch).join(''), conf, chars: kept, T };
}

export function prepareRec(img, rect) {
  const crop = cropRect(img, rect, REC_H);
  return { tensor: toTensorBGR(crop), W: crop.width };
}
