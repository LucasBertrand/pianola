# Architecture de Pianola

Ce document décrit l’architecture réellement présente après le chantier P1.
Le [README](../README.md) couvre l’installation et l’usage ; la
[feuille de route](roadmap.md) ordonne les étapes suivantes. La propriété des
états est détaillée dans [state-ownership.md](state-ownership.md).

Dernière revue complète : 13 août 2026.

## Vue d’ensemble

Pianola est une application web statique. Le document musical, l’historique,
l’espace de travail et le moteur audio vivent dans l’onglet du navigateur. Il
n’existe ni serveur applicatif, ni base distante, ni synchronisation implicite.

```text
main.tsx
  └─ app                    composition et création du runtime
      ├─ ui                 React, DOM, Canvas et adaptateurs navigateur
      ├─ use-cases          orchestration indépendante de React
      ├─ editor             modèle d’édition, géométrie et interactions
      ├─ audio              compilation, scheduling et Web Audio
      └─ project-io         format natif et Standard MIDI File

domain                     document musical, invariants et historique
music                      vocabulaire tonal déterministe
config                     configuration divisée par propriétaire
```

Les règles centrales sont les suivantes :

1. `app` assemble mais n’héberge pas de protocole métier complet ;
2. `domain`, `editor` et `music` ne connaissent ni React ni le navigateur ;
3. `use-cases` ne dépend pas de composants UI ;
4. `audio` et `project-io` ne dépendent pas de la composition `app` ;
5. un geste validé produit une transaction unique dans l’historique.

Le script `scripts/check-import-boundaries.mjs` vérifie ces frontières ainsi que
la liste fermée des fichiers autorisés dans `src/app` et l’absence de noms de
fichiers génériques.

## Carte des capacités

### `src/app`

Le dossier est volontairement limité à trois fichiers :

- `App.tsx` compose contrôleurs, hooks de capacité et dialogues ;
- `create-app-runtime.ts` construit les services et signaux d’un onglet ;
- `demo-project.ts` produit les seules données de démonstration.

Aucun module interne ne doit importer cette couche de composition.

### `src/domain`

Le domaine possède `ProjectState`, les commandes, le reducer, les invariants,
les collisions, les transformations et `ProjectStore`. Les modifications
durables passent par `EditorCommandPort`, une `Transaction`, puis le reducer.

Le mixage et la configuration sonore appartiennent à `ProjectInstrument`. Les
notes sont stockées dans les pistes d’un clip. Le changement de clip reste une
navigation et ne consomme pas d’entrée Undo/Redo.

### `src/use-cases`

Cette couche contient les intentions et projections indépendantes de React :

- `commands` : façade de mutation de l’éditeur ;
- `notes` et `selection` : plans atomiques et protocole de collision ;
- `dialogs` : port de dialogue consommé par les workflows ;
- `project-files` : création initiale, état natif d’éditeur et projection MIDI.

Les hooks React qui déclenchent ces intentions vivent auprès de leur capacité
dans `ui`, jamais dans `app/workflows`.

### `src/editor`

`editor/model` porte les contrats neutres de grille, couleur, signaux et styles
dérivés. `editor/runtime` décrit les services d’un onglet. `editor/selection`
possède la sélection transitoire.

`editor/geometry` regroupe conversions ticks/pixels, bornes du viewport, région
visible et index spatial. `editor/interactions` regroupe la session du piano
roll, le masque de notes et deux sous-capacités :

```text
editor/interactions/
├─ gestures/                draft, machine à états et calculs déterministes
├─ pointer/                 PointerSample et stratégie indépendante du DOM
├─ editing-note-mask.ts
├─ piano-roll-controller-port.ts
└─ piano-roll-interaction-session.ts
```

Les `PointerEvent` natifs ne franchissent pas cette frontière : l’adaptateur UI
les transforme d’abord en `PointerSample` immuable.

### `src/ui`

Les composants et hooks sont rangés par capacité : `clips`, `dialogs`, `editor`,
`instruments`, `piano-roll`, `project-files`, `shared` et `transport`. Il
n’existe plus de dossiers globaux `components`, `hooks`, `browser` ou
`interactions`.

Le piano roll conserve ses adaptations DOM sous
`ui/piano-roll/interactions` et ses peintres sous
`ui/piano-roll/rendering`. Les notes ne sont pas des composants React ; Canvas
lit des `RenderSignal` depuis `requestAnimationFrame` et réutilise ses buffers.

### `src/audio`

```text
ProjectState + PlaybackSource explicite
  → compilePlaybackSnapshot
  → LookaheadScheduler
  → WebAudioEngine
  → InstrumentRenderer enregistré par kind
  → sources Web Audio
```

Le compilateur ne consulte pas `activeClipId`. Le scheduler ne contient aucune
branche propre au synthé soustractif : le moteur choisit un renderer dans son
registre par `instrument.kind`. Ajouter un second kind étend la variante de
snapshot et enregistre un renderer sans modifier l’algorithme de scheduling.

### `src/project-io`

`project-io/native/native-project-file.ts` parse et sérialise le format
`.pianola` v1 avec validation bornée. Les contrats d’éditeur persistés viennent
de `editor/model`, pas de l’UI.

`project-io/midi` sépare le codec SMF, sa validation, l’import et l’export.
L’import ne dépend plus de la palette de rendu. L’export reçoit une
`MidiExportProjection` musicale neutre construite dans `use-cases` ; il ne
connaît ni store ni écran actif.

### `src/config`

Chaque groupe possède un propriétaire explicite :

| Fichier | Propriétaire |
| --- | --- |
| `product-config.ts` | identité et données de démonstration |
| `domain-limits.ts` | valeurs durables et limites métier |
| `audio-config.ts` | moteur et lookahead |
| `editor-config.ts` | viewport et contrôles d’édition |
| `interaction-config.ts` | gestes et seuils pointeur |
| `music-config.ts` | snap tonal |
| `rendering-config.ts` | budgets et couleurs de rendu |
| `native-file-config.ts` | format `.pianola` |
| `midi-config.ts` | limites et valeurs SMF |

Le fichier fourre-tout `program-constants.ts` n’existe plus. Le domaine
n’importe pas les paramètres d’éditeur et le MIDI n’importe pas la configuration
de rendu.

## Flux principaux

### Validation d’un geste

```text
PointerEvent
  → adaptateur DOM / PointerSample
  → PianoRollInteractionSession + GestureStateMachine
  → feedback visuel immédiat
  → NoteGestureWorkflow
  → plan de commandes ou demande de collision
  → EditorCommandPort
  → ProjectStore / reducer / Undo-Redo
```

Pendant `pointermove`, `ProjectState` ne change pas. La transaction est publiée
une seule fois au terme du geste validé.

### Lecture

Le hook de transport choisit explicitement le clip, crée un
`ClipPlaybackSource`, compile un snapshot immuable puis le donne au scheduler.
Le scheduler manipule une horloge de lecture ; les occurrences audio et voix
sont temporaires et ne rejoignent jamais le document.

### Sauvegarde et échange

```text
Save  : ProjectState + NativeEditorState → validation → JSON → Blob
Load  : File → JSON inconnu → parse borné → remplacement du runtime
MIDI  : File ↔ codec SMF ↔ analyse/projection neutre ↔ projet
```

Le chargement et l’import arrêtent la lecture, annulent le geste, vident la
sélection et le presse-papier, puis remplacent le projet et restaurent l’espace
de travail.

## Nommage

- fichiers TypeScript : `kebab-case.ts` ;
- composants React : `PascalCase.tsx` ;
- hooks : `useCamelCase.ts` ;
- tests modernes : `*.test.ts[x]` ; les deux témoins historiques `.test.mjs`
  restent des suites Vitest identifiées dans le journal P1 ;
- ports : suffixe `-port.ts` ; adaptateurs : technologie explicite ;
- aucun fichier nommé seulement `types`, `contracts`, `state`, `input`,
  `helpers`, `utils` ou `common`.

## Vérification

La commande de référence est :

```bash
npm run verify
```

Elle exécute le contrôle des frontières, TypeScript strict, le build Vite et
82 scénarios Vitest. Les gestes DOM, Canvas, le responsive et Web Audio réel
restent complétés par la vérification manuelle décrite dans la roadmap.
