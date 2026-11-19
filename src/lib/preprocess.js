// Prétraitement facultatif d'une photo : niveaux de gris, ombres gommées, contraste étiré.
// Utilisé seulement en dernier recours (voir scanner.js) : PP-OCR lit mieux les photos naturelles, sans traitement.
// Fonction pure sur des pixels RGBA : testée sous Node.

/** Niveaux de gris, fond uniformisé (ombres, dégradés), puis étirement du contraste. Modifie `px` sur place. */
export function enhance(px, w, h, { blockDiv = 8 } = {}) {
  const n = w * h;
  const g = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < n; i += 1, j += 4) g[i] = (px[j] * 299 + px[j + 1] * 587 + px[j + 2] * 114) / 1000;

  // Fond estimé par la moyenne de blocs (interpolée) : on divise par lui pour retirer les ombres.
  const bs = Math.max(24, Math.round(Math.max(w, h) / blockDiv));
  const bw = Math.ceil(w / bs), bh = Math.ceil(h / bs);
  const sum = new Float64Array(bw * bh), cnt = new Uint32Array(bw * bh);
  for (let y = 0; y < h; y += 1) {
    const row = Math.floor(y / bs) * bw;
    for (let x = 0; x < w; x += 1) { const k = row + Math.floor(x / bs); sum[k] += g[y * w + x]; cnt[k] += 1; }
  }
  const bg = new Float32Array(bw * bh);
  for (let k = 0; k < bg.length; k += 1) bg[k] = sum[k] / cnt[k];
  const at = (bx, by) => bg[Math.min(bh - 1, Math.max(0, by)) * bw + Math.min(bw - 1, Math.max(0, bx))];
  const out = new Float32Array(n);
  let lo = 255, hi = 0;
  const hist = new Uint32Array(256);
  for (let y = 0; y < h; y += 1) {
    const fy = y / bs - 0.5, by = Math.floor(fy), ty = fy - by;
    for (let x = 0; x < w; x += 1) {
      const fx = x / bs - 0.5, bx = Math.floor(fx), tx = fx - bx;
      const b = (at(bx, by) * (1 - tx) + at(bx + 1, by) * tx) * (1 - ty) + (at(bx, by + 1) * (1 - tx) + at(bx + 1, by + 1) * tx) * ty;
      // Le fond local devient gris clair (200) ; ce qui est plus clair ou plus sombre garde son écart.
      const v = Math.max(0, Math.min(255, (g[y * w + x] / Math.max(24, b)) * 200));
      out[y * w + x] = v;
      hist[Math.round(v)] += 1;
    }
  }
  // Étirement entre les percentiles 1 % et 99 % (robuste aux reflets et aux pixels isolés).
  let acc = 0;
  for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v -= 1) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
  const span = Math.max(40, hi - lo);
  for (let i = 0, j = 0; i < n; i += 1, j += 4) {
    const v = Math.max(0, Math.min(255, ((out[i] - lo) / span) * 255));
    px[j] = px[j + 1] = px[j + 2] = v; px[j + 3] = 255;
  }
}
