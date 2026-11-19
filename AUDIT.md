# ARVO 2.6 — Bilan de sécurité et de qualité (révision administrateur)

## Dépendances
- `npm audit` : 4 alertes « high », **toutes issues d'une seule cause** : `picomatch` (ReDoS, avis GHSA-fc5q-39xc-vjpf), tirée par Vite (`fdir`, `tinyglobby`).
- **Aucun correctif n'existe en amont** : la plage vulnérable est `<=4.0.7`, et 4.0.7 est la dernière version publiée. `npm audit fix --force` rétrograderait Vite en 6.2.7 sans régler le problème ; Vite 8 dépend aussi de `picomatch` (5 alertes). Aucune de ces deux voies n'a été retenue.
- **Impact réel : nul pour les utilisateurs.** `picomatch` n'est utilisé que par l'outil de build (motifs de fichiers fixes, jamais fournis par un tiers). Le dossier `dist/` ne le contient pas (0 fichier). `npm audit --omit=dev` : **0 vulnérabilité**.
- Action de suivi : relancer `npm audit` régulièrement ; dès qu'une version corrigée de `picomatch` sort, `npm update picomatch` suffit. Vite mis à jour de 7.3.7 à 7.3.8.

## Corrigé
| Gravité | Problème | Correction |
|---|---|---|
| Moyenne | Polices Google : l'adresse IP de chaque visiteur était envoyée à Google (RGPD) et l'affichage dépendait d'un tiers | Polices hébergées avec l'appli (`@fontsource`), liens Google supprimés, CSP fermée (`style-src`, `font-src` limités à l'appli) |
| Moyenne | En-têtes manquants | Ajout de HSTS, `Cross-Origin-Opener-Policy`, `X-Permitted-Cross-Domain-Policies`, `upgrade-insecure-requests` ; cache long sur `/assets/*` |
| Faible | Champ de montant masqué en `type="password"` : sollicitait les gestionnaires de mots de passe | Autocomplétion désactivée et attributs d'exclusion (1Password, LastPass, Bitwarden) |
| Faible | Qualité du code (ESLint) : variable inutilisée, bloc `catch` vide, directive inutile, paramètre inutilisé, affectation inutile | Nettoyés, sans changement de comportement |
| Info | Version `2.4.0` obsolète, Node non précisé | `2.6.0`, `engines: node >=20.19.0`, script `npm run audit:prod` |

## Vérifié
- `npm test` : 50/50. Build de production : OK. ESLint (règles recommandées + React + hooks) : plus d'avertissement ; restent 4 remarques volontairement conservées (espaces insécables fines des montants français, 3 occurrences ; une affectation initiale sans effet).
- Test navigateur sous la CSP de production : polices chargées, **aucune requête externe sauf l'API de taux**, aucune violation, scanner fonctionnel.

## Reste à votre charge
- Hébergement hors Netlify : reproduire les en-têtes de `netlify.toml`.
- Tester le scanner sur appareil réel et sur l'URL déployée (non testable ici).
- Les points 2, 4, 5, 7 et 8 de la section « Risques résiduels » ci-dessous sont des décisions de produit, inchangées.

---

# ARVO 2.4 — Bilan d'audit

Sauvegarde de la version d'origine : `arvo-v2_3.zip` (inchangée). Identité visuelle conservée : aucune couleur, aucun rayon, aucune police, aucune icône, aucune ombre modifiés.

## 1. Corrigé (vérifié par test)

| Gravité | Problème | Correction | Fichiers |
|---|---|---|---|
| Haute | Petits écrans : liste et formulaire sous le pli, « Ajouter » à moitié sous la navigation, « Votre panier est vide » hors écran (iPhone SE : formulaire fini à 628 px sur 591 visibles) | Espacements compactés sur mobile uniquement (carte Budget vide sur une ligne, marges réduites, champs à 48 px sur écrans courts). Formulaire fini à 500 px ; titre du panier vide visible | `styles/components.css` |
| Haute | « Taux du jour » affiché même hors ligne ; relevé ancien non signalé avant l'échec d'actualisation ; date sans année | Libellé « Taux indicatifs » ; relevé de plus de 48 h signalé immédiatement (« non actualisé » + avis) ; année ajoutée si autre année ; « dernier taux connu » dans Historique et Scanner | `Converter.jsx`, `fx.js`, `App.jsx`, `History.jsx`, `ScanSheet.jsx` |
| Haute | Deux onglets / appli installée : le dernier à écrire écrasait l'autre (perte de données) | Synchronisation par l'événement `storage` | `App.jsx` |
| Haute | Échec d'enregistrement silencieux (stockage plein/bloqué) | `save()` renvoie un état ; avertissement unique | `storage.js`, `App.jsx` |
| Haute | Aucun en-tête de sécurité | CSP stricte, `nosniff`, `X-Frame-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `sw.js` en `no-cache`. Script de thème en ligne déplacé vers `public/theme-init.js` (prérequis CSP) | `netlify.toml`, `index.html`, `public/theme-init.js` |
| Haute | Appels à l'API de taux non limités (clics répétés, retours au premier plan) | Au plus un appel forcé / 5 min après un succès ; 10 s après un échec | `fx.js` |
| Moyenne | `#/constructor`, `#/__proto__` acceptés comme routes (page vide) | `Object.hasOwn` | `App.jsx` |
| Moyenne | Réponse API non validée (base ≠ USD aurait faussé tous les taux) ; cache de taux non validé (NaN possible) ; date future | Validation stricte (USD = 1, nombres finis > 0), nettoyage du cache | `fx.js` |
| Moyenne | Changement de devise : prix > limite de stockage → **budget remis à 0 au rechargement** ; prix positif arrondi à 0 | `clampMinor` | `storage.js`, `ShoppingList.jsx` |
| Moyenne | Données locales altérées : doublons d'id, noms vides, rayon inconnu (injecté dans une classe CSS), prix hors limites | `sanitizeItems`, rayons validés, ids dédoublonnés | `storage.js`, `history.js` |
| Moyenne | Historique : suppression sans confirmation ; « Dupliquer » exécutable deux fois ; deux listes du même jour indiscernables ; mois sans données affichés « 0 » | Confirmation inline (6 s, annulation conservée) ; garde anti-doublon ; heure affichée ; « — » / « pas de données » avant la première liste | `History.jsx`, `history.js` |
| Moyenne | Contraste des petits textes d'information : 3,2:1 en mode clair (AA = 4,5:1) | Réaffectation au jeton **existant** `--ink-2` (5,3:1) ; mode sombre déjà conforme, inchangé | `styles/components.css` |
| Moyenne | Montant converti hors entiers sûrs affichait de faux chiffres | Message « trop élevé » | `Converter.jsx` |
| Faible | Scanner : image « bombe » (quelques Mo, des gigapixels) pouvait faire planter l'onglet ; fichier vide accepté | Lecture des dimensions dans l'en-tête sans décodage (JPEG/PNG/WebP/GIF/BMP), limite 100 Mpx | `imageGuard.js` (nouveau), `ScanSheet.jsx` |
| Faible | Zones tactiles 36–38 px | Aire de toucher ≥ 44 px par pseudo-éléments invisibles | `styles/components.css` |
| Faible | Service worker : supprimait tous les caches de l'origine ; `cache.put` sur réponses partielles | Préfixe `arvo-`, réponses 200 uniquement, cache `arvo-v2` | `public/sw.js` |

## 2. Déjà conforme (aucune modification)
Aucun secret ni clé API (l'API de taux est publique, sans clé) ; aucun `innerHTML`/`eval` ; montants en entiers (unités mineures) ; liens externes en `noopener noreferrer` ; photos du scanner traitées localement, jamais envoyées ni conservées ; ajout du scanner soumis à validation ; navigation basse sans recouvrement (0 échec sur 32 mesures) ; graphique mensuel interactif avec variation ; lockfile : 130 paquets, tous avec empreinte, aucun hors registre npm, aucune dépendance inutilisée.

## 3. Tests exécutés
- `npm test` : **50/50** (36 existants + 14 nouveaux dans `tests/hardening.test.js`). Base de départ : 36/36.
- Mise en page (Chromium, 8 écrans dont iPhone avec zones de sécurité simulées, portrait/paysage, 4 pages) : **32/32**, aucun débordement horizontal, aucune superposition.
- Parcours de bout en bout (Chromium, API simulée) : **90/90** — Courses, Historique, Convertisseur (succès, 500, hors ligne, réponse invalide, taux de 3 jours, cache altéré, montant démesuré), onglets multiples, stockage refusé, scanner, route piégée, CSP (aucune violation).
- Contrôle des tests : sur la version d'origine, la même suite détecte les écarts (faux zéros, absence de confirmation…).
- Contrôle de types `tsc --checkJs` sur `src/lib` : mêmes messages d'inférence que l'original, aucun nouveau.
- Compilation de production esbuild : OK.

## 4. Non vérifié — à faire de votre côté
- **`npm install`, `npm run build` (Vite), `npm audit` et ESLint n'ont PAS été exécutés** : pas de réseau, pas de `node_modules`, pas de configuration ESLint. La compilation a été faite avec esbuild comme substitut. Lancez `npm ci && npm test && npm run build` avant déploiement.
- **Vulnérabilités connues des dépendances : non vérifiées** (base de données inaccessible hors ligne). Lancez `npm audit`.
- **(Obsolète depuis le remplacement par PP-OCRv6, voir README)** Lecture OCR réelle non testée : le moteur n'est pas installé ici. La CSP autorise `wasm-unsafe-eval` et les workers (vérifié sur des primitives équivalentes), mais **testez le scanner sur l'URL déployée** ; si la CSP le bloquait, la console l'indiquerait.
- `theme-init.js` : comportement de Vite sur un script non-module non vérifié (effet limité à un éventuel flash de thème).
- Clavier virtuel réel et iOS/Android physiques : non testés (logique relue uniquement). Polices Google non chargées pendant les tests (polices de secours, plus larges que Figtree : mesures prudentes).
- Aucun backend ni authentification : rien à auditer de ce côté.

## 5. Risques résiduels et recommandations (non appliqués)
1. **Google Fonts** : chaque visite envoie l'adresse IP à Google (RGPD). Héberger les polices localement (impossible hors ligne ici). Ensuite retirer Google de la CSP.
2. **« Terminer la liste » compte tous les articles**, cochés ou non, dans les dépenses. Décision métier laissée telle quelle ; à confirmer.
3. Champ de montant masqué en `type="password"` : peut déclencher les gestionnaires de mots de passe ; envisager `-webkit-text-security`.
4. Placeholders et articles cochés restent en `--ink-3` (contraste ~3:1) : choix de design à arbitrer.
5. Données en clair dans `localStorage` (normal sans compte) ; ajouter un export de sauvegarde.
6. (Résolu : tesseract.js et son script d'installation ont été retirés.)
7. Annulation (toast) disparaît après 5,5 s : durée à allonger pour l'accessibilité.
8. Le mois en cours est comparé au mois précédent complet (variation trompeuse en début de mois).
