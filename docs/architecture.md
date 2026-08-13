# Architecture de Pianola

Ce document décrit les frontières et les principaux pipelines. Pour chercher un
comportement précis, partir de la [carte du code](code-map.md). Pour décider si
un état doit persister ou entrer dans Undo/Redo, consulter
[`state-ownership.md`](state-ownership.md).

Dernière revue complète : 13 août 2026.

## Vue d’ensemble

Pianola est une application web statique. Le document, l’historique, le runtime
d’édition et le moteur audio vivent dans l’onglet du navigateur.

```text
main.tsx
  → app                    création du runtime
  → ui                     composition React et adaptateurs DOM/Canvas
  → use-cases              intentions indépendantes de React
  → domain                 document, commandes et invariants

editor          noyau d’édition sans DOM
audio                      snapshot, transport, occurrences, voix et bus
project-io                 format natif et MIDI
```

Règles exécutables :

1. `src/app/` assemble et n’héberge aucun protocole complet ;
2. `src/domain/`, `src/editor/` et `src/music/` ne connaissent ni React ni le
   navigateur ;
3. `src/use-cases/` ne dépend pas de l’UI ;
4. `src/audio/` et `src/project-io/` ne dépendent pas de la composition ;
5. une intention musicale validée produit au plus une transaction.

## Composition

`src/app/App.tsx` crée `EditorRuntime` et monte
`src/ui/piano-roll/PianoRollWorkspace.tsx`. Le workspace assemble les surfaces,
mais délègue les protocoles à des hooks nommés :

- `useApplicationDialogs` pour alertes et confirmations ;
- `useInstrumentDialogWorkflow` pour le brouillon d’instrument ;
- `useNoteCollisionDialogWorkflow` pour merge/slice ;
- `usePianoRollProjectState` pour projet, clip, instrument et sélection ;
- les workflows fichiers, MIDI, transport, viewport, clips et sélection.

L’inventaire détaillé des états de composition est dans
[`app-composition.md`](app-composition.md).

## Domaine

Le domaine est réparti par propriétaire :

| Propriétaire | Contenu |
| --- | --- |
| `src/domain/identifiers.ts` | identifiants et tick |
| `src/domain/notes/note.ts` | note, pitch et vélocité |
| `src/domain/instruments/instrument.ts` | sons, presets et instruments |
| `src/domain/clips/clip.ts` | pistes, timeline et clips |
| `src/domain/transport/transport.ts` | horloge, métrique et boucle |
| `src/domain/master-bus.ts` | gain, mute et accordage master |
| `src/domain/project/project-document.ts` | document, workspace et accès clip |

Les mutations durables passent par `EditorCommandPort`, une transaction et les
reducers de `src/domain/commands/`. `ProjectStore` est le propriétaire de
l’historique musical.

## Noyau du piano roll

Tout le noyau propre à l’éditeur visible partage la racine
`src/editor/` :

```text
geometry/       conversions, bornes, région visible et index spatial
interactions/   draft, machine de gestes, pointeurs et session
model/          signaux et réglages neutres
runtime/        services d’un workspace
selection/      sélection transitoire et requêtes
viewport/       publication, batching et suivi de lecture
```

Les cas d’usage correspondants partagent
`src/use-cases/piano-roll/notes/` et
`src/use-cases/piano-roll/selection/`. Les primitives réellement transversales,
comme le service de commandes, restent au niveau `src/use-cases/commands/`.

## UI et styles

Les composants sont rangés par surface : dialogs, editor-toolbar, inspector,
piano-roll, project-files et transport. Le piano roll garde ses adaptateurs DOM
dans `src/ui/piano-roll/interactions/` et ses peintres Canvas dans
`src/ui/piano-roll/rendering/`.

`src/styles.css` importe des propriétaires symétriques : shell, application
header, editor toolbar, transport, project files, piano roll, inspector,
dialogs et responsive. Le fichier responsive ne coordonne que plusieurs
surfaces.

## Pipeline d’un geste

```text
PointerEvent
  → dom-pointer-sample
  → stratégie de geste
  → PianoRollInteractionSession
  → feedback DOM/Canvas transitoire
  → NoteGestureWorkflow
  → plan de commandes ou demande de collision
  → EditorCommandPort
  → ProjectStore / reducer / Undo-Redo
```

Pendant `pointermove`, le document ne change pas. Les rôles fréquents sont
séparés : manager de pointeurs, politique de seuils, double-tap, lasso,
ciblage/stratégie, contrôleur de sélection et contrôleur visuel.

## Pipeline audio

```text
ClipPlaybackSource
  + InstrumentSettingsPreviewLayer (optionnelle, transitoire)
  → compilePlaybackPlan
  → PlaybackSnapshot
  → LookaheadScheduler (horloge et fenêtre)
  → playback-occurrence-scheduler (occurrences et notes tenues)
  → WebAudioEngine (cycle de vie navigateur)
  → web-audio-routing + voice-allocation
  → InstrumentRenderer
```

Le dialogue d’instrument reste propriétaire de son brouillon. À chaque réglage,
`useAudioPlayback` construit une couche de prévisualisation indépendante du
document et recompile un snapshot dérivé. Les changements sont regroupés par
frame ; si le transport joue, le snapshot et les paramètres continus des voix
actives sont mis à jour sans redémarrer l’horloge ni annuler les occurrences.
À l’annulation la couche est retirée ; à la confirmation, une unique commande
publie le brouillon dans `ProjectStore` et donc dans Undo/Redo.

Les façades publiques restent `src/audio/lookahead-scheduler.ts` et
`src/audio/web-audio-engine.ts`. Le scheduler ne connaît aucun synthé concret ;
le moteur choisit un renderer selon `instrument.kind`.

## Fichiers projet

Le format natif sépare schéma, sérialiseur, parseur et lecteurs par section. Le
MIDI sépare validation, lecture/écriture SMF, analyse, avertissements, collisions
et construction de projet. Ces pipelines n’ont pas été restructurés dans le
chantier de navigabilité actuel.

```text
Save  : ProjectDocument + NativeEditorState → JSON validé → Blob
Load  : File → JSON inconnu → parse borné → projet + workspace
MIDI  : File ↔ codec SMF ↔ analyse/projection neutre ↔ projet
```

## Exceptions au seuil de 500 lignes

Le seuil déclenche une revue, pas un échec de CI. Les exceptions restantes ont
une responsabilité unique documentée dans leur guide local : façades scheduler
et moteur audio, données de palette, composition du workspace, résolution de
collisions et parseurs MIDI/natif. Le contrôle structurel affiche la liste
courante à chaque vérification.

## Vérification

`npm run verify` exécute documentation, structure, frontières, TypeScript,
build et les 103 tests. Les règles structurelles sont dans
`scripts/check-structure.mjs`; les frontières techniques restent dans
`scripts/check-import-boundaries.mjs`.

La documentation de référence est indexée dans [`README.md`](README.md).
