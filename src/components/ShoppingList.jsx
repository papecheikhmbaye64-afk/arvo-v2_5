import { useCallback, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Banner, Photo } from './Photo.jsx';
import SwipeRow from './SwipeRow.jsx';
import ItemSheet from './ItemSheet.jsx';
import ScanSheet from './ScanSheet.jsx';
import UndoRow from './UndoRow.jsx';
import CurrencyPicker from './CurrencyPicker.jsx';
import BudgetGauge, { BudgetSheet } from './BudgetGauge.jsx';
import { guessCategory } from '../lib/categories.js';
import { makeEntry, normName, suggest } from '../lib/history.js';
import { MAX_PRICE_MINOR, clampMinor, itemsTotal, uid } from '../lib/storage.js';
import { convertMinor, currencySymbol, formatAmountInput, formatNumber, minorToInput, toMinor } from '../lib/money.js';
import { useAmountField } from '../lib/useAmountField.js';

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

function Thumb({ cat }) {
  return (
    <span className={`thumb cat-${cat}`} aria-hidden="true">
      <Icon name={cat} size={20} />
      <Photo name={`cat-${cat}`} />
    </span>
  );
}

const UNDO_ROW_MS = 2000;   // article retiré
const FINISH_ROW_MS = 5000;  // liste enregistrée

export default function ShoppingList({ state, patch, fx, toast, goConvert, draft, setDraft }) {
  const { items, currency } = state;
  // Le brouillon vit dans l'App : changer d'onglet ne fait plus perdre l'article en cours de saisie.
  const { name, price } = draft;
  const setName = (v) => setDraft((d) => ({ ...d, name: v }));
  const setPrice = (v) => setDraft((d) => ({ ...d, price: v }));
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [picking, setPicking] = useState(false);
  const [budgeting, setBudgeting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ghost, setGhost] = useState(null); // notification en cours { id, text, ms, index, undo } : « Annuler » reste proposé dans la liste
  const clearGhost = useCallback(() => setGhost(null), []);
  const nameRef = useRef(null);
  const priceRef = useRef(null);
  const priceField = useAmountField(price, setPrice, currency);

  const total = itemsTotal(items);
  const done = items.filter((i) => i.done);
  const symbol = currencySymbol(currency);

  const setItems = (fn) => patch((s) => ({ items: fn(s.items) }));

  const addItem = (n, minor) => setItems((list) => [{ id: uid(), name: n, priceMinor: minor, qty: 1, done: false, cat: guessCategory(n) }, ...list]);

  const add = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setError('Indiquez un nom.'); nameRef.current?.focus(); return; }
    const minor = price.trim() ? toMinor(price, currency) : 0;
    if (minor == null) { setError('Prix invalide.'); priceRef.current?.focus(); return; }
    if (minor > MAX_PRICE_MINOR) { setError('Prix trop élevé.'); priceRef.current?.focus(); return; }
    addItem(n, minor);
    setDraft({ name: '', price: '' }); setError('');
    nameRef.current?.focus();
  };

  const remove = (item) => {
    const index = items.findIndex((i) => i.id === item.id);
    setItems((list) => list.filter((i) => i.id !== item.id));
    if (!state.hintSeen) patch({ hintSeen: true });
    setGhost({ id: item.id, text: `« ${item.name} » retiré`, ms: UNDO_ROW_MS, index, undo: () => undoRemove(item, index) });
  };

  const undoRemove = (item, index) => setItems((list) => (list.some((i) => i.id === item.id) ? list : [...list.slice(0, index), item, ...list.slice(index)]));

  const noticeRow = () => ghost && (
    <UndoRow key={`undo-${ghost.id}`} text={ghost.text} ms={ghost.ms} onUndo={() => { ghost.undo(); setGhost(null); }} onDone={clearGhost} />
  );
  const withUndo = (rows) => (ghost ? [...rows.slice(0, ghost.index), noticeRow(), ...rows.slice(ghost.index)] : rows);

  const clearDone = () => {
    const order = items.map((i) => i.id);
    const removed = items.filter((i) => i.done);
    setItems((list) => list.filter((i) => !i.done));
    // « Annuler » ne remet que les articles retirés, à leur place : ce qui a été ajouté ou modifié entre-temps reste.
    toast({
      text: plural(removed.length, 'article retiré', 'articles retirés'),
      undo: () => setItems((list) => {
        const have = new Set(list.map((i) => i.id));
        const back = removed.filter((i) => !have.has(i.id));
        const rank = (i) => { const k = order.indexOf(i.id); return k === -1 ? -1 : k; };
        return [...list, ...back].sort((a, b) => rank(a) - rank(b));
      })
    });
  };

  // Fige la liste dans l'historique et repart d'une liste vide ; « Annuler » rend les articles sans toucher au reste.
  const finish = () => {
    const entry = makeEntry(state, uid(), Date.now());
    if (!entry) return;
    const kept = items;
    patch((s) => ({ items: [], history: [entry, ...s.history] }));
    // Même notification que le retrait d'un article (carte dans la liste), affichée 5 s.
    setGhost({ id: entry.id, text: 'Liste enregistrée', ms: FINISH_ROW_MS, index: 0, undo: () => patch((s) => ({ items: [...s.items, ...kept], history: s.history.filter((h) => h.id !== entry.id) })) });
  };

  // Produits déjà achetés correspondant à la saisie ; ils remplissent les champs, l'utilisateur valide.
  const suggestions = suggest(state.history, name, { exclude: items.map((i) => i.name), currency, rate: (a, b) => fx.rate(a, b) })
    .filter((s) => !(normName(s.name) === normName(name) && price.trim()));
  const pick = (s) => {
    setDraft({ name: s.name, price: s.priceMinor ? formatAmountInput(minorToInput(s.priceMinor, currency), currency, { paste: true }).text : '' });
    setError('');
    priceRef.current?.focus();
  };

  const changeCurrency = (code) => {
    setPicking(false);
    if (code === currency) return;
    if (!items.length && !state.budget) { patch({ currency: code }); return; }
    const r = fx.rate(currency, code);
    if (r == null) { toast({ text: 'Taux indisponibles. Conversion impossible.' }); return; }
    const before = { items, currency, budget: state.budget };
    // clampMinor : jamais au-dessus de la limite de stockage (sinon le budget serait remis à zéro au rechargement), jamais ramené à 0 si positif.
    patch({ currency: code, budget: clampMinor(convertMinor(state.budget, currency, code, r), state.budget), items: items.map((i) => ({ ...i, priceMinor: clampMinor(convertMinor(i.priceMinor, currency, code, r), i.priceMinor) })) });
    toast({ text: `Prix convertis en ${code}`, undo: () => patch(before) });
  };

  return (
    <>
      <div className="total-stack">
      <section className="card total-card" aria-labelledby="total-label">
        <Banner name="hero-market" />
        <div className="total-body">
          <div className="total-top">
            <span className="eyebrow" id="total-label">Total de la liste</span>
            <div className="total-actions">
              <button type="button" className="privacy-btn" onClick={() => patch({ totalHidden: !state.totalHidden })}
                aria-label={state.totalHidden ? 'Afficher le total' : 'Masquer le total'} aria-pressed={state.totalHidden}
                title={state.totalHidden ? 'Afficher le total' : 'Masquer le total'}>
                <Icon name={state.totalHidden ? 'eyeOff' : 'eye'} size={19} />
              </button>
              <button type="button" className="pill" onClick={() => setPicking(true)} aria-label={`Devise de la liste : ${currency}. Changer`}>
                {currency}<Icon name="chevron" size={16} />
              </button>
            </div>
          </div>
          <p className="total-amount" aria-live="polite" aria-atomic="true">
            <span className={`bump ${state.totalHidden ? 'is-hidden' : ''}`} key={state.totalHidden ? 'hidden' : total}>
              {state.totalHidden ? '••••••' : formatNumber(total, currency)}
            </span>
            <span className="unit">{symbol}</span>
          </p>
          <div className="total-foot">
            <p>
              {items.length ? `${plural(items.length, 'article', 'articles')}${done.length ? ` · ${done.length} dans le panier` : ''}` : 'Aucun article'}
            </p>
            {total > 0 && (
              <button type="button" className="link-btn" onClick={() => goConvert(total)}>
                Convertir<Icon name="arrow" size={16} />
              </button>
            )}
          </div>
        </div>
      </section>

      <BudgetGauge total={total} budget={state.budget} currency={currency} hidden={state.totalHidden} onEdit={() => setBudgeting(true)} />
      </div>

      <form className="card composer" onSubmit={add} noValidate>
        <label className="sr-only" htmlFor="new-name">Nom de l’article</label>
        <input
          id="new-name" ref={nameRef} className="composer-name" placeholder="Nouvel article" value={name} maxLength={60}
          autoComplete="off" enterKeyHint="next"
          onChange={(e) => { setName(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { e.preventDefault(); priceRef.current?.focus(); } }}
        />
        <label className="sr-only" htmlFor="new-price">Prix en {currency}</label>
        <button type="button" className={`scan-btn ${scanning ? 'is-on' : ''}`} onClick={() => setScanning(true)} aria-label="Scanner une étiquette" aria-haspopup="dialog" title="Scanner une étiquette">
          <Icon name="camera" size={23} stroke={1.7} />
        </button>
        <div className="input-suffix composer-price">
          <input id="new-price" {...priceField} ref={(n) => { priceRef.current = n; priceField.ref.current = n; }} placeholder="Prix" enterKeyHint="done"
            onChange={(e) => { priceField.onChange(e); setError(''); }} />
          <em>{symbol}</em>
        </div>
        <button type="submit" className="add-btn" aria-label="Ajouter à la liste"><Icon name="plus" size={22} stroke={2.4} /><span className="add-label">Ajouter</span></button>
        {suggestions.length > 0 && (
          <ul className="composer-suggest" aria-label="Produits déjà achetés">
            {suggestions.map((sg) => (
              <li key={sg.name}>
                <button type="button" className="suggest" onClick={() => pick(sg)}>
                  <span>{sg.name}</span>
                  {sg.priceMinor > 0 && <small>{formatNumber(sg.priceMinor, currency)} {symbol}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="form-error composer-error" role="alert">{error}</p>}
      </form>

      {items.length === 0 ? (
        <>
        {ghost && <ul className="items" aria-label="Notification">{noticeRow()}</ul>}
        <section className="empty" aria-label="Liste vide">
          <div className="empty-art"><Icon name="basket" size={46} stroke={1.5} /><Photo name="empty-basket" /></div>
          <h2>Panier vide</h2>
          <p>Ajoutez un article pour commencer.</p>
        </section>
        </>
      ) : (
        <>
          {!state.hintSeen && (
            <p className="hint">
              <span>Glissez vers la gauche pour retirer.</span>
              <button type="button" className="icon-btn sm" onClick={() => patch({ hintSeen: true })} aria-label="Masquer l’astuce"><Icon name="close" size={16} /></button>
            </p>
          )}
          <ul className="items" aria-label="Articles de la liste">
            {withUndo(items.map((item) => {
              const line = item.priceMinor * item.qty;
              return (
                <SwipeRow key={item.id} name={item.name} onDelete={() => remove(item)}>
                  <div className={`item ${item.done ? 'is-done' : ''}`}>
                    <button type="button" role="checkbox" aria-checked={item.done} className="check" onClick={() => setItems((l) => l.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))} aria-label={`${item.name} : ${item.done ? 'remettre à acheter' : 'mettre dans le panier'}`}>
                      <Icon name="check" size={16} stroke={3} />
                    </button>
                    <button type="button" className="item-main" onClick={() => setEditing(item)} aria-label={`Modifier ${item.name}`}>
                      <Thumb cat={item.cat} />
                      <span className="item-text">
                        <strong>{item.name}</strong>
                        {item.qty > 1 && <small>× {item.qty}</small>}
                      </span>
                      <span className="item-price">
                        {item.priceMinor ? <><strong>{state.totalHidden ? '••••••' : formatNumber(line, currency)}<i>{symbol}</i></strong>{item.qty > 1 && <small>{state.totalHidden ? '••••' : `${formatNumber(item.priceMinor, currency)} × ${item.qty}`}</small>}</> : <small className="no-price">Prix à saisir</small>}
                      </span>
                    </button>
                  </div>
                </SwipeRow>
              );
            }))}
          </ul>
          <button type="button" className="btn btn-soft finish-list" onClick={finish}>Terminer la liste</button>
          {done.length > 0 && (
            <button type="button" className="btn btn-quiet clear-done" onClick={clearDone}>
              Retirer {plural(done.length, 'article coché', 'articles cochés')}
            </button>
          )}
        </>
      )}

      {editing && (
        <ItemSheet
          item={editing} currency={currency} onClose={() => setEditing(null)}
          onSave={(next) => {
            // Renommer un article met aussi à jour son rayon, comme à la création.
            setItems((l) => l.map((i) => (i.id === editing.id ? { ...i, ...next, cat: next.name !== i.name ? guessCategory(next.name) : i.cat } : i)));
            setEditing(null);
          }}
          onDelete={() => { const it = editing; setEditing(null); remove(it); }}
        />
      )}
      {scanning && (
        <ScanSheet currency={currency} fx={fx} total={total} onAdd={addItem} onClose={() => setScanning(false)}
          onManual={() => { setScanning(false); setTimeout(() => nameRef.current?.focus(), 50); }} />
      )}
      {budgeting && <BudgetSheet budget={state.budget} currency={currency} onClose={() => setBudgeting(false)} onSave={(budget) => { patch({ budget }); setBudgeting(false); }} />}
      {picking && <CurrencyPicker title="Devise de la liste" current={currency} codes={fx.currencies()} onPick={changeCurrency} onClose={() => setPicking(false)} />}
    </>
  );
}
