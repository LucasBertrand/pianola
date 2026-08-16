# Carte du code

Cette carte répond à « je veux modifier X ». Chaque entrée donne le point de
départ visible, le propriétaire d’état et les témoins actuels.

## Capacités

| Capacité | Point d’entrée | Propriétaire d’état | Tests |
| --- | --- | --- | --- |
| composition | `src/app/App.tsx` puis `src/ui/piano-roll/PianoRollWorkspace.tsx` | `EditorRuntime` et hooks de capacité | `tests/integration/critical-behavior.test.ts` |
| piano roll | `src/ui/piano-roll/PianoRollLayers.tsx` | `src/editor/runtime/editor-runtime.ts` | `tests/integration/editor-controller-contracts.test.ts` et suite centrale |
| sélection | `src/ui/piano-roll/usePianoRollSelectionWorkflow.ts` | `EditorSelection` et presse-papier UI | suite centrale de régression |
| instruments | `src/ui/inspector/instruments/ProjectInstrumentControls.tsx` | `ProjectDocument`, brouillon du dialogue et paramètres transitoires du worklet | tests AudioWorklet et suite centrale |
| clips | `src/ui/inspector/clips/ClipInspector.tsx` | clips du document et `WorkspaceState.activeClipId` | suite centrale de régression |
| transport | `src/ui/transport/TransportControls.tsx` | `TimeMap` du clip pour tempo/métrique, document pour boucle, worklet pour statut et horloge audio | tests AudioWorklet et suite centrale |
| fichiers natifs | `src/ui/project-files/useProjectFileWorkflow.ts` | document + état natif d’éditeur | tests sous `src/project-io/native/__tests__/` |
| MIDI | `src/ui/project-files/useMidiFileWorkflow.ts` | analyse transitoire puis nouveau projet | `tests/integration/midi-regression.test.mjs` |
| styles | `src/styles.css` | fichier CSS de la surface | build Vite et vérification humaine |

La « suite centrale » désigne
`tests/integration/audio-domain-regression.test.mjs`. Ses scénarios globaux
restent le garde-fou de parité des flux transversaux.

## Besoin → fichier de départ

| Besoin | Commencer ici | Continuer vers |
| --- | --- | --- |
| modifier le bouton Lecture | `src/ui/transport/TransportControls.tsx` | `useAudioPlayback.ts`, puis `audio-worklet-transport.ts` |
| modifier le ruler ou la boucle | `src/ui/piano-roll/PianoRollTimeline.tsx` | `PianoRollLoopOverlay.tsx` et painter |
| modifier les marqueurs tempo/métrique | `src/ui/piano-roll/PianoRollTimeMapOverlay.tsx` | `useTimeMapMarkerGesture.ts`, puis `use-cases/piano-roll/timeline/time-map-marker-plans.ts` |
| modifier le playhead | `src/ui/piano-roll/PianoRollTimeline.tsx` | signal `playheadTick` du runtime |
| modifier zoom/scroll | `src/ui/editor-toolbar/PianoRollViewportControls.tsx` | `useViewportControls.ts`, puis contrôleur viewport |
| modifier un geste de note | `src/ui/piano-roll/interactions/piano-roll-gesture-strategy.ts` | noyau interactions puis cas d’usage notes |
| modifier Copy/Cut/Paste | `src/ui/piano-roll/usePianoRollSelectionWorkflow.ts` | clipboard et plans de sélection |
| modifier les collisions | `src/ui/piano-roll/interactions/useNoteCollisionDialogWorkflow.ts` | `src/domain/note-collision.ts` |
| modifier l’inspecteur | `src/ui/inspector/ProjectInspector.tsx` | sous-capacité clips ou instruments |
| ajouter un champ instrument | `src/domain/instruments/instrument.ts` | validation, commandes et format natif |
| modifier le master bus | `src/ui/transport/MasterGainControl.tsx` | `src/domain/master-bus.ts` et transport workflow |
| modifier le tempo ou la métrique | `src/domain/transport/time-map.ts` | commandes de transport, validation et painters ruler/grid |
| modifier `.pianola` | `src/project-io/native/parse-native-project.ts` | schéma, parsing et sérialiseur |
| modifier le MIDI | `src/project-io/midi/standard-midi-file.ts` | reader/writer et analyse |
| modifier les couleurs | `src/config/application-colors.ts` | tokens CSS et styles de surface |
| modifier le responsive | `src/styles/responsive.css` | styles propriétaires des surfaces impliquées |

## Flux : geste de note

```text
PianoRollLayers
  → usePianoRollEvents
  → useInteractionManager
  → piano-roll-gesture-strategy
  → PianoRollInteractionSession
  → note-gesture-workflow-adapter
  → use-cases/piano-roll/notes/note-gesture-workflow
  → EditorCommandPort
  → transaction du ProjectStore
```

Le contrôleur visuel DOM dessine uniquement l’état transitoire. Le document est
muté à la validation du geste.

## Flux : transport

```text
TransportControls
  → useAudioPlayback
  → compilePlaybackPlan
  → createTransferableAudioWorkletTimeline
  → AudioWorkletTransport / MessagePort
  → WorkletTimelineEngine
  → SubtractiveWorkletVoice
```

Le statut et les voix ne sont ni persistés ni annulables. Le worklet avance
l’horloge à chaque échantillon ; l’UI ne planifie aucune occurrence.

## Flux : fichier natif

```text
ProjectFileMenu
  → useProjectFileWorkflow
  → serialize-native-project / parse-native-project
  → parsing par section
  → remplacement du projet et restauration du workspace
```

Les tests de contrat sont
`src/project-io/native/__tests__/parse-native-project.test.ts` et
`src/project-io/native/__tests__/serialize-native-project.test.ts`.

## Flux : MIDI

```text
ProjectFileMenu
  → useMidiFileWorkflow
  → smf-reader
  → analyze-midi-import
  → dialogue d’avertissements/collisions
  → create-project-from-midi-import
  → remplacement du projet
```

L’export suit `midi-export-plan` puis `midi-exporter` et `smf-writer`.

## Flux : instrument

```text
ProjectInstrumentControls
  → useInstrumentDialogWorkflow (brouillon)
  → InstrumentPresetDialog
  → message instrument-preview → WorkletTimelineEngine (retour immédiat)
  → useProjectInstrumentWorkflow
  → commandes instrument
  → ProjectStore
  → PlaybackSnapshot et styles dérivés
```

Le brouillon et sa projection audio ne sont pas persistants et ne recompilent
pas les notes. La prévisualisation est retirée à l’annulation ; la confirmation
produit une seule transaction.

## Flux : changement de clip

```text
ClipInspector
  → useClipWorkflow
  → arrêt lecture + clear interaction
  → ProjectStore.selectClip
  → usePianoRollProjectState
  → restauration des signaux du clip actif
```

Cette navigation ne consomme pas Undo/Redo.

## Styles propriétaires

| Surface | Fichier |
| --- | --- |
| shell/workspace | `src/styles/shell.css` |
| en-tête | `src/styles/application-header.css` |
| toolbar | `src/styles/editor-toolbar.css` |
| transport | `src/styles/transport.css` |
| fichiers | `src/styles/project-files.css` |
| piano roll | `src/styles/piano-roll.css` |
| inspecteur | `src/styles/inspector.css` |
| dialogues | `src/styles/dialogs.css` |
| coordination multi-surface | `src/styles/responsive.css` |

## Modules volumineux

- `src/ui/piano-roll/PianoRollWorkspace.tsx` reste une composition de surface ;
  les protocoles complets en sont extraits.
- `src/config/application-colors.ts` est une table de données de thème sans
  protocole concurrent.
- `src/domain/note-collision.ts` possède l’algorithme cohérent de résolution ;
  son orchestration de dialogue est ailleurs.
- `src/project-io/midi/smf-reader.ts` et
  `src/project-io/native/parsing/parse-instruments.ts` regroupent chacun un
  parseur cohérent dont les sous-étapes restent internes au propriétaire.

Le contrôle `npm run check:structure` signale tous les modules dépassant 500
lignes et interdit le retour des chemins retirés.
