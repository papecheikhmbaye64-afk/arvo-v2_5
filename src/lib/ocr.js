// Lecture d'une photo d'étiquette, entièrement sur l'appareil : PP-OCRv6 (PaddleOCR) exécuté en WebAssembly dans un Web Worker.
// - Modèles, moteur WebAssembly et dictionnaire sont servis par l'appli elle-même (public/models, public/ocr/ort) : aucun site tiers.
// - La photo n'est jamais envoyée, stockée ni conservée : décodée, réduite, lue, puis libérée.
// - Le moteur démarre à l'ouverture de la feuille de scan, est réutilisé d'un scan à l'autre, et s'arrête peu après sa fermeture.
import { readPixels } from './scanner.js';

const MAX_SIDE = 1600;       // une photo plus grande est réduite avant lecture (la lecture ralentit sans gagner en précision)
const IDLE_MS = 45_000;      // moteur gardé en mémoire après la fermeture de la feuille, pour un second scan immédiat

/** Erreur dont le `kind` ('engine' | 'image') permet d'afficher un message adapté. */
export class ScanError extends Error {
  constructor(kind, cause) { super(kind); this.kind = kind; this.cause = cause; }
}

/** Démarre le moteur (worker + modèles). `onProgress({ stage: 'load'|'ready'|'read', pct })` reçoit l'avancement. */
export function createEngine({ onProgress } = {}) {
  let worker = null, stopped = false, listener = onProgress, seq = 0;
  const pending = new Map();
  let resolveReady, rejectReady;
  const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
  ready.catch(() => {});

  const fail = (cause) => {
    const err = new ScanError('engine', cause);
    rejectReady(err);
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  try {
    worker = new Worker(new URL('./ocr.worker.js', import.meta.url), { type: 'module' });
  } catch (e) { fail(e); }

  if (worker) {
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') listener?.({ stage: m.stage, pct: m.pct });
      else if (m.type === 'ready') { listener?.({ stage: 'ready', pct: 100 }); resolveReady(); }
      else if (m.type === 'result') { pending.get(m.id)?.resolve(m); pending.delete(m.id); }
      else if (m.type === 'error') {
        if (m.id != null && pending.has(m.id)) { pending.get(m.id).reject(new ScanError('engine', m.message)); pending.delete(m.id); }
        else fail(m.message);
      }
    };
    worker.onerror = (e) => fail(e.message || e);
    worker.postMessage({ type: 'init', base: document.baseURI });
  }

  return {
    ready,
    setListener(fn) { listener = fn; },
    /** Lit des pixels { data, width, height } -> { lines, boxes }. La copie envoyée au worker est transférée, pas partagée. */
    async read(img, { maxSide = 960 } = {}) {
      await ready;
      if (stopped || !worker) throw new ScanError('engine');
      const id = ++seq;
      const copy = img.data.slice();
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'read', id, width: img.width, height: img.height, buffer: copy.buffer, maxSide }, [copy.buffer]);
      });
    },
    async terminate() {
      stopped = true;
      worker?.terminate(); worker = null;
      for (const p of pending.values()) p.reject(new ScanError('engine'));
      pending.clear();
    }
  };
}

// Moteur partagé : une seule instance en mémoire, réutilisée tant qu'on scanne, libérée après IDLE_MS d'inactivité.
let shared = null, idleTimer = null;

/** Récupère le moteur partagé (le démarre au besoin). `onProgress` remplace l'écouteur précédent. */
export function acquireEngine({ onProgress } = {}) {
  clearTimeout(idleTimer); idleTimer = null;
  if (!shared) {
    shared = createEngine({ onProgress });
    shared.ready.catch(() => { shared = null; });
  } else shared.setListener(onProgress);
  return shared;
}

/** Rend le moteur : il reste chargé IDLE_MS (ou s'arrête tout de suite si `hard`, par exemple après une annulation ou une erreur). */
export function releaseEngine(engine, { hard = false } = {}) {
  if (!engine) return;
  engine.setListener?.(null);
  if (hard || engine !== shared) { if (engine === shared) shared = null; engine.terminate(); return; }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (shared === engine) shared = null; engine.terminate(); }, IDLE_MS);
}

/**
 * Décode la photo (en respectant son orientation), la ramène à 1600 px au plus, et retourne ses pixels { data, width, height }.
 * Les ressources de décodage sont libérées immédiatement.
 */
export async function prepareImage(file) {
  let bitmap;
  try {
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { bitmap = await createImageBitmap(file); }
  } catch (e) { throw new ScanError('image', e); }
  const long = Math.max(bitmap.width, bitmap.height);
  const k = long > MAX_SIDE ? MAX_SIDE / long : 1;
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return { data, width: w, height: h };
  } catch (e) { throw new ScanError('image', e); }
  finally { bitmap.close?.(); canvas.width = 0; canvas.height = 0; }
}

/**
 * Lit une photo d'étiquette et renvoie l'analyse (voir labelParser.parseLabel).
 * `trace` (tableau, facultatif) reçoit les lignes lues à chaque passe.
 */
export async function readLabel(engine, file, { currency, onStep, trace } = {}) {
  onStep?.('prepare');
  const img = await prepareImage(file);
  await engine.ready;
  return readPixels((im, o) => engine.read(im, o), img, { currency, onStep, trace });
}
