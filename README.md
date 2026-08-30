# Pianola

Pianola est un séquenceur piano-roll polyphonique, tactile et entièrement local,
construit avec React, TypeScript, Canvas et Web Audio. Il fonctionne dans le
navigateur sans serveur applicatif, base distante ni compte utilisateur.

Ce README est un portail. Les détails vivent dans les guides de `docs/` et dans
les README placés près du code qu’ils décrivent.

## Démarrage rapide

Prérequis :

- Node.js 22, version fixée dans [`.nvmrc`](.nvmrc) ;
- npm, fourni avec Node.js ;
- un navigateur récent avec Web Audio et Canvas.

Installation et démarrage :

```bash
npm ci
npm run dev
```

Vite affiche l’URL locale, normalement `http://localhost:5173`. L’application
ouvre la bibliothèque locale ; créez ou importez ensuite un projet. Pour tester
depuis une tablette du même réseau, ouvrez l’adresse réseau indiquée par Vite et
autorisez le port dans le pare-feu local si nécessaire.

Avant de proposer un changement :

```bash
npm run verify
```

## Commandes essentielles

| Commande | Rôle |
| --- | --- |
| `npm run dev` | lancer Vite sur le port 5173 |
| `npm run build` | vérifier TypeScript puis produire `dist/` |
| `npm test` | exécuter la suite Vitest |
| `npm run test:worklet-build` | charger et faire rendre le module AudioWorklet produit |
| `npm run typecheck` | vérifier les trois configurations TypeScript |
| `npm run check:docs` | vérifier liens locaux et chemins documentés |
| `npm run check:structure` | vérifier géographie, guides et anciens chemins |
| `npm run check:boundaries` | vérifier couches, séparation produit/tests et cycles d'import |
| `npm run verify` | exécuter tous les contrôles, le build et son smoke test audio |
| `npm run preview` | servir localement le build de production |

Les variantes de tests sont décrites dans le
[guide de développement](docs/guides/development.md).

## Où commencer

| Besoin | Point d’entrée |
| --- | --- |
| découvrir la documentation | [`docs/README.md`](docs/README.md) |
| commencer une modification | [`docs/guides/contributing.md`](docs/guides/contributing.md) |
| trouver le code d’une capacité | [`docs/code-map.md`](docs/code-map.md) |
| comprendre les couches | [`docs/architecture.md`](docs/architecture.md) |
| savoir quel état persiste | [`docs/state-ownership.md`](docs/state-ownership.md) |
| installer et vérifier | [`docs/guides/development.md`](docs/guides/development.md) |
| utiliser l’éditeur | [`docs/guides/usage.md`](docs/guides/usage.md) |
| comprendre `.pianola` et MIDI | [`docs/guides/project-files.md`](docs/guides/project-files.md) |
| déployer | [`docs/guides/deployment.md`](docs/guides/deployment.md) |
| résoudre un problème | [`docs/guides/troubleshooting.md`](docs/guides/troubleshooting.md) |

## Carte du dépôt

```text
src/
├── bootstrap/                   entrée Vite, création du runtime et assemblage
├── application/                intentions et orchestrations indépendantes de React
│   ├── editor-session/          agrégat de session et workspace persistant
│   ├── history/                 store, transactions et sélection Undo/Redo
│   ├── piano-roll/              intentions notes, sélection et timeline
│   └── ports/                   contrats applicatifs de persistance
├── domain/                     document, commandes, théorie musicale et invariants
├── editor-core/                noyau d’édition indépendant du DOM
├── infrastructure/             adaptateurs navigateur et formats
│   ├── audio/                   timeline et moteur AudioWorklet
│   ├── browser/                 enregistrement du service worker
│   ├── persistence/             IndexedDB, Worker et codecs locaux
│   └── project-files/           formats `.pianola` et Standard MIDI File
└── presentation/                React, DOM, Canvas et styles par surface
```

Les tests purs vivent près de leur module. Les flux traversant plusieurs
propriétaires restent dans `tests/integration/`. Il n’existe pas de barrel
global : les imports indiquent toujours le propriétaire précis.

## Architecture en une minute

Le chemin normal d’une modification musicale est :

```text
composant visible
  → hook ou adaptateur de capacité
  → cas d’usage
  → commandes atomiques
  → ProjectStore
  → reducer du domaine
  → snapshot dérivé pour Canvas ou Web Audio
```

`src/bootstrap/App.tsx` crée le runtime décrit par
`src/application/editor-session/editor-runtime.ts` et monte
`PianoRollWorkspace`. `PianoRollWorkspaceLayout` possède sa structure DOM et le
portal de toolbar ; les protocoles de préférences, dialogues, instruments,
collisions, fichiers, sélection, transport et viewport appartiennent aux
capacités UI correspondantes. Les snapshots React partagés utilisent des
sélecteurs `useSyncExternalStore`, tandis que les valeurs à fréquence frame
restent sur les signaux du runtime.

Le noyau de l’éditeur sous `src/editor-core/` ne connaît ni React ni le
DOM. Les `PointerEvent` sont convertis en échantillons immuables par l’adaptateur
UI avant d’entrer dans la stratégie de gestes.

Le domaine est réparti par vocabulaire produit :

- `src/domain/identifiers.ts` pour les identifiants et ticks ;
- `src/domain/notes/note.ts` pour une note ;
- `src/domain/instruments/instrument.ts` pour sons et instruments projet ;
- `src/domain/clips/clip.ts` pour pistes, timelines et clips ;
- `src/domain/transport/transport.ts` pour horloge, métrique et boucle ;
- `src/domain/transport/time-map.ts` comme surface publique des modules de
  modèle, navigation, marqueurs et éditions structurelles de la time map ;
- `src/domain/music-theory/` pour snap par motif de hauteurs, orthographe et accords ;
- `src/domain/master-bus.ts` pour le bus master ;
- `src/domain/project/project-document.ts` pour le document et la sélection de
  clip de la session d'éditeur.

Les constantes ne vivent plus dans une racine horizontale : chaque famille est
colocalisée avec son propriétaire (`domain`, `editor`, `audio`, MIDI,
`.pianola`, rendu ou styles). Les commandes de clips sont séparées entre valeurs,
groupes, concaténation/découpe, hiérarchie et invariants.

Les frontières exécutables couvrent toutes les racines TypeScript courantes,
interdisent au domaine et au noyau d’éditeur de dépendre de React, du navigateur
ou de la composition applicative, séparent le graphe produit du graphe de tests
et refusent tout nouveau cycle d'import.

## Propriété des états

Pianola distingue quatre durées de vie :

| État | Propriétaire | Persisté | Undo/Redo |
| --- | --- | --- | --- |
| document musical | `ProjectDocument` dans `ProjectStore` | oui | oui |
| session d'éditeur minimale | `EditorSessionState`, dont `ActiveClipSelection` | clip actif projeté à la sauvegarde | document uniquement |
| contexte d'éditeur persistant | `PersistedEditorWorkspace`, dont `PersistedClipEditorState` par clip | oui, avec le document | non |
| préférences utilisateur | `UserSettingsRepository` | oui, séparément | non |
| session de geste | sélection, draft, lasso, presse-papier | non | non |
| temps réel | transport AudioWorklet, voix DSP, buffers Canvas | non | non |

Une intention validée produit au plus une transaction. Les déplacements
intermédiaires du pointeur ne modifient pas `EditorSessionState`. Le détail complet se
trouve dans [`docs/state-ownership.md`](docs/state-ownership.md).

## Surfaces principales

### En-tête et transport

L’en-tête contient le titre du projet, les fichiers, les métriques musicales et
le transport. Le bouton de lecture part de
`src/presentation/transport/TransportControls.tsx`, traverse
`src/presentation/transport/useAudioPlayback.ts`, puis la façade
`src/infrastructure/audio/audio-worklet-transport.ts`.

### Piano roll

Le piano roll assemble ruler, boucle, clavier, couches Canvas, playhead et
contrôles de viewport. Le flux complet d’un geste est documenté dans
[`src/editor-core/README.md`](src/editor-core/README.md).

Le rendu musical est dessiné sur Canvas. Les éléments DOM transitoires ne
servent qu’aux fantômes de notes, sélections, lasso et contrôles accessibles.

### Inspecteur projet

`src/presentation/inspector/ProjectInspector.tsx` rend les clips et instruments. Le
document musical reste propriétaire des valeurs durables ; les hooks
d’inspecteur ne gardent que le protocole d’interaction.

### Fichiers projet

Le menu du projet est dans `src/presentation/project-files/ProjectMenu.tsx`. Le
format `.pianola` vit sous `src/infrastructure/project-files/pianola/` et le
MIDI sous `src/infrastructure/project-files/midi/`.
Consultez le [guide des fichiers](docs/guides/project-files.md) avant de modifier
un schéma, un parseur ou un export.

## Utilisation résumée

- Lecture/Pause démarre ou suspend la lecture au playhead.
- Stop annule les voix et replace le statut sans modifier le document.
- Un appui long dans la grille dessine une note.
- Le glisser déplace une sélection ; les poignées redimensionnent les notes.
- Le lasso sélectionne une zone ; le mode additif ou soustractif modifie la
  sélection existante.
- Copier, couper, coller, supprimer, transformer et transférer produisent des
  transactions cohérentes.
- Une collision demande explicitement de fusionner ou de découper aux ancres.
- Les clips partagent les instruments globaux mais gardent leurs notes — avec
  leurs propriétés `muted` et `locked` —, leur timeline et leur boucle.

Tous les gestes et contrôles sont détaillés dans
[`docs/guides/usage.md`](docs/guides/usage.md).

## Fichiers et données

Le format `.pianola` version 1 stocke un document musical de schéma 1 et le workspace projet,
jamais les préférences utilisateur. Le parseur traite le JSON comme inconnu,
vérifie identité, version et limites, puis crée une entrée distincte dans la
bibliothèque IndexedDB. Toute autre version de fichier est refusée.

L’import MIDI analyse d’abord le SMF, présente les avertissements et collisions,
puis construit un nouveau projet. L’export reçoit une projection musicale
neutre ; le codec ne connaît ni React, ni le store, ni le clip affiché.

Les données restent locales. L'autosave conserve deux générations validées et
publie leur résumé dans le catalogue ; l'export `.pianola` reste la sauvegarde
portable appartenant à l'utilisateur. Fichiers, snapshots et layout IndexedDB
partent tous de leur première baseline. Il n'existe encore aucune version
historique à migrer. Les enveloppes projet futures sont refusées intactes ; un
layout IndexedDB supérieur incompatible est recréé pendant ce reset initial.

## Tests et validation

Avant livraison, exécuter `npm run verify`. Cette commande contrôle :

1. liens et chemins documentaires ;
2. structure, noms retirés et guides locaux ;
3. frontières d’import, isolation navigateur, séparation produit/tests et
   cycles ;
4. TypeScript strict ;
5. build Vite de production ;
6. chargement et rendu du module AudioWorklet produit ;
7. suite Vitest.

La suite centrale de régression reste volontairement en place. Pour cibler un
fichier :

```bash
npm test -- tests/integration/critical-behavior.test.ts
npm test -- src/infrastructure/audio/__tests__/playback-plan.test.ts
npm test -- src/infrastructure/audio/__tests__/worklet-timeline-engine.test.ts
```

Les interactions réelles tactiles, Canvas et Web Audio conservent une part de
validation humaine.

## Déploiement

Le dépôt contient un workflow GitHub Actions et une configuration Vercel. La CI
exécute `npm ci`, puis `npm run verify`. Vercel construit avec `npm run build` et
publie `dist/`.

Les étapes de première connexion, de vérification et de retour arrière sont dans
[`docs/guides/deployment.md`](docs/guides/deployment.md).

## Contribution

Avant une modification structurelle, identifiez :

- le propriétaire de la capacité ;
- le chemin d’entrée et les dépendances concernées ;
- les tests, styles et documents concernés ;
- le point d’entrée à mettre à jour dans `docs/code-map.md`.

Le parcours de contribution est décrit dans
[`docs/guides/contributing.md`](docs/guides/contributing.md). La checklist de
livraison est fournie par
[`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).

Les conventions principales sont : fichiers TypeScript en kebab-case,
composants React en PascalCase, hooks en `useCamelCase`, imports précis et aucun
fichier fourre-tout nommé seulement `types`, `helpers`, `utils`, `common`,
`state`, `input` ou `contracts`.

## Limites connues

- aucune synchronisation cloud ou collaboration temps réel ;
- aucun système de plugins ou d’effets audio éditables ;
- un seul type d’instrument sonore, le synthé soustractif ;
- pas de tests navigateur automatisés ;
- support MIDI centré sur les événements nécessaires au piano roll.

Licence : [MIT](LICENSE).
