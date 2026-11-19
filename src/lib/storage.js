// Données de l'appli : un seul objet JSON dans localStorage, lu et écrit sans jamais planter.
import { sanitizeHistory } from './history.js';
import { CATEGORIES } from './categories.js';

export const STORAGE_KEY = 'tempo.v2';
const KEY = STORAGE_KEY;
const CAT_IDS = new Set(CATEGORIES.map((c) => c.id));

export const DEFAULTS = {
  items: [],
  currency: 'XOF',
  theme: null,
  totalHidden: false,
  hintSeen: false,
  budget: 0, // unités mineures de la devise de la liste ; 0 = pas de budget
  history: [], // listes terminées (voir lib/history.js) ; absent des anciennes données : simplement vide
  conv: { from: 'XOF', to: 'EUR', amount: '10.000' }
};

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    const items = sanitizeItems(d.items);
    return {
      items,
      currency: /^[A-Z]{3}$/.test(d.currency) ? d.currency : DEFAULTS.currency,
      theme: d.theme === 'light' || d.theme === 'dark' ? d.theme : null,
      totalHidden: d.totalHidden === true,
      hintSeen: !!d.hintSeen,
      budget: Number.isSafeInteger(d.budget) && d.budget > 0 && d.budget <= MAX_PRICE_MINOR ? d.budget : 0,
      history: sanitizeHistory(d.history),
      conv: {
        from: /^[A-Z]{3}$/.test(d.conv?.from) ? d.conv.from : DEFAULTS.conv.from,
        to: /^[A-Z]{3}$/.test(d.conv?.to) ? d.conv.to : DEFAULTS.conv.to,
        amount: typeof d.conv?.amount === 'string' ? d.conv.amount.slice(0, 24) : DEFAULTS.conv.amount
      }
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/** Enregistre l'état. Retourne false si le navigateur refuse (stockage plein ou bloqué) : l'appli continue en mémoire, mais l'appelant peut prévenir. */
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export const MAX_PRICE_MINOR = 100_000_000_000; // garde-fou : total toujours sous la limite des entiers sûrs

/** Plafonne un montant converti : jamais au-dessus du garde-fou, et jamais ramené à 0 si la source était positive. */
export const clampMinor = (converted, source) => Math.min(MAX_PRICE_MINOR, source > 0 ? Math.max(1, converted) : Math.max(0, converted));

/** Articles relus du stockage : une entrée altérée est corrigée ou ignorée, jamais une erreur (doublons d'identifiant, noms vides, prix hors limites, rayon inconnu). */
export function sanitizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const i of raw) {
    if (!i || typeof i.id !== 'string' || !i.id || seen.has(i.id) || typeof i.name !== 'string' || !i.name.trim() || !Number.isSafeInteger(i.priceMinor)) continue;
    seen.add(i.id);
    out.push({
      id: i.id.slice(0, 64), name: i.name.slice(0, 60), priceMinor: Math.min(MAX_PRICE_MINOR, Math.max(0, i.priceMinor)),
      qty: Math.min(99, Math.max(1, i.qty | 0 || 1)), done: !!i.done, cat: CAT_IDS.has(i.cat) ? i.cat : 'other'
    });
  }
  return out;
}
export const itemsTotal = (items) => items.reduce((sum, i) => sum + i.priceMinor * i.qty, 0);
