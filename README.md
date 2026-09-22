# Canal 7 — Tournage

Application de travail du **chef électro** sur un tournage de fiction : listes lumière,
décors et sous-décors, ponctuels, plan de travail, équipe, camions, plan de feux, exports PDF.

C'est une **PWA d'un seul fichier** (`index.html`). Elle s'installe sur l'écran d'accueil de
l'iPhone ou de l'iPad et **fonctionne hors réseau** : tout est enregistré dans le téléphone,
rien ne part sur un serveur.

## Mettre en ligne

Aucune compilation, aucune dépendance à installer. On sert le dossier tel quel, en **HTTPS**
(obligatoire pour qu'une PWA s'installe et que le service worker fonctionne) :

- **GitHub Pages** : pousser ce dossier sur une branche, puis Settings → Pages → branche `main`,
  dossier `/`. L'app est à `https://<compte>.github.io/<dépôt>/`.
- **N'importe quel hébergeur statique** (Netlify, OVH, un NAS…) : déposer les fichiers.
- **En local, pour essayer** : `python3 -m http.server 8000` puis `http://localhost:8000/`.
  En local `http://` suffit ; en ligne il faut du `https://`.

Sur iPhone : ouvrir l'adresse dans Safari → Partager → **Sur l'écran d'accueil**.

## Ce qu'il y a dans le dossier

| Fichier | À quoi il sert |
|---|---|
| `index.html` | **toute l'application** — un seul fichier |
| `sw.js` | le service worker : c'est lui qui fait marcher l'app hors réseau |
| `manifest.json` | nom, icônes, mode plein écran, réception des contacts partagés |
| `icon192.png`, `icon512.png` | les icônes de l'écran d'accueil |
| `lib/` | les 8 bibliothèques, **en local** (voir plus bas) |
| `exemple/PANORAMA-LEGER.json` | un film de démonstration complet |

## Pourquoi les bibliothèques sont dans `lib/`

Elles étaient chargées depuis un CDN. Sur un plateau, le téléphone voit souvent le serveur
local mais **pas internet** : un seul échec de téléchargement empêchait l'app de s'ouvrir.
Elles sont donc toutes locales, et le service worker les met en cache **une par une**, en
encaissant les échecs — une bibliothèque manquante ne doit jamais empêcher l'app de démarrer.

| Bibliothèque | Ce qu'elle fait dans l'app |
|---|---|
| `jspdf.umd.min.js` + `jspdf.plugin.autotable.min.js` | tous les exports PDF |
| `leaflet.min.js` + `leaflet.min.css` | la carte : position du camion, distance au décor |
| `pdf.min.js` + `pdf.worker.min.js` | lecture des plans de travail en PDF |
| `xlsx.full.min.js` | lecture des plans de travail en Excel |
| `mammoth.browser.min.js` | lecture des plans de travail en Word |

## Ce qui a besoin du réseau (et ce qui n'en a pas besoin)

Tout marche hors réseau, **sauf** trois choses, par nature :

- le **fond de carte** (tuiles OpenStreetMap) et la **recherche d'adresse** ;
- la **météo** d'un décor ;
- la **télécommande** du projecteur entre deux téléphones (elle passe par un broker MQTT public).

La police du logo (Comfortaa) vient de Google Fonts : hors réseau, le logo s'affiche dans la
police du système. Rien d'autre ne change.

Le reste — listes, décors, ponctuels, plan de travail, équipe, camions, plan de feux, exports
PDF — fonctionne sans aucune connexion.

## Les données

Elles vivent dans le téléphone (`localStorage`, et une réserve d'images séparée). Elles ne
sortent que si on le demande : roue crantée → **Exporter mes données** produit un `.json`
comme celui de `exemple/`. Pour repartir de la démonstration, il suffit de charger ce fichier.

Au tout premier lancement, sur un appareil qui n'a encore rien enregistré, l'app s'ouvre sur
trois films de démonstration, dont **PANORAMA** — le même que `exemple/PANORAMA-LEGER.json`,
avec ses décors, ses ponctuels, sa liste, son équipe, ses camions et ses post-it. Dès qu'un
enregistrement existe dans l'appareil, c'est lui qui s'affiche : la démonstration ne revient
jamais par-dessus des données réelles.

## Le mode confidentiel

Roue crantée → **Mode confidentiel** : plus aucune adresse n'est envoyée à un service
extérieur (ni recherche d'adresse, ni géocodage). À utiliser quand le film est sensible.
