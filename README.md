# ARVO

**ARVO** est une application mobile (PWA) en français qui réunit trois outils du quotidien : une **liste de courses** dont le total se calcule seul, un **historique** des dépenses, et un **convertisseur de devises** instantané. Elle fonctionne hors ligne, s'installe sur l'écran d'accueil et ne demande **aucun compte** : toutes les données restent dans l'appareil.

Pensée pour un usage réel en Afrique de l'Ouest comme en Europe, ARVO gère nativement le franc CFA (XOF/XAF), avec la parité fixe 1 € = 655,957 FCFA appliquée localement, sans connexion.

## Points forts

- **Un total toujours à jour** : nom, prix et quantité de chaque article, total en direct, budget avec jauge.
- **Scan d'étiquette, 100 % sur l'appareil** : la photo est lue localement (PP-OCRv6 de PaddleOCR, WebAssembly), jamais envoyée ni conservée. Rien n'est ajouté sans validation.
- **Historique des dépenses** : listes terminées, dépenses des six derniers mois, duplication d'une ancienne liste.
- **Convertisseur** : environ 160 devises, résultat immédiat, inversion en un geste, taux en cache hors ligne et jamais inventés.
- **Respect de la vie privée** : pas de compte, pas de pistage, pas de script tiers, polices hébergées avec l'appli.
- **Design soigné** : identité « satin » (argent clair, noir bleuté sombre), mode clair/sombre, écran de lancement, animations discrètes, accessibilité (contrastes, zones tactiles, mouvement réduit).

## Fonctionnalités en détail

**Courses**
- Nom + prix (optionnel) + quantité ; rayon reconnu automatiquement (Fruits et légumes, Boulangerie, etc.).
- Case « dans le panier », modification en touchant la ligne, suggestions issues des achats précédents (avec le dernier prix).
- Suppression par balayage vers la gauche, touche Suppr ou bouton dans la fiche ; toute suppression est annulable pendant 3 secondes.
- Devise de la liste modifiable : les prix sont convertis, avec « Annuler ».

**Scan d'étiquette** (facultatif)
- L'icône d'appareil photo, à côté du champ « Nouvel article », ouvre l'appareil photo ou la galerie.
- Lecture du nom et du prix. Codes-barres, références, poids, pourcentages et prix au kilo ou au litre ne sont jamais pris pour le prix. En cas de doute, l'utilisateur choisit ; si la lecture est incertaine, le champ reste vide.

**Lecteur d'étiquettes (PP-OCRv6)**
- Tout se passe dans un Web Worker, sur l'appareil : détection du texte, reconnaissance, regroupement des lignes, puis `labelParser` (nom, prix, ancien prix, quantité, devise). Aucun serveur.
- Premier scan : téléchargement unique d'environ 46 Mo (modèles 31 Mo + moteur WebAssembly 15 Mo), ensuite mis en cache par le service worker. Le moteur reste chargé 45 s après la fermeture de la feuille de scan.
- Modèles : `public/models/ppocrv6/` (Apache-2.0, réexports ONNX de PaddleOCR PP-OCRv6 Small via RapidOCR 3.10.0 ; SHA-256 vérifiés au lancement par `scripts/verify-ocr-assets.mjs`). Le dictionnaire (`dict.txt`) provient des métadonnées du modèle.
- Évaluation : `python3 scripts/make_test_labels.py /tmp/labels`, puis `node scripts/eval-ocr.mjs /tmp/labels` et `node scripts/score-ocr.mjs /tmp/eval-paddle.json`. Test du worker compilé : `npm run build && node scripts/smoke-worker.mjs <image.jpg>`.

**Historique**
- « Terminer la liste » l'archive (annulable) et repart d'une liste vide.
- Tableau de bord mensuel avec variation par rapport au mois précédent ; listes en autre devise converties au taux du jour.

**Convertisseur**
- Taux ExchangeRate-API (sans clé), cache de 6 h, dernier relevé conservé hors ligne.
- EUR ↔ XOF/XAF fonctionne sans réseau grâce à la parité fixe.

## Technologies

React 19, Vite 7, onnxruntime-web 1.31 + PaddleOCR PP-OCRv6 Small (lecture d'étiquettes, hors ligne après le premier chargement), CSS sans framework, service worker maison. Aucune dépendance d'exécution superflue.

## Installation et commandes

Prérequis : **Node.js 20.19 ou plus récent**.

```bash
npm install
npm run dev          # http://localhost:5173 (l'adresse réseau est affichée pour tester sur téléphone)
npm run build        # produit dist/
npm run preview      # sert dist/ pour un dernier contrôle
npm test             # 50 tests : argent, parité CFA, taux, rayons, scanner, durcissement
npm run audit:prod   # vulnérabilités des dépendances réellement livrées
```

## Structure du projet

| Chemin | Rôle |
|---|---|
| `index.html` | page unique ; contient l'écran de lancement (HTML/CSS en ligne) |
| `src/App.jsx` | état global, navigation (`#/courses`, `#/historique`, `#/devises`), thème, notifications |
| `src/components/ShoppingList.jsx`, `SwipeRow.jsx`, `ItemSheet.jsx`, `BudgetGauge.jsx` | liste, geste de balayage, édition, budget |
| `src/components/ScanSheet.jsx` | feuille de scan : prêt, analyse, résultat, lecture partielle, échec, ajouté |
| `src/components/Converter.jsx`, `CurrencyPicker.jsx` | convertisseur et sélecteur de devise |
| `src/components/History.jsx` | tableau de bord mensuel, listes terminées, duplication |
| `src/lib/ocr.js`, `labelParser.js`, `imageGuard.js` | lecture locale des étiquettes, analyse du texte, garde-fou sur les images |
| `src/lib/money.js`, `fx.js`, `history.js`, `categories.js`, `storage.js`, `budget.js` | argent en entiers, taux, historique, rayons, persistance, budget |
| `src/lib/splash.js` | retrait en fondu de l'écran de lancement |
| `src/styles/` | `tokens.css` (jetons), `base.css`, `components.css`, `satin.css` (identité chromatique) |
| `public/` | icônes, manifeste, service worker, moteur et modèle OCR |
| `scripts/copy-ocr-assets.mjs` | copie le moteur et le modèle français dans `public/ocr/` (lancé par `dev` et `build`) |
| `tests/` | tests automatiques (Node) |
| `AUDIT.md` | bilans d'audit : corrections, risques résiduels |

## Sécurité et confidentialité

- **Aucune donnée ne quitte l'appareil**, hormis la requête publique de taux de change (sans identifiant). Stockage local uniquement (`localStorage`).
- **Politique de sécurité du contenu stricte** (`netlify.toml`) : scripts et polices de l'appli uniquement, aucun cadre, aucun formulaire externe, seule l'API de taux autorisée. En-têtes : HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- **Aucun `innerHTML` ni `eval`**, données locales validées au chargement, images du scanner limitées en taille avant décodage.
- **Dépendances** : `npm audit --omit=dev` ne signale aucune vulnérabilité sur ce qui est livré aux utilisateurs. Voir `AUDIT.md` pour l'alerte `picomatch`, qui ne concerne que l'outil de build.
- **Scan** : la photo est décodée, réduite, lue puis libérée ; ni envoyée, ni stockée. Le moteur (environ 4 Mo) est chargé au premier scan, puis gardé en cache par le service worker.

## Déploiement

Site statique : `npm run build`, puis publier `dist/` (Netlify : `netlify.toml` fournit commande, dossier et en-têtes ; Vercel ou GitHub Pages fonctionnent aussi, mais les en-têtes de sécurité doivent alors être reproduits). HTTPS obligatoire pour le service worker et l'installation.

Après déploiement, **testez le scanner sur l'URL publique** et vérifiez que la console du navigateur ne signale aucune violation de la politique de sécurité.

## Données et sources

Taux indicatifs fournis par [ExchangeRate-API](https://www.exchangerate-api.com), hors frais bancaires.

Polices Figtree et Bricolage Grotesque (licence SIL OFL), distribuées via le paquet Fontsource.
