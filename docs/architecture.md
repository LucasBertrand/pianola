# Architecture de Pianola

Ce document décrit les frontières et les principaux pipelines. Pour chercher un
comportement précis, partir de la [carte du code](code-map.md). Pour décider si
un état doit persister ou entrer dans Undo/Redo, consulter
[`state-ownership.md`](state-ownership.md).

Dernière revue complète : 16 août 2026.

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
| `src/domain/transport/transport.ts` | horloge (PPQN) et boucle |
| `src/domain/transport/time-map.ts` | marqueurs de tempo et de métrique par clip, navigation en mesures |
| `src/domain/master-bus.ts` | gain, mute et accordage master |
| `src/domain/project/project-document.ts` | document, workspace et accès clip |

La `TimeMap` d’un clip est l’unique source de vérité temporelle. Notes,
marqueurs de tempo et marqueurs de gamme sont ancrés à leurs ticks absolus.
Les marqueurs de métrique sont structurels : chacun doit commencer une mesure
complète. Une modification en amont conserve son tick s’il reste valide,
sinon elle le projette vers la première frontière valide suivante, sans jamais
le reculer. La fin du clip suit la même règle et peut donc s’allonger.

L’ajout et la suppression de mesures sont, eux, des insertions et suppressions
littérales de temps : le contenu situé à droite est décalé de la durée exacte
ajoutée ou retirée. Mesures, positions musicales et conversions tick↔seconde
sont dérivées de la `TimeMap` ; aucun nombre de mesures ni tempo « courant »
n’est persisté.

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
  → compilePlaybackPlan
  → PlaybackSnapshot
  → createTransferableAudioWorkletTimeline (données audio minimales)
  → AudioWorkletTransport (cycle de vie navigateur et commandes)
  → MessagePort
  → WorkletTimelineEngine (horloge, boucles, occurrences et polyphonie)
  → SubtractiveWorkletVoice (oscillateur, enveloppes et filtre par échantillon)
```

Le worklet possède le transport et déclenche les occurrences depuis le nombre
d’échantillons réellement rendus. Le thread principal ne possède aucun timer
audio et n’envoie aucun événement par note. Une charge React ou Canvas peut
retarder l’affichage du playhead, jamais la lecture.

Le dialogue d’instrument reste propriétaire de son brouillon. Chaque réglage
est envoyé au worklet comme un message léger ; les paramètres continus des voix
actives sont lissés et les paramètres structurels s’appliquent aux voix
suivantes. Aucune note n’est recompilée pendant cette interaction. Annuler retire
le paramètre transitoire ; confirmer publie une unique transaction dans
`ProjectStore`.

La façade publique est `src/audio/audio-worklet-transport.ts`. Le protocole et
le DSP sont sous `src/audio/worklet/`. L’adaptateur navigateur peut être remplacé
sans modifier le moteur temps réel pur.

## Persistance et fichiers projet

Le domaine ne connaît aucune API navigateur. `ProjectAutosave` reçoit les ports
injectés, le Web Worker sérialise et valide les snapshots, puis le repository
IndexedDB publie atomiquement génération et résumé. Le format portable reste un
pipeline distinct du stockage local. Le MIDI sépare validation, lecture/écriture
SMF, analyse, avertissements, collisions et construction de projet.

```text
Autosave : document + workspace → Worker → deux générations IndexedDB
Export   : document + workspace → JSON portable validé → Blob
Import   : File → JSON inconnu → parse borné → nouvelle entrée locale
Settings : mise à jour atomique → document IndexedDB séparé
MIDI     : File ↔ codec SMF ↔ analyse/projection neutre ↔ projet
```

## Exceptions au seuil de 500 lignes

Le seuil déclenche une revue, pas un échec de CI. Les exceptions restantes ont
une responsabilité unique documentée dans leur guide local : données de
palette, composition du workspace, résolution de
collisions et parseurs MIDI/natif. Le contrôle structurel affiche la liste
courante à chaque vérification.

## Vérification

`npm run verify` exécute documentation, structure, frontières, TypeScript,
build, smoke test du module worklet produit et la suite de tests. Les règles
structurelles sont dans
`scripts/check-structure.mjs`; les frontières techniques restent dans
`scripts/check-import-boundaries.mjs`.

La documentation de référence est indexée dans [`README.md`](README.md).
