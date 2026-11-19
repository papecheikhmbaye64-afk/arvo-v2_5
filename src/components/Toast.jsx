import { useEffect, useRef } from 'react';

// « Annuler » reste disponible 3 s (avant 5,5 s) ; un message simple, 2,5 s.
const UNDO_MS = 3000, PLAIN_MS = 2500;

export default function Toast({ toast, onDismiss }) {
  const box = useRef(null);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onDismiss, toast.undo ? UNDO_MS : PLAIN_MS);
    // Dès que l'on touche autre chose (autre article, champ, onglet), le message s'efface : pas besoin d'attendre.
    const away = (e) => { if (!box.current?.contains(e.target)) onDismiss(); };
    document.addEventListener('pointerdown', away, true);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', away, true); };
  }, [toast, onDismiss]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id} ref={box}>
      <span>{toast.text}</span>
      {toast.undo && <button type="button" onClick={() => { toast.undo(); onDismiss(); }}>Annuler</button>}
    </div>
  );
}
