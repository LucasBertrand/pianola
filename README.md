# Pianola

Pianola est un séquenceur piano roll polyphonique, tactile en priorité, qui
fonctionne entièrement dans le navigateur. L’application permet de composer,
éditer, lire, sauvegarder et échanger des projets MIDI sans serveur applicatif
ni compte utilisateur.

Cette documentation est le guide de référence pour installer, comprendre,
déployer, maintenir et dépanner le projet.

## Sommaire

- [État du projet](#état-du-projet)
- [Fonctionnalités principales](#fonctionnalités-principales)
- [Architecture et stack](#architecture-et-stack)
- [Développement local](#développement-local)
- [Commandes disponibles](#commandes-disponibles)
- [Variables d’environnement](#variables-denvironnement)
- [Tests et build de production](#tests-et-build-de-production)
- [Déploiement continu GitHub vers Vercel](#déploiement-continu-github-vers-vercel)
- [Utilisation de Pianola](#utilisation-de-pianola)
- [Formats de fichiers](#formats-de-fichiers)
- [Guide de maintenance](#guide-de-maintenance)
- [Dépannage](#dépannage)
- [Checklist de release](#checklist-de-release)
- [Limites connues et évolutions](#limites-connues-et-évolutions)

## État du projet

La version courante est `1.0.0`.

Pianola est une application frontend statique :

- aucun backend n’est requis ;
- aucune base de données n’est utilisée ;
- aucune donnée utilisateur n’est envoyée à un serveur par le code actuel ;
- le projet actif réside en mémoire dans l’onglet du navigateur ;
- l’utilisateur doit explicitement enregistrer un fichier `.pianola` pour
  conserver son travail.

Un rechargement, une fermeture d’onglet ou la création d’un nouveau projet
peut donc faire perdre les changements non enregistrés.

Le navigateur cible doit être moderne et prendre en charge Pointer Events,
Canvas 2D, ResizeObserver, Web Audio API et les modules JavaScript natifs. Les
tests manuels importants doivent être effectués au minimum sur Chrome Android,
Firefox Android et un navigateur desktop.

## Fonctionnalités principales

- modèle de projet immuable organisé par voix ;
- commandes atomiques avec Undo/Redo ;
- édition tactile des notes : sélection, lasso, déplacement, resize, dessin
  par appui long et suppression ;
- panoramique et zoom à deux doigts ;
- magnétisme temporel et magnétisme tonal par gamme ou accord ;
- résolution des collisions par annulation, fusion ou découpe aux ancres ;
- voix configurables : nom, couleur, ordre, volume, mute, solo et verrouillage ;
- synthétiseur soustractif par voix avec forme d’onde, enveloppe ADSR et
  polyphonie de 1 à 16 notes ;
- moteur audio Web Audio avec scheduler lookahead et vol de la voix la plus
  ancienne lorsque la polyphonie est saturée ;
- tête de lecture, tempo, métrique, grille straight/triplet/dotted et boucle ;
- import MIDI SMF 0/1 et export MIDI SMF 1 ;
- sauvegarde et chargement du format natif `.pianola` ;
- rendu Canvas multicouche HiDPI avec culling par index spatial ;
- interface responsive paysage/portrait pensée pour tablette.

## Architecture et stack

### Technologies

| Élément | Rôle |
| --- | --- |
| React 19 | Layout, contrôles à faible fréquence et cycle de vie |
| TypeScript strict | Modèle, validation, géométrie, audio et UI |
| Vite 7 | Serveur de développement et bundle de production |
| Canvas 2D | Grille et rendu performant des notes |
| Web Audio API | Synthèse soustractive et lecture planifiée |
| Pointer Events | Souris, tactile, stylet générique et multi-touch |
| CSS natif | Layout responsive et apparence de l’application |
| Node.js 22 | Toolchain de développement, build et tests |

Il n’y a pas de bibliothèque de state management, de moteur audio externe, de
framework CSS ni de routeur. Le nombre limité de dépendances réduit la surface
de panne et simplifie les mises à jour.

### Structure du dépôt

```text
.
├── .github/workflows/ci.yml   Vérification automatique GitHub Actions
├── public/                    Manifeste et icône copiés tels quels dans dist
├── scripts/                   Suites de tests audio/domaine et MIDI
├── src/
│   ├── app/                   Racine de composition et runtime d'un éditeur
│   ├── application/           Cas d'usage, sélection et plans de commandes
│   ├── audio/                 Snapshot, scheduler et moteur Web Audio
│   ├── config/                Constantes produit et réglages centralisés
│   ├── domain/                Modèle, validation, commandes, reducer et store
│   ├── geometry/              Conversion de coordonnées et index spatial
│   ├── interaction/           Session et calculs de gestes sans React
│   ├── midi/                  Lecture, écriture, import et export SMF
│   ├── music/                 Théorie musicale et magnétisme tonal
│   ├── persistence/           Sérialisation du format natif Pianola
│   ├── ui/                    Canvas, hooks, interactions et signaux de rendu
│   ├── main.tsx               Point d’entrée React
│   └── styles.css             Styles globaux et responsive
├── index.html                 Document HTML et métadonnées de Pianola
├── package.json               Dépendances et scripts npm
├── vercel.json                Build, headers et fallback SPA Vercel
```

### Flux d’une modification

```text
Pointer Event
    ↓
Draft mutable + ghost visuel
    ↓ au pointerup uniquement
Transaction de commandes
    ↓
Reducer pur → nouveau ProjectState immuable
    ↓
ProjectStore → historique + abonnés
    ├──→ reconstruction de l’index spatial si nécessaire
    ├──→ invalidation ciblée des Canvas
    └──→ nouveau snapshot des événements audio futurs
```

Cette séparation est une règle fondamentale. Pendant un geste, le store global
ne doit pas être modifié à chaque `pointermove`. Le brouillon mutable assure la
fluidité ; une seule transaction est envoyée lorsque le geste est validé.

### Domaine et historique

`src/domain/model.ts` décrit `ProjectState`, les voix, les pistes, les notes,
le transport et le master bus. Les propriétés persistantes sont en lecture
seule. `src/domain/commands.ts` est l’unique chemin normal pour modifier le
projet. Le reducer valide les invariants et renvoie un nouvel état.

`src/domain/project-store.ts` conserve des snapshots bornés pour Undo/Redo.
Une transaction utilisateur correspond à une étape d’historique, y compris
une résolution de collision complexe.

### Rendu et interactions

React gère la structure, les formulaires et les abonnements. Les notes ne sont
pas des composants React individuels :

- `PianoRollLayers.tsx` compose les couches ;
- `useCanvasRenderer.ts` gère ResizeObserver, HiDPI et
  `requestAnimationFrame` ;
- `spatial-index.ts` classe les notes dans 128 buckets MIDI et limite le rendu
  aux notes visibles ;
- `interaction/core` calcule quantification, bornes et pinch/pan sans DOM ;
- `PianoRollInteractionSession` possède le draft, la sélection et les buffers ;
- `usePianoRollEvents.ts` adapte les transitions vers les commandes ;
- `DomInteractionVisualController` affiche les ghosts et poignées temporaires ;
- `InteractionOverlay.tsx` monte les couches DOM et branche les adaptateurs ;
- `render-signal.ts` permet de redessiner sans re-render React.

Éviter `setState`, `map`, `filter` et la création d'objets dans les boucles de
rendu ou de `pointermove`.

Les règles de dépendances, le cycle détaillé d'un geste et l'ordre conseillé
pour poursuivre la modularisation sont décrits dans
[`docs/architecture.md`](docs/architecture.md).

### Audio

`useAudioPlayback.ts` relie le store au moteur. Un `AudioContext` est créé de
façon paresseuse après une action utilisateur. `playback-snapshot.ts` compile
un état immuable et `lookahead-scheduler.ts` programme les événements à
l’avance. `subtractive-audio-engine.ts` construit le graphe Web Audio.

Les événements futurs sont recalculés après une édition sans couper les notes
déjà audibles. La vélocité est conservée dans les fichiers, mais le niveau de
lecture est volontairement constant dans cette version ; cette politique est
centralisée dans `src/audio/note-dynamics.ts`.

### Persistance et MIDI

Le format natif enregistre l’état complet utile de Pianola. MIDI sert à
l’interopérabilité et ne peut pas conserver toutes les propriétés spécifiques
à l’application. Les parseurs imposent des limites de taille et de nombre
d’événements pour protéger la mémoire d’une tablette.

## Développement local

### Prérequis

- Git ;
- Node.js `22.x` ;
- npm, fourni avec Node.js.

Vérifier les versions :

```bash
node --version
npm --version
git --version
```

La version Node doit commencer par `v22.`. Le fichier `.nvmrc` contient la
version majeure attendue.

### Première installation

Depuis la racine du dépôt :

```bash
npm ci
npm run dev
```

Ouvrir ensuite :

```text
http://localhost:5173
```

`npm ci` recrée exactement les dépendances définies par `package-lock.json`.
Utiliser `npm install` uniquement lorsque les dépendances doivent être
modifiées.

### Accès depuis une tablette sur le même réseau

Le script de développement écoute déjà sur `0.0.0.0:5173`.

1. Lancer `npm run dev`.
2. Trouver l’adresse IPv4 du PC avec `ipconfig` sous Windows.
3. Ouvrir `http://ADRESSE_IP_DU_PC:5173` sur la tablette.

Si le pare-feu Windows bloque le réseau local, exécuter une fois PowerShell en
administrateur :

```powershell
New-NetFirewallRule -DisplayName "Pianola Vite 5173" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Public -RemoteAddress LocalSubnet
```

Ne pas exposer le serveur Vite directement sur Internet. Pour un accès public,
utiliser le déploiement Vercel en HTTPS.

## Commandes disponibles

| Commande | Usage |
| --- | --- |
| `npm run dev` | Lance Vite sur toutes les interfaces, port 5173 |
| `npm run typecheck` | Vérifie tout le TypeScript strict |
| `npm run typecheck:core` | Vérifie domaine, géométrie, MIDI et persistance |
| `npm run typecheck:ui` | Vérifie React, DOM, UI et audio complet |
| `npm run test:audio` | Lance la suite domaine/application/audio/persistance |
| `npm run test:midi` | Lance 9 tests d’intégration MIDI |
| `npm test` | Lance les deux suites de tests |
| `npm run build` | Typecheck puis produit le bundle `dist/` |
| `npm run preview` | Sert localement le dernier build de production |
| `npm run verify` | Build complet puis toutes les suites de tests |

La commande de référence avant un commit ou une release est :

```bash
npm run verify
```

## Variables d’environnement

Pianola `1.0.0` ne requiert aucune variable d’environnement.

Le fichier `.env.example` est volontairement vide de clé. Il sert de contrat :
si une variable est ajoutée plus tard, elle doit être documentée dans ce
fichier et dans cette section.

Règles Vite à respecter :

- seules les variables préfixées par `VITE_` sont accessibles au code
  navigateur ;
- une variable `VITE_` est publique et ne doit jamais contenir de secret ;
- les secrets éventuels ne doivent pas être utilisés dans un frontend
  statique : ils nécessitent une fonction serveur ou un backend ;
- les fichiers `.env`, `.env.local` et `.env.production` sont ignorés par Git ;
- `.env.example` est suivi par Git et ne contient que des valeurs factices.

Pour préparer une configuration locale future :

```bash
cp .env.example .env.local
```

Sous PowerShell :

```powershell
Copy-Item .env.example .env.local
```

## Tests et build de production

### Vérification complète

```bash
npm ci
npm run verify
```

Le build attendu est `dist/`, avec au minimum :

```text
dist/
├── assets/
├── index.html
├── manifest.webmanifest
└── pianola-icon.svg
```

Tester le résultat localement :

```bash
npm run preview
```

Puis ouvrir `http://localhost:4173`.

`vite preview` est uniquement destiné à vérifier le bundle local. Vercel sert
les fichiers de production.

### Couverture actuelle

Les tests exécutables couvrent les invariants du domaine, les commandes,
l’historique, les collisions, la persistance, le timing audio, le scheduler,
la polyphonie, le solo, les boucles et les conversions MIDI.

Les gestes tactiles, le layout responsive, le rendu Canvas et le comportement
réel de Web Audio doivent encore être validés manuellement. Le plan des tests
géométriques complémentaires se trouve dans
`src/geometry/__tests__/TEST_PLAN.md`.

## Déploiement continu GitHub vers Vercel

### Ce qui est déjà configuré

- `.github/workflows/ci.yml` lance `npm ci` puis `npm run verify` sur les push
  vers `main` et sur les pull requests ;
- `package.json` impose Node `22.x` ;
- `vercel.json` sélectionne Vite, lance `npm run build` et publie `dist` ;
- le fallback `/(.*) → /index.html` évite les erreurs 404 de navigation SPA ;
- des headers HTTP prudents désactivent caméra, microphone et géolocalisation.

### Première connexion à Vercel

1. Créer ou utiliser un dépôt GitHub contenant ce projet.
2. Vérifier localement avec `npm run verify`.
3. Pousser le projet sur la branche `main`.
4. Dans Vercel, choisir **Add New → Project**.
5. Connecter GitHub et importer le dépôt Pianola.
6. Vérifier les réglages détectés :

| Réglage Vercel | Valeur |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `.` |
| Install Command | `npm install` ou valeur automatique |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 22.x |

7. Ne définir aucune variable d’environnement pour cette version.
8. Cliquer sur **Deploy**.
9. Tester la lecture audio, le tactile, Save/Load et MIDI sur l’URL HTTPS.

`vercel.json` versionne les réglages essentiels. Si le dashboard et ce fichier
se contredisent, le fichier du dépôt doit rester la source de vérité.

### Déploiements suivants

Après la connexion du dépôt :

- un push sur `main` déclenche la vérification GitHub et un déploiement Vercel
  de production ;
- une pull request déclenche la CI et crée normalement une Preview Vercel ;
- un commit qui échoue au build ne doit pas être promu en production.

Workflow normal :

```bash
git status
npm run verify
git add .
git commit -m "type: concise description"
git push origin main
```

Consulter ensuite :

- l’onglet **Actions** de GitHub pour la CI ;
- l’onglet **Deployments** de Vercel pour le build et l’URL.

### Retour arrière

La méthode la plus traçable est de créer un commit qui annule le commit
défectueux :

```bash
git log --oneline
git revert IDENTIFIANT_DU_COMMIT
git push origin main
```

Vercel reconstruira automatiquement la version corrigée. Le dashboard Vercel
permet aussi de promouvoir un déploiement antérieur en urgence, mais le dépôt
Git doit ensuite être remis au même état afin d’éviter une divergence.

## Utilisation de Pianola

### Projet et historique

Le menu hamburger contient New, Save, Load, Import MIDI et Export MIDI.
Undo/Redo se trouvent à côté. Le titre du projet est éditable dans le header.

Save télécharge un fichier `.pianola`. Il n’existe pas encore d’auto-save ni de
stockage dans le navigateur.

### Notes

- Tap sur une note : sélection.
- Tap dans le vide : désélection ou début du lasso.
- Drag d’une note sélectionnée : déplacement de la sélection.
- Drag d’une poignée visible : redimensionnement.
- Appui long dans une cellule vide puis drag : création et durée.
- Double clic/tap sur une note : suppression.
- Icône poubelle : suppression de la sélection.
- Copier/couper/coller : collage à partir de la tête de lecture.

Une collision entre notes de même pitch et même voix ouvre une modale offrant
l’annulation, la fusion ou la découpe. Deux notes de pitchs différents peuvent
se superposer dans le temps.

### Clavier, snap et navigation

- Tap sur une touche : preview audio si le bouton de preview est activé.
- Appui long sur une touche : ajoute ou retire les notes de ce pitch de la
  sélection.
- Deux doigts : pan et zoom.
- Les sliders inférieurs contrôlent position et zoom horizontal/vertical.
- Le snap temporel suit la grille.
- Le snap tonal limite les déplacements aux notes de la tonique et du motif
  sélectionnés.

### Voix et instrument

L’inspecteur permet d’ajouter, supprimer et réordonner les voix. Les notes
créées utilisent la voix sélectionnée.

- **Mute** coupe la voix et atténue ses notes visuellement.
- **Solo** ne lit que les voix solo.
- **Lock** rend les notes non éditables et les affiche hachurées.
- La cible sélectionne les notes de la voix sans supprimer la sélection des
  autres voix.

Chaque voix possède un synthétiseur soustractif, une forme d’onde, une
polyphonie, une enveloppe ADSR, une couleur et un volume.

### Transport et boucle

Le transport contrôle lecture, pause, stop et retour au début. Le ruler
positionne la tête de lecture avec snap. Deux drapeaux définissent la région de
boucle. Ses lignes restent visibles en gris quand elle est inactive.

L’ajout ou la suppression de mesures transforme les données temporelles des
notes. La boucle ne change que si elle doit être bornée à la nouvelle durée du
projet.

## Formats de fichiers

### Format natif `.pianola`

Le format natif conserve le projet, les voix, les notes, les instruments, le
master bus, le transport, la boucle et les métadonnées de document. Il restaure
également le contexte de l’éditeur : voix active, grille, snap tonal, guide
visuel, preview clavier, mode de sélection, coloration des notes, zoom et
position de la vue. Les états temporaires comme une sélection de notes ou une
modale ouverte ne sont volontairement pas sauvegardés.

Son identité et sa version sont définies dans
`src/config/program-constants.ts`, puis validées dans
`src/persistence/native-project-file.ts`.

Le passage officiel à Pianola a créé le format
`app.pianola.native-project` et l’extension `.pianola`. Les anciens fichiers
portant l’identité `.pianoroll` ne sont pas pris en charge par cette release.
Le format reste en version native 1 pendant cette phase de développement. Il
n’existe pas encore de stratégie de migration entre les sauvegardes produites
par des révisions différentes de l’application.

Avant de changer le schéma :

1. modifier les types du domaine ;
2. mettre à jour le reducer et la validation ;
3. mettre à jour la sérialisation et le parsing ;
4. augmenter les versions de schéma appropriées ;
5. ajouter un test de round-trip et, si nécessaire, une migration ;
6. vérifier Save puis Load dans le navigateur.

Ne jamais accepter directement un JSON externe comme `ProjectState` sans
passer par le parseur borné et la validation.

### MIDI

L’import accepte SMF format 0 et 1 avec timing PPQN. Le premier tempo et la
première métrique supportée sont utilisés. Les événements non supportés sont
signalés et ignorés. CC64 n’est pas appliqué.

Si le MIDI contient des notes incompatibles avec les invariants de Pianola,
l’import demande de fusionner ou découper les collisions.

L’export produit un fichier format 1 avec une piste conductrice et une piste
par voix. MIDI ne conserve pas les couleurs, mute/solo/lock, paramètres du
synthétiseur, master bus, boucle ou réglages spécifiques à Pianola.

Les limites de sécurité et extensions sont dans `MIDI_CONSTANTS`, dans
`src/config/program-constants.ts`.

## Guide de maintenance

### Où modifier les éléments principaux

| Besoin | Fichier principal |
| --- | --- |
| Nom, description et titres par défaut | `src/config/program-constants.ts` |
| Métadonnées navigateur | `index.html` et `public/manifest.webmanifest` |
| Version npm | `package.json` et `package-lock.json` |
| Toutes les couleurs de l'application | `src/config/application-colors.ts` |
| Layout et règles visuelles DOM | `src/styles.css` |
| Valeurs par défaut et limites | `src/config/program-constants.ts` |
| Structure principale de l’UI | `src/app/App.tsx` |
| État initial et projet vierge | `src/app/demo-scene.ts` |
| Notes, voix, transport | `src/domain/model.ts` |
| Actions mutantes | `src/domain/commands.ts` |
| Cas d'usage et plans de commandes | `src/application/` |
| Collisions | `src/domain/note-collision.ts` |
| État et calculs des gestes | `src/interaction/` |
| Adaptateur des gestes au navigateur | `src/ui/hooks/usePianoRollEvents.ts` |
| Capture et multi-touch | `src/ui/hooks/useInteractionManager.ts` |
| Ghosts, poignées et lasso | `src/ui/interactions/dom-interaction-visual-controller.ts` |
| Rendu des notes et grille | `src/ui/components/PianoRollLayers.tsx` |
| Audio | `src/audio/` et `src/ui/hooks/useAudioPlayback.ts` |
| Format natif | `src/persistence/native-project-file.ts` |
| MIDI | `src/midi/` |

Le nom Pianola existe volontairement dans plusieurs fichiers statiques que le
navigateur ou npm lit avant l’exécution TypeScript. Pour un futur renommage,
chercher toutes les occurrences :

```bash
rg -n -i "pianola" .
```

### Modifier les constantes

Les réglages produit sont centralisés dans
`src/config/program-constants.ts`. Les groupes sont commentés en anglais :

- `APPLICATION_CONSTANTS` : identité produit ;
- `PROJECT_CONSTANTS` : limites et valeurs persistantes ;
- `VOICE_CONSTANTS` : instrument et voix par défaut ;
- `AUDIO_CONSTANTS` : scheduler et enveloppes ;
- `VIEWPORT_CONSTANTS` : zoom, dimensions et HiDPI ;
- `INTERACTION_CONSTANTS` : délais et zones tactiles ;
- `TONAL_SNAP_CONSTANTS` : toniques, modes et degrés ;
- `EDITOR_CONSTANTS` : transport, grille et sliders ;
- `RENDERING_CONSTANTS` : budgets et dimensions de rendu ;
- `FILE_CONSTANTS` : format natif ;
- `MIDI_CONSTANTS` : limites MIDI.

Après toute modification, exécuter `npm run verify` et tester la valeur sur
tablette si elle touche au rendu ou aux interactions.

### Ajouter une commande métier

1. Ajouter le type de commande et l’inclure dans l’union de
   `src/domain/commands.ts`.
2. Implémenter son traitement sans mutation de l’état reçu.
3. Valider toutes les données avant de produire le nouvel état.
4. Déclencher une transaction unique depuis l’UI.
5. Ajouter un scénario dans `scripts/test-audio.mjs` ou une nouvelle suite
   dédiée.
6. Vérifier Undo et Redo.

Ne pas modifier directement `ProjectState` dans un composant React.

### Modifier les couleurs

Toutes les couleurs sont définies dans `src/config/application-colors.ts`.
Ce fichier constitue l'unique source de vérité pour le DOM, les overlays et
les Canvas. Il est organisé par rôles visuels : surfaces neutres, accents,
grille du piano roll, notes, interactions et clavier.

Deux thèmes complets sont disponibles :

- `dark` : thème sombre historique de Pianola ;
- `score-paper` : thème clair beige inspiré du papier à musique.

Le thème actif est défini par `ACTIVE_APPLICATION_THEME_ID`. Changer cette
unique constante applique la palette choisie au CSS, aux Canvas, au ruler, au
clavier et aux contrôles natifs du navigateur.

Quelques points de repère utiles :

- `APPLICATION_COLORS.pianoRoll.degreeRootRows[0]` modifie la couleur de la
  tonique, qui appartient à la famille du degré I ;
- `degreeAccents`, `degreePitchRows` et `degreeRootRows` définissent les sept
  familles I à VII. Les variantes mineures et majeures d'un même intervalle
  partagent volontairement la même famille, par exemple `bIII` et `III` ;
- `APPLICATION_COLORS.pianoRoll.tonalSnapPitchRow` modifie les autres hauteurs
  autorisées par le mode ou le degré ;
- `APPLICATION_COLORS.notes.voicePalette` définit les couleurs proposées aux
  nouvelles voix ;
- `APPLICATION_COLORS.notes.pitchClassPalette` définit les douze couleurs du
  mode d'affichage par pitch ;
- `APPLICATION_CSS_COLOR_VARIABLES` relie la palette TypeScript aux variables
  CSS utilisées dans `src/styles.css`.

Ne pas ajouter directement de couleur hexadécimale, `rgb()` ou `rgba()` dans
un composant ou dans `src/styles.css`. Ajouter un rôle documenté à la palette,
puis consommer ce rôle depuis le Canvas ou via une variable CSS.

Exception statique : `index.html`, `public/manifest.webmanifest` et
`public/pianola-icon.svg` sont lus par le navigateur avant le code TypeScript.
Ils reprennent manuellement le fond principal et les deux accents de la
palette. Si ces trois couleurs changent, rechercher leurs anciennes valeurs
dans ces fichiers et les synchroniser.

### Modifier le rendu

Une modification de taille doit être testée dans ces configurations :

- desktop paysage ;
- tablette paysage ;
- tablette portrait, inspecteur fermé ;
- tablette portrait, inspecteur ouvert ;
- zoom horizontal minimal et maximal ;
- zoom vertical minimal et maximal ;
- devicePixelRatio élevé.

Ne pas dessiner les notes comme éléments DOM individuels. Conserver le culling
via `SpatialIndex.queryRect`.

### Modifier l’audio

Préserver les responsabilités :

- `playback-snapshot.ts` transforme le projet en données de lecture ;
- `time-math.ts` convertit ticks, secondes et boucles ;
- `lookahead-scheduler.ts` décide quand programmer ;
- `subtractive-audio-engine.ts` crée et contrôle les nœuds Web Audio ;
- `useAudioPlayback.ts` connecte le moteur au cycle de vie React.

Toute correction de timing doit être testable avec un faux moteur dans
`scripts/test-audio.mjs`. Éviter de dépendre de l’horloge murale directement
dans les calculs purs.

### Mettre à jour les dépendances

Commencer par une branche dédiée et conserver le lockfile :

```bash
git switch -c maintenance/dependency-update
npm outdated
npm audit
npm update
npm run verify
```

Pour une version majeure, mettre à jour une dépendance à la fois :

```bash
npm install NOM_DU_PACKAGE@latest
npm run verify
```

Contrôler ensuite manuellement Canvas, tactile, audio, import/export et
responsive. Commiter `package.json` et `package-lock.json` ensemble.

Ne pas supprimer `package-lock.json` pour résoudre un problème. Il garantit la
reproductibilité du build GitHub/Vercel.

### Modifier la version

Pour un correctif :

```bash
npm version patch --no-git-tag-version
npm run verify
```

Utiliser `minor` pour une fonctionnalité rétrocompatible et `major` pour un
changement incompatible. Mettre aussi à jour la ligne de version de ce README,
puis commiter les deux fichiers npm modifiés.

### Discipline Git recommandée

Avant de commencer :

```bash
git status
git pull --ff-only
git switch -c type/description-courte
```

Avant de pousser :

```bash
npm run verify
git diff --check
git status
git add .
git commit -m "type: concise description"
git push -u origin type/description-courte
```

Types de commits utiles : `feat`, `fix`, `refactor`, `docs`, `test`, `build`,
`chore`.

Éviter `git reset --hard` pour corriger une erreur. Préférer un commit de
correction ou `git revert` si le commit est déjà partagé.

## Dépannage

### `npm ci` échoue avec `EPERM` sous Windows

Cause fréquente : le serveur Vite garde `esbuild.exe` ou Rollup ouvert.

1. Arrêter `npm run dev` avec `Ctrl+C`.
2. Fermer les terminaux Node inutiles.
3. Relancer `npm ci`.

Ne pas supprimer `node_modules` pendant qu’un serveur Vite l’utilise.

### `React is not defined` ou page blanche

1. Ouvrir les DevTools, onglet Console.
2. Exécuter `npm run typecheck`.
3. Vérifier que `src/main.tsx` importe React/StrictMode et monte `App`.
4. Vérifier qu’aucun fichier JSX n’est exclu de `tsconfig.ui.json`.
5. Supprimer uniquement le cache Vite si nécessaire, puis relancer le serveur.

Le build production doit toujours être testé avec `npm run build`.

### Le build fonctionne localement mais échoue sur Vercel

Vérifier dans cet ordre :

1. Node.js `22.x` dans Vercel ;
2. Root Directory à la racine du dépôt ;
3. commande `npm run build` ;
4. dossier de sortie `dist` ;
5. présence et commit de `package-lock.json` ;
6. logs complets du déploiement Vercel ;
7. résultat de `npm ci && npm run verify` en local.

Ne pas masquer une erreur TypeScript dans le script de build : elle protège la
production.

### Une URL Vercel renvoie 404

Le fallback SPA se trouve dans `vercel.json` :

```json
{
  "source": "/(.*)",
  "destination": "/index.html"
}
```

Vérifier que `vercel.json` est à la racine et inclus dans le commit. Les vrais
fichiers de `dist` restent servis avant ce fallback.

### Aucun son

1. Déclencher Play ou une touche après une interaction utilisateur ; le
   navigateur bloque l’audio automatique.
2. Vérifier le mute master.
3. Vérifier mute et solo de chaque voix.
4. Vérifier le volume master et celui de la voix.
5. Regarder la Console pour une erreur d’`AudioContext`.
6. Tester l’URL HTTPS Vercel ou `localhost`.
7. Tester sans casque Bluetooth pour isoler la latence du périphérique.

Le code n’utilise pas le microphone et ne demande aucune permission audio.

### Le son saute après une édition

Inspecter :

- `didPlaybackStateChange` dans `useAudioPlayback.ts` ;
- `replacePlaybackState` dans `lookahead-scheduler.ts` ;
- l’annulation des événements futurs dans le moteur ;
- les tests « keeps active notes sounding » et « recurring loop ».

Une édition ne doit pas recréer tout le moteur ni redémarrer les notes déjà
commencées.

### La grille, le ruler ou les notes sont désalignés

Vérifier que tous utilisent :

- le même `ViewportState` ;
- le même `CoordinateConverter` ;
- le même `GridSettings` ;
- le même nombre de ticks par mesure.

Reproduire aux zooms minimum/maximum et après ouverture/fermeture de
l’inspecteur. Toute modification de viewport doit invalider les couches
concernées et recalculer la région visible.

### Le Canvas est flou ou absent sur Android

1. Tester le devicePixelRatio réel.
2. Vérifier les dimensions CSS et bitmap du Canvas.
3. Vérifier ResizeObserver et la limite DPR dans `VIEWPORT_CONSTANTS`.
4. Vérifier qu’une largeur/hauteur n’est jamais nulle après un changement de
   layout.
5. Tester Chrome Android et Firefox Android séparément.
6. Observer les erreurs de contexte Canvas dans la Console distante.

Éviter d’augmenter aveuglément le DPR maximal : la mémoire Canvas croît très
vite sur tablette.

### Le tactile sélectionne du texte ou ouvre un menu contextuel

Vérifier les règles `touch-action`, `user-select` et
`-webkit-touch-callout` de la zone concernée. Les sliders utilisent une
protection tactile standard. Ne pas bloquer globalement tous les événements :
cela casserait le multi-touch et l’accessibilité.

### Un fichier `.pianola` ne charge pas

1. Vérifier l’extension et la taille.
2. Ouvrir le fichier comme JSON sans le modifier.
3. Contrôler `format`, `formatVersion` et `project.schemaVersion`.
4. Lire le chemin précis affiché par `NativeProjectFileError`.
5. Reproduire avec un petit projet sauvegardé par la même version.

Ne pas contourner la validation pour récupérer un fichier. Écrire plutôt une
migration explicite et testée.

### Un MIDI ne s’importe pas

Pianola accepte SMF 0/1 avec PPQN, pas le timing SMPTE. Consulter le message
d’erreur, puis tester le fichier dans un autre séquenceur. Les limites de
taille, pistes, événements et notes sont intentionnelles.

Après toute correction du codec, exécuter :

```bash
npm run test:midi
```

### La CI GitHub échoue alors que le poste local passe

La CI part d’une installation propre avec `npm ci`. Les causes habituelles
sont :

- fichier non ajouté au commit ;
- différence de casse dans un chemin ;
- lockfile non synchronisé ;
- dépendance disponible seulement globalement sur le PC ;
- code dépendant de Windows ;
- version Node différente.

Lire la première erreur réelle dans le job GitHub, pas seulement la dernière
ligne.

## Checklist de release

Avant chaque mise en production :

- [ ] `git status` ne montre aucun fichier inattendu.
- [ ] La version de `package.json` est correcte.
- [ ] Le README reflète les changements visibles.
- [ ] `npm ci` fonctionne serveur Vite arrêté.
- [ ] `npm run verify` passe.
- [ ] `npm run preview` affiche le build.
- [ ] New, Save et Load fonctionnent.
- [ ] Import et export MIDI fonctionnent.
- [ ] Play, stop, seek, loop, mute et solo fonctionnent.
- [ ] Les gestes à un et deux doigts sont testés sur tablette.
- [ ] Portrait et paysage sont testés.
- [ ] Aucun `.env` ou fichier sensible n’est suivi par Git.
- [ ] La CI GitHub est verte.
- [ ] La Preview Vercel est testée avant promotion.

## Limites connues et évolutions

- un seul projet est ouvert à la fois ;
- pas d’auto-save, IndexedDB ou synchronisation cloud ;
- pas de backend, compte utilisateur ou collaboration ;
- pas encore de système d’onglets multi-projets ;
- un seul type d’instrument, le synthétiseur soustractif ;
- les descripteurs d’effets, règles génératives et interprétations de voix ne
  sont pas encore exécutés par le moteur audio ;
- la vélocité est stockée et exportée, mais pas appliquée au volume de lecture ;
- MIDI ne représente pas toutes les données du format natif ;
- les interactions Canvas/tactiles reposent surtout sur des tests manuels ;
- le dépôt est publié sous la licence Unlicense, décrite dans `LICENSE`.

La licence Unlicense place le code dans le domaine public dans la mesure
permise par la juridiction applicable et fournit le logiciel sans garantie.

Les extensions futures les plus naturelles sont l’auto-save local, les onglets
de projets, des tests navigateur automatisés, des effets audio, l’automation et
une stratégie explicite de compatibilité du format natif.
