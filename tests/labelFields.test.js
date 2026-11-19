import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLabel } from '../src/lib/labelParser.js';

const L = (text, height = 60, conf = 99) => ({ text, conf, height, words: text.split(' ').map((t) => ({ text: t, conf, height })) });
const parse = (...ls) => parseLabel({ lines: ls }, { currency: 'XOF' });

test('quantité, unité et devise sont extraites', () => {
  const r = parse(L('Huile végétale 1 L', 70), L('2 500 FCFA', 180));
  assert.deepEqual(r.quantity, { text: '1 L', value: 1, unit: 'L' });
  assert.equal(r.currency, 'XOF');
  assert.equal(r.prices.find((p) => p.id === r.priceId).minor, 2500);
});

test('quantités : g, kg, cl, ml ; pas le prix au kilo', () => {
  assert.equal(parse(L('Café moulu 250 g', 70), L('3 200 F', 180)).quantity.text, '250 g');
  assert.equal(parse(L('Riz parfumé 5 kg', 70), L('4 250 F', 180)).quantity.unit, 'kg');
  assert.equal(parse(L('Jus de pomme 33 cl', 70), L('600 F', 180)).quantity.unit, 'cl');
  assert.equal(parse(L('Tomates fraîches', 70), L('800 F/kg', 180)).quantity, null);
});

test('formats de prix FCFA courants', () => {
  for (const [txt, minor] of [['2 500 FCFA', 2500], ['2500 F', 2500], ['2.500', 2500], ['1 250 FCFA', 1250], ['12 500 F CFA', 12500]]) {
    const r = parse(L('Savon de Marseille', 70), L(txt, 180));
    assert.equal(r.prices.find((p) => p.id === r.priceId)?.minor, minor, txt);
  }
});

test('étiquette promo : prix promo présélectionné, ancien prix exposé, pourcentage et poids ignorés', () => {
  const r = parse(L('PROMO', 70), L('Sucre en poudre 1 kg', 70), L('1 990 F', 220), L('au lieu de 2 500 F', 40), L('-20%', 60));
  assert.equal(r.prices.find((p) => p.id === r.priceId).minor, 1990);
  assert.equal(r.prices.find((p) => p.id === r.priceId).promo, true);
  assert.deepEqual({ minor: r.oldPrice.minor }, { minor: 2500 });
  assert.equal(r.quantity.text, '1 kg');
  assert.ok(!r.prices.some((p) => p.minor === 20 || p.minor === 1));
});

test('références, codes-barres et poids ne sont jamais pris pour le prix', () => {
  const r = parse(L('Savon de Marseille 300 g', 70), L('2 450 F', 180), L('6 111 245 330 123', 40), L('Réf. 458921', 40));
  assert.equal(r.prices.find((p) => p.id === r.priceId).minor, 2450);
  assert.ok(!r.prices.some((p) => p.minor === 300 || p.minor === 458921));
});

test('prix douteux (confiance faible) : jamais présélectionné', () => {
  const r = parse(L('Riz parfumé 5 kg', 70), L('4 250 FCFA', 180, 40));
  assert.equal(r.priceId, null);
  assert.notEqual(r.status, 'ok');
});

test('deux prix de taille proche : l\'utilisateur choisit', () => {
  const r = parse(L('Yaourt nature', 70), L('850 F', 120), L('Lot de 6 : 4 900 F', 110));
  assert.equal(r.priceId, null);
  assert.ok(r.prices.length >= 2);
});
