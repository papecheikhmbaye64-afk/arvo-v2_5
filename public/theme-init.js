// Applique le thème choisi avant le premier rendu pour éviter tout flash.
try {
  var t = JSON.parse(localStorage.getItem('tempo.v2') || '{}').theme;
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
} catch { /* stockage indisponible : le thème système s'applique */ }
