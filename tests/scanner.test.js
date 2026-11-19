import test from 'node:test';
import assert from 'node:assert/strict';
import { readPixels, passesFor, mergePasses } from '../src/lib/scanner.js';
import { parseLabel } from '../src/lib/labelParser.js';

const line = (text, height, conf = 99) => ({ text, conf, height, top: 0, words: text.split(' ').map((t) => ({ text: t, conf, height })) });
const img = { data: new Uint8ClampedArray(16 * 16 * 4).fill(200), width: 16, height: 16 };

test('passes : résolution standard, puis élevée, puis élevée sur image nettoyée', () => {
  assert.deepEqual(passesFor(960), [{ maxSide: 960 }, { maxSide: 1536 }, { maxSide: 1536, clean: true }]);
  assert.equal(passesFor(960, 1).length, 1);
});

test('lecture : on s\'arrête dès que nom et prix sont sûrs', async () => {
  let calls = 0;
  const out = await readPixels(async () => { calls += 1; return { lines: [line('Riz parfumé 5 kg', 80), line('4 250 FCFA', 180)] }; }, img, { currency: 'XOF' });
  assert.equal(calls, 1);
  assert.equal(out.status, 'ok');
  assert.equal(out.prices.find((p) => p.id === out.priceId).minor, 4250);
});

test('lecture : passe de secours si le prix manque, et on garde la meilleure', async () => {
  const seen = [];
  const reads = [[line('Riz parfumé 5 kg', 80)], [line('Riz parfumé 5 kg', 80), line('4 250 FCFA', 180)]];
  const out = await readPixels(async (im, o) => { seen.push(o.maxSide); return { lines: reads.shift() }; }, img, { currency: 'XOF' });
  assert.deepEqual(seen, [960, 1536]);
  assert.equal(out.status, 'ok');
});

test('lecture : aucun texte -> échec, jamais de prix inventé', async () => {
  const out = await readPixels(async () => ({ lines: [] }), img, { currency: 'XOF' });
  assert.equal(out.status, 'fail');
  assert.equal(out.priceId, null);
});

test('lecture : au-delà du temps imparti, plus de passe de secours', async () => {
  let t = 0, calls = 0;
  await readPixels(async () => { calls += 1; t += 20000; return { lines: [] }; }, img, { currency: 'XOF', now: () => t });
  assert.equal(calls, 1);
});

test('fusion : un nom lu par une passe complète le prix d\'une autre', () => {
  const a = parseLabel({ lines: [line('Riz parfumé 5 kg', 80)] }, { currency: 'XOF' });
  const b = parseLabel({ lines: [line('4 250 FCFA', 180)] }, { currency: 'XOF' });
  const m = mergePasses([b, a]);
  assert.equal(m.name, 'Riz parfumé 5 kg');
  assert.ok(m.priceId);
});
