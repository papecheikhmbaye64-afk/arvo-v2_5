// Géométrie des boîtes de texte : enveloppe convexe, rectangle orienté minimal, agrandissement (« unclip » de DBNet).
// Fonctions pures, sans navigateur : testées sous Node.

/** Enveloppe convexe (chaîne monotone d'Andrew). `pts` : [[x, y], ...]. */
export function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = [];
  for (let i = p.length - 1; i >= 0; i -= 1) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

/**
 * Rectangle orienté d'aire minimale. Retourne { cx, cy, w, h, ux, uy } : `w` est toujours le grand côté (sens de lecture),
 * (ux, uy) le vecteur unitaire de ce côté, orienté vers la droite ; `h` le petit côté.
 */
export function minAreaRect(points) {
  const hull = convexHull(points);
  if (hull.length === 0) return null;
  if (hull.length < 3) {
    const xs = hull.map((q) => q[0]), ys = hull.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), ux: 1, uy: 0 };
  }
  let best = null;
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, vx = -uy, vy = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of hull) {
      const u = q[0] * ux + q[1] * uy, v = q[0] * vx + q[1] * vy;
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ux, uy, vx, vy, u0, u1, v0, v1 };
  }
  let { ux, uy, vx, vy } = best;
  let w = best.u1 - best.u0, h = best.v1 - best.v0;
  const mu = (best.u0 + best.u1) / 2, mv = (best.v0 + best.v1) / 2;
  const cx = mu * ux + mv * vx, cy = mu * uy + mv * vy;
  if (w < h) { [w, h] = [h, w]; [ux, uy] = [vx, vy]; }       // le grand côté devient le sens de lecture
  if (ux < 0 || (Math.abs(ux) < 1e-9 && uy < 0)) { ux = -ux; uy = -uy; }
  return { cx, cy, w, h, ux, uy };
}

/** Agrandit un rectangle comme DBNet (le noyau prédit est rétréci) : distance = aire × ratio / périmètre. */
export function unclip(r, ratio) {
  const d = (r.w * r.h * ratio) / (2 * (r.w + r.h));
  return { ...r, w: r.w + 2 * d, h: r.h + 2 * d };
}

/** Coins d'un rectangle orienté (haut-gauche, haut-droit, bas-droit, bas-gauche). */
export function corners(r) {
  const vx = -r.uy, vy = r.ux, a = r.w / 2, b = r.h / 2;
  return [[-a, -b], [a, -b], [a, b], [-a, b]].map(([s, t]) => [r.cx + s * r.ux + t * vx, r.cy + s * r.uy + t * vy]);
}

/** Boîte alignée sur les axes d'une portion [f0, f1] (fractions de la longueur) d'un rectangle orienté. */
export function sliceBox(r, f0, f1) {
  const vx = -r.uy, vy = r.ux;
  const pts = [];
  for (const f of [f0, f1]) for (const t of [-r.h / 2, r.h / 2]) { const s = (f - 0.5) * r.w; pts.push([r.cx + s * r.ux + t * vx, r.cy + s * r.uy + t * vy]); }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
