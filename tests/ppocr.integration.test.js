// Test d'intégration : vrais modèles PP-OCRv6 (WebAssembly) + vraies photos de test, sous Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPipeline, decodeImage } from '../scripts/node-ocr.mjs';
import { readPixels } from '../src/lib/scanner.js';

let pipe;
const run = async (file, currency = 'XOF') => {
  pipe ??= await loadPipeline();
  return readPixels((im, o) => pipe.read(im, o), decodeImage(new URL(`./fixtures/${file}`, import.meta.url).pathname), { currency });
};

test('PP-OCRv6 : étiquette promo -> nom, prix promo, ancien prix, quantité', { timeout: 60000 }, async () => {
  const r = await run('promo_clean.jpg');
  assert.equal(r.status, 'ok');
  assert.equal(r.name, 'Sucre en poudre 1 kg');
  assert.equal(r.prices.find((p) => p.id === r.priceId).minor, 1990);
  assert.equal(r.oldPrice.minor, 2500);
  assert.equal(r.quantity.text, '1 kg');
});

test('PP-OCRv6 : étiquette photographiée de biais -> nom et prix corrects', { timeout: 60000 }, async () => {
  const r = await run('two_line_angle.jpg');
  assert.equal(r.status, 'ok');
  assert.equal(r.name, 'Huile Végétale 5 L');
  assert.equal(r.prices.find((p) => p.id === r.priceId).minor, 9500);
  assert.equal(r.currency, 'XOF');
});
