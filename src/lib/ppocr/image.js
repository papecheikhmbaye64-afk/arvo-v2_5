// Opérations d'image sur des pixels bruts { data: Uint8ClampedArray RGBA, width, height } : aucune dépendance au navigateur.

/** Redimensionnement bilinéaire. */
export function resize(img, w, h) {
  const { data, width: sw, height: sh } = img;
  const out = new Uint8ClampedArray(w * h * 4);
  const xr = sw / w, yr = sh / h;
  for (let y = 0; y < h; y += 1) {
    const fy = Math.max(0, (y + 0.5) * yr - 0.5), y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x += 1) {
      const fx = Math.max(0, (x + 0.5) * xr - 0.5), x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const a = (y0 * sw + x0) * 4, b = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, d = (y1 * sw + x1) * 4, o = (y * w + x) * 4;
      for (let k = 0; k < 3; k += 1) out[o + k] = (data[a + k] * (1 - tx) + data[b + k] * tx) * (1 - ty) + (data[c + k] * (1 - tx) + data[d + k] * tx) * ty;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/** RGBA -> tenseur Float32 [1, 3, H, W], canaux B, G, R, normalisés (v/255 - 0.5)/0.5 (convention des modèles PP-OCR). */
export function toTensorBGR(img) {
  const { data, width: w, height: h } = img;
  const n = w * h, t = new Float32Array(3 * n);
  for (let i = 0, j = 0; i < n; i += 1, j += 4) {
    t[i] = data[j + 2] / 127.5 - 1; t[n + i] = data[j + 1] / 127.5 - 1; t[2 * n + i] = data[j] / 127.5 - 1;
  }
  return t;
}

/**
 * Découpe un rectangle orienté `r` ({cx, cy, w, h, ux, uy}) de `img` et le redresse en une image de hauteur `outH`
 * (échantillonnage bilinéaire, bords répliqués). Largeur de sortie proportionnelle à la boîte.
 */
export function cropRect(img, r, outH = 48, maxW = 2400) {
  const { data, width: sw, height: sh } = img;
  const ow = Math.max(8, Math.min(maxW, Math.round((r.w / r.h) * outH)));
  const out = new Uint8ClampedArray(ow * outH * 4);
  const vx = -r.uy, vy = r.ux;
  for (let j = 0; j < outH; j += 1) {
    const t = ((j + 0.5) / outH - 0.5) * r.h;
    for (let i = 0; i < ow; i += 1) {
      const s = ((i + 0.5) / ow - 0.5) * r.w;
      const fx = Math.min(sw - 1, Math.max(0, r.cx + s * r.ux + t * vx - 0.5)), fy = Math.min(sh - 1, Math.max(0, r.cy + s * r.uy + t * vy - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      const a = (y0 * sw + x0) * 4, b = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, d = (y1 * sw + x1) * 4, o = (j * ow + i) * 4;
      for (let k = 0; k < 3; k += 1) out[o + k] = (data[a + k] * (1 - tx) + data[b + k] * tx) * (1 - ty) + (data[c + k] * (1 - tx) + data[d + k] * tx) * ty;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: ow, height: outH };
}
