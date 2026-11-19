// Taux de change réels (open.er-api.com / ExchangeRate-API, sans clé, CORS ouvert).
// Cache local, dernier taux valide en cas d'échec, jamais de valeur inventée.
export const FX_URL = 'https://open.er-api.com/v6/latest/USD';
export const FX_SOURCE = 'ExchangeRate-API (open.er-api.com)';
const KEY = 'tempo.fx.v1';
const TTL = 6 * 3600 * 1000;
// Au-delà de 48 h, un relevé est présenté comme ancien (le fournisseur publie un relevé par jour).
export const OLD_AFTER = 48 * 3600 * 1000;
// Anti-rafale : une actualisation forcée juste après un relevé réussi ne refait pas d'appel (le fournisseur
// limite les requêtes répétées) ; après un échec, on attend quelques secondes avant de réessayer.
const MIN_GAP = 5 * 60 * 1000;
const FAIL_GAP = 10 * 1000;
const CFA = new Set(['XOF', 'XAF']);
export const PEG = 655.957;
export const isPegged = (a, b) => (CFA.has(a) && (CFA.has(b) || b === 'EUR')) || (a === 'EUR' && CFA.has(b));

export function createFx({ fetchImpl, storage, now = () => Date.now(), ttl = TTL, timeout = 8000, minGap = MIN_GAP, failGap = FAIL_GAP } = {}) {
  const doFetch = fetchImpl || ((...a) => globalThis.fetch(...a));
  const store = storage ?? (() => { try { return globalThis.localStorage; } catch { return null; } })();
  const listeners = new Set();
  const state = { rates: null, providerAt: null, fetchedAt: null, stale: false, loading: false, error: null };
  let inflight = null;

  /** Taux relus ou reçus : uniquement des nombres finis > 0 (un cache altéré ne doit jamais produire « NaN »). */
  const cleanRates = (src) => {
    const out = {};
    if (src && typeof src === 'object') for (const [k, v] of Object.entries(src)) if (/^[A-Z]{3}$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
    return out;
  };
  let lastOk = 0, lastFail = 0;
  try {
    const raw = store?.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw);
      const rates = cleanRates(c?.rates);
      if (rates.USD === 1 && Object.keys(rates).length > 1) {
        const t = now();
        const okTime = (v) => (Number.isFinite(v) && v > 0 && v <= t + 60000 ? v : null);   // une date future est écartée
        const fetchedAt = okTime(c.fetchedAt);
        Object.assign(state, { rates, providerAt: okTime(c.providerAt), fetchedAt: fetchedAt ?? 0 });
        lastOk = fetchedAt ?? 0;
      }
    }
  } catch { /* cache illisible : ignoré */ }

  const emit = () => listeners.forEach((l) => l(state));

  async function refresh(force = false) {
    if (inflight) return inflight;
    const t0 = now();
    if (!force && state.rates && t0 - state.fetchedAt < ttl) { state.stale = false; return state; }
    if (force && state.rates && lastOk && t0 - lastOk < minGap) return state;   // relevé tout récent : rien de plus frais à demander
    if (lastFail && t0 - lastFail < failGap) return state;                      // échec très récent : pas de rafale
    state.loading = true; state.error = null; emit();
    inflight = (async () => {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
      try {
        const res = await doFetch(FX_URL, ctl ? { signal: ctl.signal } : undefined);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        // Le taux de base doit être le dollar (USD = 1) : sinon tous les taux croisés seraient faux sans que rien ne le signale.
        const rates = cleanRates(j?.rates);
        if (j?.result !== 'success' || rates.USD !== 1 || Object.keys(rates).length < 2) throw new Error('Réponse invalide');
        const unix = Number(j.time_last_update_unix) * 1000;
        const providerAt = Number.isFinite(unix) && unix > 0 && unix <= now() + 60000 ? unix : now();
        Object.assign(state, { rates, providerAt, fetchedAt: now(), stale: false, error: null });
        lastOk = state.fetchedAt; lastFail = 0;
        try { store?.setItem(KEY, JSON.stringify({ rates, providerAt: state.providerAt, fetchedAt: state.fetchedAt })); } catch { /* quota */ }
      } catch (e) {
        state.error = e?.name === 'AbortError' ? 'Délai dépassé' : (e?.message || 'Réseau indisponible');
        state.stale = !!state.rates;
        lastFail = now();
      } finally {
        if (timer) clearTimeout(timer);
        state.loading = false; inflight = null; emit();
      }
      return state;
    })();
    return inflight;
  }

  /** Unités de `to` pour 1 `from`, ou null si indisponible. */
  function rate(from, to) {
    if (from === to) return 1;
    // Parité fixe officielle : 1 EUR = 655,957 FCFA (XOF et XAF), valable même hors ligne.
    if (CFA.has(from) && CFA.has(to)) return 1;
    if (CFA.has(from) && to === 'EUR') return 1 / PEG;
    if (from === 'EUR' && CFA.has(to)) return PEG;
    const r = state.rates;
    if (!r || !r[from] || !r[to]) return null;
    return r[to] / r[from];
  }

  /** Vrai si le dernier relevé du fournisseur a plus de 48 h (ou si sa date est inconnue). */
  const isOld = () => !!state.rates && (!state.providerAt || now() - state.providerAt > OLD_AFTER);

  return {
    state, refresh, rate, isOld,
    available: () => !!state.rates,
    currencies: () => (state.rates ? Object.keys(state.rates) : []),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
