// Écran de lancement : le HTML et le CSS sont dans index.html (visibles dès le premier affichage,
// sans attendre le JavaScript). Ici, on ne fait que le retirer en fondu une fois l'appli prête.
const MIN_MS = 1100;          // durée totale minimale depuis l'ouverture
const MIN_MS_REDUCED = 300;   // mouvement réduit : presque immédiat

export function dismissSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // performance.now() part de l'ouverture de la page : un chargement lent ne rallonge donc pas l'attente.
  const wait = Math.max(0, (reduced ? MIN_MS_REDUCED : MIN_MS) - performance.now());
  requestAnimationFrame(() => setTimeout(() => {
    el.classList.add('is-leaving');
    const done = () => el.remove();
    el.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 1000);
  }, wait));
}
