# Carte du code

> **État courant.** Les chemins de cette carte doivent rester synchronisés avec
> le worktree à la fin de chaque lot. Pour une tâche de migration, consulter
> d'abord [`migration/README.md`](migration/README.md) et
> `migration/STATUS.md` ; la carte ne définit pas la cible.

Cette carte répond à « je veux modifier X ». Chaque entrée donne le point de
départ visible, le propriétaire d’état et les témoins actuels.

## Capacités

| Capacité | Point d’entrée | Propriétaire d’état | Tests |
| --- | --- | --- | --- |
| composition | `src/app/App.tsx` puis `src/ui/home/ApplicationHome.tsx` ou `src/ui/piano-roll/PianoRollWorkspace.tsx` | accueil sans runtime ou une session `EditorRuntime` active | `tests/integration/critical-behavior.test.ts` |
| piano roll | `src/ui/piano-roll/PianoRollLayers.tsx` | agrégat `src/application/editor-session/editor-runtime.ts`, mécanismes purs sous `src/editor/` | `tests/integration/editor-controller-contracts.test.ts` et suite centrale |
| sélection | `src/ui/piano-roll/usePianoRollSelectionWorkflow.ts` | `EditorSelection` et presse-papier UI | suite centrale de régression |
| instruments | `src/ui/inspector/instruments/ProjectInstrumentControls.tsx` | `ProjectDocument`, brouillon du dialogue et paramètres transitoires du worklet | tests AudioWorklet et suite centrale |
| clips et groupes | `src/ui/inspector/clips/ClipInspector.tsx` | `ProjectDocument.clipHierarchy`, `ActiveClipSelection.activeClipId` et identité transitoire du clip joué | tests de hiérarchie, commandes et suite centrale de régression |
| transport | `src/ui/transport/TransportControls.tsx` | `TimeMap` et boucle du clip, enchaînement global et auto-scroll du document, worklet pour statut et horloge audio | tests AudioWorklet et suite centrale |
| persistance locale | `src/application/ports/project-repository.ts` puis `src/infrastructure/persistence/` | `StoredProject`, `ProjectRepository` et `UserSettingsRepository` | `src/infrastructure/persistence/__tests__/project-repository-contract.test.ts` |
| fichiers `.pianola` | `src/infrastructure/project-files/pianola/pianola-project-codec.ts` | document + `PersistedEditorWorkspace` | `src/infrastructure/persistence/__tests__/persistence-codecs.test.ts` |
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
| modifier les marqueurs tempo/métrique/gamme/section | `src/ui/piano-roll/PianoRollTimeMapOverlay.tsx` | `useTimeMapMarkerGesture.ts`, puis `use-cases/piano-roll/timeline/time-map-marker-plans.ts` |
| modifier le playhead | `src/editor/model/playhead-position.ts` | signal global `playheadPosition`, puis `useAudioPlayback.ts` et `PianoRollTimeline.tsx` |
| modifier Undo/Redo ou les transactions | `src/application/history/editor-command-service.ts` | `project-store.ts`, puis reducers sous `src/domain/commands/` |
| modifier l’indicateur de lecture des clips | `src/ui/inspector/clips/clip-playhead-visual.ts` | `src/ui/inspector/clips/ClipInspector.tsx`, puis `src/styles/inspector.css` |
| modifier la concaténation d’un groupe | `src/ui/inspector/clips/useClipGroupConcatenation.ts` | `src/domain/clips/concatenate-clips.ts`, puis `src/domain/commands/clip-commands.ts` |
| modifier la découpe d’un clip | `src/ui/dialogs/ClipSplitDialog.tsx` | `src/ui/inspector/clips/useClipSplitting.ts`, `src/domain/clips/split-clip.ts`, puis `SplitClipIntoGroupCommand` |
| modifier la duplication d’un groupe | `src/ui/inspector/clips/useClipGroupDuplication.ts` | `src/domain/clips/duplicate-clip.ts`, puis transaction de commandes hiérarchiques |
| modifier zoom/scroll | `src/ui/editor-toolbar/PianoRollViewportControls.tsx` | `useViewportControls.ts`, puis contrôleur viewport |
| modifier un geste de note | `src/ui/piano-roll/interactions/piano-roll-gesture-strategy.ts` | noyau interactions puis cas d’usage notes |
| modifier Copy/Cut/Paste | `src/ui/piano-roll/usePianoRollSelectionWorkflow.ts` | clipboard et plans de sélection |
| modifier le menu radial ou le bouton du stylet | `src/ui/piano-roll/context-menu/` | `InteractionOverlay.tsx`, puis `interactions/useStylusAction.ts` |
| modifier les collisions | `src/ui/piano-roll/interactions/useNoteCollisionDialogWorkflow.ts` | `src/domain/note-collision.ts` |
| modifier l’inspecteur | `src/ui/inspector/ProjectInspector.tsx` | sous-capacité clips ou instruments |
| ajouter un champ instrument | `src/domain/instruments/instrument.ts` | validation, commandes et codec portable/local |
| modifier le master bus | `src/ui/transport/MasterGainControl.tsx` | `src/domain/master-bus.ts` et transport workflow |
| modifier le tempo ou la métrique | `src/domain/transport/time-map.ts` | commandes de transport, validation et painters ruler/grid |
| modifier `.pianola` | `src/infrastructure/project-files/pianola/pianola-project-codec.ts` | workspace codec et parseur de document |
| modifier autosave ou récupération | `src/use-cases/persistence/project-autosave.ts` | projection sous `src/application/editor-session/workspace-persistence.ts`, ports sous `src/application/ports/`, puis repository IndexedDB et Worker sous `src/infrastructure/persistence/` |
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

## Flux : persistance et fichier portable

```text
ProjectStore / signaux workspace
  → ProjectAutosave
  → WorkerStoredProjectCodec
  → IndexedDbProjectRepository
  → génération + résumé publiés atomiquement

Export : useProjectFileWorkflow → portable-project-codec → Blob
Import : ApplicationHome → portable-project-codec → nouvelle entrée locale
```

Le même contrat est exécuté contre les repositories mémoire et IndexedDB dans
`src/infrastructure/persistence/__tests__/project-repository-contract.test.ts`.

## Flux : MIDI

```text
ProjectMenu
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
  → clear interaction
  → ProjectStore.selectClip
  → usePianoRollProjectState
  → restauration des signaux du clip actif
```

Cette navigation ne consomme pas Undo/Redo et ne modifie pas le clip joué.
Le bouton Play d’une carte passe directement par `useAudioPlayback`; à la fin,
`clipHierarchy` est la source de vérité pour l’organisation des clips ; son
parcours en profondeur détermine la prochaine carte non bypassée et sans ancêtre
de groupe bypassé, sauf si la
boucle ou l’arrêt en fin du clip courant est actif. Le lancement direct d’une
carte ignore son propre bypass et peut donc amorcer la suite. Si elle se trouve
dans un groupe bypassé, la suite reprend après ce groupe.

## Styles propriétaires

| Surface | Fichier |
| --- | --- |
| shell/workspace | `src/styles/shell.css` |
| en-tête | `src/styles/application-header.css` |
| toolbar | `src/styles/editor-toolbar.css` |
| transport | `src/styles/transport.css` |
| fichiers | `src/styles/project-files.css` |
| piano roll | `src/styles/piano-roll.css` |
| menu radial flottant | `src/styles/radial-menu.css` |
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
  `src/infrastructure/project-files/pianola/parsing/parse-instruments.ts` regroupent chacun un
  parseur cohérent dont les sous-étapes restent internes au propriétaire.

Le contrôle `npm run check:structure` signale tous les modules dépassant 500
lignes et interdit le retour des chemins retirés.
