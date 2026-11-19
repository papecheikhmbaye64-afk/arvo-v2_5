// Chaîne complète PP-OCRv6 : détection -> boîtes -> reconnaissance -> lignes. Indépendante du navigateur :
// `ort` (onnxruntime-web) et les sessions sont fournis par l'appelant (worker du navigateur, ou Node pour les tests).
import { prepareDet, boxesFromMap } from './detect.js';
import { prepareRec, decodeCTC } from './recognize.js';
import { wordsOf, buildLines } from './lines.js';

export const MAX_BOXES = 60;   // une étiquette n'en contient pas davantage ; borne le temps de lecture sur une photo de rayon

export function createPipeline({ ort, detSession, recSession, dict }) {
  async function detect(img, maxSide) {
    const p = prepareDet(img, maxSide);
    const out = await detSession.run({ [detSession.inputNames[0]]: new ort.Tensor('float32', p.tensor, [1, 3, p.H, p.W]) });
    const map = out[detSession.outputNames[0]].data;
    return boxesFromMap(map, p.W, p.H, { sx: p.sx, sy: p.sy });
  }
  async function recognizeBox(img, rect) {
    const { tensor, W } = prepareRec(img, rect);
    const out = await recSession.run({ [recSession.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, 48, W]) });
    const o = out[recSession.outputNames[0]];
    const [, T, C] = o.dims;
    return decodeCTC(o.data, T, C, dict);
  }
  /** Lit une image { data, width, height } -> { lines, boxes }. */
  async function read(img, { maxSide = 960, onProgress, yieldFn } = {}) {
    const boxes = (await detect(img, maxSide)).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, MAX_BOXES);
    const fragments = [];
    for (let i = 0; i < boxes.length; i += 1) {
      const rect = boxes[i];
      const r = await recognizeBox(img, rect);
      if (r.text.trim()) fragments.push({ rect, read: r, words: wordsOf(r, rect) });
      onProgress?.(Math.round(((i + 1) / boxes.length) * 100));
      if (yieldFn) await yieldFn();
    }
    return { lines: buildLines(fragments), boxes: boxes.length };
  }
  return { read, detect, recognizeBox };
}
