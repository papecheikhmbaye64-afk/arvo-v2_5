import test from 'node:test';
import assert from 'node:assert/strict';
import { createFx, OLD_AFTER } from '../src/lib/fx.js';
import { MAX_PRICE_MINOR, clampMinor, sanitizeItems } from '../src/lib/storage.js';
import { sanitizeHistory, monthlySeries } from '../src/lib/history.js';
import { readImageSize, sizeIsSafe } from '../src/lib/imageGuard.js';
import { convertMinor, toMinor } from '../src/lib/money.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const body = (extra = {}) => ({ result: 'success', time_last_update_unix: 1000, rates: { USD: 1, EUR: 0.9, GMD: 70 }, ...extra });
const okFetch = (b = body()) => { const f = async () => { f.calls++; return { ok: true, json: async () => b }; }; f.calls = 0; return f; };
const badFetch = () => { const f = async () => { f.calls++; return { ok: false, status: 503 }; }; f.calls = 0; return f; };

// ---------- Convertisseur : réseau, validation, ancienneté ----------
test('fx : actualisations forcées rapprochées → un seul appel réseau (anti-rafale)', async () => {
  let t = 1_000_000; const f = okFetch();
  const fx = createFx({ fetchImpl: f, storage: mem(), now: () => t });
  await fx.refresh(true); await fx.refresh(true); await fx.refresh(true);
  assert.equal(f.calls, 1);
  t += 6 * 60 * 1000;                       // plus de 5 minutes : un nouvel appel est permis
  await fx.refresh(true);
  assert.equal(f.calls, 2);
});

test('fx : après un échec, pas de nouvelle tentative avant quelques secondes', async () => {
  let t = 5_000_000; const f = badFetch();
  const fx = createFx({ fetchImpl: f, storage: mem(), now: () => t });
  await fx.refresh(true); await fx.refresh(true);
  assert.equal(f.calls, 1);
  assert.equal(fx.available(), false);
  t += 11_000; await fx.refresh(true);
  assert.equal(f.calls, 2);
});

test('fx : réponse refusée si la devise de base n’est pas le dollar ou si les taux sont absurdes', async () => {
  for (const bad of [body({ rates: { USD: 2, EUR: 1 } }), body({ rates: { EUR: 0.9 } }), body({ rates: { USD: 1 } }), body({ result: 'error' }), body({ rates: { USD: 1, EUR: 'abc', GMD: -3 } })]) {
    const fx = createFx({ fetchImpl: okFetch(bad), storage: mem(), now: () => 1e6 });
    await fx.refresh(true);
    assert.equal(fx.rate('USD', 'EUR'), null, JSON.stringify(bad));
  }
});

test('fx : un cache altéré ne produit jamais NaN', () => {
  const mk = (c) => createFx({ fetchImpl: okFetch(), storage: mem({ 'tempo.fx.v1': JSON.stringify(c) }), now: () => 1e9 });
  assert.equal(mk({ rates: { USD: 1, EUR: 'abc' }, providerAt: 1, fetchedAt: 1 }).rate('USD', 'EUR'), null);
  assert.equal(mk({ rates: { USD: 2, EUR: 1 }, providerAt: 1, fetchedAt: 1 }).rate('USD', 'EUR'), null);
  assert.equal(mk('n’importe quoi').rate('USD', 'EUR'), null);
  const good = mk({ rates: { USD: 1, EUR: 0.9, X: Infinity, Y: 0 }, providerAt: 1e9 - 10, fetchedAt: 1e9 - 10 });
  assert.equal(good.rate('USD', 'EUR'), 0.9);
  assert.equal(good.rate('USD', 'Y'), null);
});

test('fx : une date de relevé dans le futur est écartée (le taux est redemandé)', async () => {
  const f = okFetch();
  const fx = createFx({ fetchImpl: f, storage: mem({ 'tempo.fx.v1': JSON.stringify({ rates: { USD: 1, EUR: 0.9 }, providerAt: 9e15, fetchedAt: 9e15 }) }), now: () => 1e9 });
  await fx.refresh();
  assert.equal(f.calls, 1);
});

test('fx : isOld signale un relevé de plus de 48 h, même sans échec réseau', () => {
  const t = 10 * OLD_AFTER;
  const mk = (age) => createFx({ fetchImpl: okFetch(), storage: mem({ 'tempo.fx.v1': JSON.stringify({ rates: { USD: 1, EUR: 0.9 }, providerAt: t - age, fetchedAt: t - age }) }), now: () => t });
  assert.equal(mk(3600e3).isOld(), false);
  assert.equal(mk(OLD_AFTER + 1000).isOld(), true);
  assert.equal(createFx({ fetchImpl: okFetch(), storage: mem(), now: () => t }).isOld(), false, 'pas de taux : rien à déclarer ancien');
});

// ---------- Données : relecture sécurisée ----------
test('storage : articles altérés corrigés ou ignorés', () => {
  const out = sanitizeItems([
    { id: 'a', name: 'Riz', priceMinor: 100, qty: 2, done: true, cat: 'pantry' },
    { id: 'a', name: 'doublon', priceMinor: 1, qty: 1 },
    { id: 'b', name: '   ', priceMinor: 1, qty: 1 },
    { id: 'c', name: 'x'.repeat(200), priceMinor: 1e15, qty: 5000, cat: 'inconnu"><b>' },
    { id: 'd', name: 'neg', priceMinor: -50, qty: 0 },
    { id: 'e', name: 'float', priceMinor: 1.5, qty: 1 },
    null, 'texte', 42,
  ]);
  assert.deepEqual(out.map((i) => i.id), ['a', 'c', 'd']);
  assert.equal(out[1].name.length, 60);
  assert.equal(out[1].priceMinor, MAX_PRICE_MINOR);
  assert.equal(out[1].qty, 99);
  assert.equal(out[1].cat, 'other');
  assert.equal(out[2].priceMinor, 0);
  assert.equal(out[2].qty, 1);
  assert.deepEqual(sanitizeItems('pas un tableau'), []);
});

test('devise : montants convertis plafonnés, jamais ramenés à 0 s’ils étaient positifs', () => {
  assert.equal(clampMinor(5e12, 1000), MAX_PRICE_MINOR);
  assert.equal(clampMinor(0, 3), 1);
  assert.equal(clampMinor(0, 0), 0);
  assert.equal(clampMinor(-4, 0), 0);
  assert.equal(clampMinor(152, 100000), 152);
  // cas réel : le plafond en euros, converti en FCFA, dépasserait la limite sans plafonnement
  const big = convertMinor(MAX_PRICE_MINOR, 'EUR', 'XOF', 655.957);
  assert.ok(big > MAX_PRICE_MINOR);
  assert.equal(clampMinor(big, MAX_PRICE_MINOR), MAX_PRICE_MINOR);
});

test('historique : rayon inconnu et identifiants en double neutralisés', () => {
  const e = (id, cat = 'pantry') => ({ id, at: 1_700_000_000_000, currency: 'XOF', budget: 0, totalMinor: 10, items: [{ name: 'Riz', priceMinor: 10, qty: 1, cat }] });
  const out = sanitizeHistory([e('a'), e('a'), e('b', 'x"><script>'), { n: 'importe quoi' }]);
  assert.deepEqual(out.map((h) => h.id), ['a', 'b']);
  assert.equal(out[1].items[0].cat, 'other');
});

test('historique : « pas de données » avant la première liste, zéro réel après', () => {
  const now = Date.UTC(2026, 10, 12);
  const entry = { id: 'a', at: Date.UTC(2026, 8, 20), currency: 'XOF', budget: 0, totalMinor: 500, items: [{ name: 'Riz', priceMinor: 500, qty: 1, cat: 'pantry' }] };
  const r = monthlySeries([entry], { currency: 'XOF', rate: () => 1, now, months: 6 });
  assert.equal(r.firstIndex, r.series[3].index, 'septembre est le premier mois avec données');
  assert.ok(r.series[0].index < r.firstIndex && r.series[2].index < r.firstIndex);
  assert.equal(r.series[4].count, 0, 'octobre : mois réel sans liste');
  assert.ok(r.series[4].index >= r.firstIndex);
  assert.equal(monthlySeries([], { currency: 'XOF', rate: () => 1, now }).firstIndex, null);
});

// ---------- Scanner : garde-fou d’images ----------
const png = (w, h) => { const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); return b; };
test('image : dimensions lues dans l’en-tête PNG, sans décodage', () => {
  assert.deepEqual(readImageSize(png(1200, 1600)), { type: 'png', width: 1200, height: 1600 });
  assert.equal(sizeIsSafe(readImageSize(png(4000, 3000))), true);
  assert.equal(sizeIsSafe(readImageSize(png(40000, 40000))), false, 'bombe de décompression');
  assert.equal(sizeIsSafe(readImageSize(png(0, 10))), false);
});

test('image : JPEG (segments EXIF ignorés), GIF, WebP', () => {
  const app1 = [0xff, 0xe1, 0x00, 0x10, ...new Array(14).fill(0)];                         // segment EXIF de 16 octets
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x0b, 0xb8, 0x0f, 0xa0, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0];   // 4000 × 3000
  const jpg = new Uint8Array([0xff, 0xd8, ...app1, ...sof]);
  assert.deepEqual(readImageSize(jpg), { type: 'jpeg', width: 4000, height: 3000 });
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x20, 0x00, 0, 0]);
  assert.deepEqual(readImageSize(gif), { type: 'gif', width: 16, height: 32 });
  const webp = new Uint8Array(30); webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
  webp.set([0x9f, 0x0f, 0x00], 24); webp.set([0xff, 0x0b, 0x00], 27);                      // 4000 × 3072
  assert.deepEqual(readImageSize(webp), { type: 'webp', width: 4000, height: 3072 });
});

test('image : format inconnu ou tronqué → non bloqué sur ce critère, jamais d’exception', () => {
  assert.equal(readImageSize(new Uint8Array(0)), null);
  assert.equal(readImageSize(new Uint8Array([1, 2, 3])), null);
  assert.equal(readImageSize(new Uint8Array(100).fill(7)), null);
  assert.equal(readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0, 0, 0, 0, 0, 0])), null, 'segment de longueur invalide');
  assert.equal(sizeIsSafe(null), true);
});

test('prix : un montant qui dépasse les entiers sûrs est refusé à la saisie', () => {
  assert.equal(toMinor('99999999999999999999', 'USD'), null);
});
