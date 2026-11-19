// Logique de lecture d'une étiquette, indépendante du navigateur : passes de lecture successives -> analyse (labelParser).
// `read(img, { maxSide, onProgress })` est fourni par l'appelant (worker du navigateur, ou pipeline Node pour les tests).
import { parseLabel } from './labelParser.js';
import { enhance } from './preprocess.js';

export const MAX_MS = 12000;   // au-delà, on n'enchaîne plus de passes de secours (téléphone lent)

const rank = (r) => (r.status === 'ok' ? 2 : r.status === 'partial' ? 1 : 0);

/** Une copie nettoyée (gris, ombres, contraste) d'une image RGBA. */
export function flatten(img) {
  const data = new Uint8ClampedArray(img.data);
  enhance(data, img.width, img.height);
  return { data, width: img.width, height: img.height };
}

/**
 * Passes, de la plus courante à la plus coûteuse ; on s'arrête dès que nom ET prix sont lus avec assurance.
 *  1. résolution standard ; 2. résolution élevée (petits caractères) ; 3. résolution élevée sur image nettoyée (reflets, ombres).
 */
export function passesFor(maxSide, count = 3) {
  return [{ maxSide }, { maxSide: Math.max(maxSide, 1536) }, { maxSide: Math.max(maxSide, 1536), clean: true }].slice(0, count);
}

export async function readPixels(read, img, { currency, maxSide = 960, passes = 3, onStep, trace, now = () => performance.now() } = {}) {
  const results = [];
  const started = now();
  let cleaned = null;
  const list = passesFor(maxSide, passes);
  for (let k = 0; k < list.length; k += 1) {
    if (k > 0 && now() - started > MAX_MS) break;
    const p = list[k];
    onStep?.(k === 0 ? 'read' : 'retry');
    if (p.clean && !cleaned) cleaned = flatten(img);
    const { lines } = await read(p.clean ? cleaned : img, { maxSide: p.maxSide });
    trace?.push({ pass: `${p.maxSide}${p.clean ? '/clean' : ''}`, lines: lines.map((l) => `${Math.round(l.conf)}|h${Math.round(l.height)}|${l.text}`) });
    const parsed = parseLabel({ lines }, { currency });
    results.push(parsed);
    if (parsed.status === 'ok') break;
  }
  return mergePasses(results);
}

/** Meilleure passe (ok > partielle > échec, la plus précoce à égalité) ; reprend un nom lu par une autre passe s'il manque. */
export function mergePasses(results) {
  let best = results.reduce((a, r) => (rank(r) > rank(a) ? r : a), results[0]);
  if (!best.name) {
    const named = results.find((r) => r.name);
    if (named) best = { ...best, name: named.name, nameAlternatives: named.nameAlternatives, status: best.priceId ? 'ok' : 'partial' };
  }
  return best;
}
