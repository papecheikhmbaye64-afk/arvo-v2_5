// Note les résultats de eval-ocr.mjs (ou du banc Tesseract) : node scripts/score-ocr.mjs a.json [b.json ...]
import { readFileSync } from 'node:fs';

const norm = (s) => String(s || '').toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();
function lev(a, b) {
  const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) { const cur = [i]; for (let j = 1; j <= n; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const charAcc = (got, want) => (want ? Math.max(0, 1 - lev(norm(got), norm(want)) / norm(want).length) : 1);
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%`.padStart(4) : '  - ');

function score(rows) {
  const priced = rows.filter((r) => r.expect !== 'fail');
  const m = { n: rows.length, ms: rows.reduce((s, r) => s + r.ms, 0) / rows.length };
  m.priceFound = priced.filter((r) => r.parsed.prices.some((p) => p.minor === r.minor)).length;
  // Prix correctement géré : présélectionné et juste, ou bien proposé au choix (jamais présélectionné à tort).
  m.priceSelectedOk = priced.filter((r) => r.parsed.priceId && r.parsed.prices.find((p) => p.id === r.parsed.priceId)?.minor === r.minor).length;
  m.priceWrong = rows.filter((r) => r.parsed.priceId && r.parsed.prices.find((p) => p.id === r.parsed.priceId)?.minor !== r.minor).length;
  m.priceSafe = priced.filter((r) => { const sel = r.parsed.priceId && r.parsed.prices.find((p) => p.id === r.parsed.priceId); return r.parsed.prices.some((p) => p.minor === r.minor) && (!sel || sel.minor === r.minor); }).length;
  m.nameExact = priced.filter((r) => norm(r.parsed.name) === norm(r.name)).length;
  m.nameFilled = priced.filter((r) => r.parsed.name).length;
  const withName = priced.filter((r) => r.parsed.name || r.parsed.nameAlternatives?.length);
  m.nameChar = withName.length ? withName.reduce((s, r) => s + Math.max(charAcc(r.parsed.name, r.name), ...(r.parsed.nameAlternatives || []).map((a) => charAcc(a, r.name))), 0) / withName.length : 0;
  m.autoOk = priced.filter((r) => r.expect === 'auto' && r.parsed.status === 'ok' && norm(r.parsed.name) === norm(r.name) && r.parsed.prices.find((p) => p.id === r.parsed.priceId)?.minor === r.minor).length;
  m.autoN = priced.filter((r) => r.expect === 'auto').length;
  m.blankOk = rows.filter((r) => r.expect === 'fail' && !r.parsed.priceId && !r.parsed.name).length;
  m.blankN = rows.filter((r) => r.expect === 'fail').length;
  m.pricedN = priced.length;
  return m;
}
const line = (label, rows) => {
  if (!rows.length) return;
  const m = score(rows), d = m.pricedN;
  console.log(`${label.padEnd(14)} n=${String(m.n).padStart(3)} | prix lu ${pct(m.priceFound, d)} | présélect. juste ${pct(m.priceSelectedOk, d)} | FAUX prix présélect. ${String(m.priceWrong).padStart(2)} | prix sûr ${pct(m.priceSafe, d)} | nom exact ${pct(m.nameExact, d)} | car. nom ${Math.round(m.nameChar * 100)}% | nom+prix auto ${pct(m.autoOk, m.autoN)} | ${Math.round(m.ms)} ms`);
};

for (const file of process.argv.slice(2)) {
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`\n=== ${file}`);
  for (const v of [...new Set(rows.map((r) => r.variant))]) line(v, rows.filter((r) => r.variant === v));
  line('TOTAL', rows);
  const m = score(rows); if (m.blankN) console.log(`étiquette vide : ${m.blankOk}/${m.blankN} correctement refusée`);
}
