import { useEffect, useState } from 'react';

/**
 * Notification unique de l'appli : une carte insérée dans la liste, avec « Annuler ».
 * Elle apparaît en glissant, reste `ms` millisecondes, puis se replie en douceur.
 */
export default function UndoRow({ text, ms = 2000, onUndo, onDone }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setOut(true), ms);
    const t2 = setTimeout(onDone, ms + 240);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [ms, onDone]);
  return (
    <li className={`swipe-wrap undo-row ${out ? 'is-collapsing' : ''}`} role="status">
      <div className="swipe-clip">
        <div className="undo-box">
          <span>{text}</span>
          <button type="button" onClick={onUndo}>Annuler</button>
        </div>
      </div>
    </li>
  );
}
