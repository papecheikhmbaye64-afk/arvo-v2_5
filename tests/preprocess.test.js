import test from 'node:test';
import assert from 'node:assert/strict';
import { enhance } from '../src/lib/preprocess.js';

test('nettoyage d\'image : niveaux de gris, ombre dégradée retirée, texte toujours distinct du fond', () => {
  const w = 120, h = 80, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const shade = 90 + (x / w) * 160;                       // ombre : de 90 à 250 de gauche à droite
    const ink = x % 12 < 3 && y > 20 && y < 60;             // « traits » noirs
    const v = ink ? shade * 0.15 : shade;
    const j = (y * w + x) * 4; px[j] = v; px[j + 1] = v; px[j + 2] = v; px[j + 3] = 255;
  }
  enhance(px, w, h);
  const at = (x, y) => px[(y * w + x) * 4];
  for (let i = 0; i < px.length; i += 4) assert.ok(px[i] === px[i + 1] && px[i + 1] === px[i + 2] && px[i + 3] === 255);
  // fond clair et trait sombre aussi bien à gauche (ombre forte) qu'à droite (éclairé)
  for (const x0 of [0, 108]) { assert.ok(at(x0 + 6, 10) > 150, `fond ${x0}`); assert.ok(at(x0 + 1, 40) < 110, `trait ${x0}`); }
});
