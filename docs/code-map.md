# Carte du code

Cette carte répond à « je veux modifier X ». Chaque entrée donne le point de
départ visible, le propriétaire d’état et les témoins actuels.

## Capacités

| Capacité | Point d’entrée | Propriétaire d’état | Tests |
| --- | --- | --- | --- |
| composition | `src/bootstrap/App.tsx` puis `src/presentation/home/ApplicationHome.tsx` ou `src/presentation/piano-roll/PianoRollWorkspace.tsx` ; DOM dans `PianoRollWorkspaceLayout.tsx` | accueil sans runtime ou une session `EditorRuntime` active | test de layout colocalisé, smoke de rendu et `tests/integration/critical-behavior.test.ts` |
| piano roll | `src/presentation/piano-roll/PianoRollLayers.tsx` | agrégat `src/application/editor-session/editor-runtime.ts`, mécanismes purs sous `src/editor-core/` | `tests/integration/editor-controller-contracts.test.ts` et suite centrale |
| sélection | `src/presentation/piano-roll/usePianoRollSelectionWorkflow.ts` | `EditorSelection` et presse-papier UI | suite centrale de régression |
| instruments | `src/presentation/inspector/instruments/ProjectInstrumentControls.tsx` | `ProjectDocument`, brouillon du dialogue et paramètres transitoires du worklet | tests AudioWorklet et suite centrale |
| clips et groupes | `src/presentation/inspector/clips/ClipInspector.tsx` | `ProjectDocument.clipHierarchy`, `ActiveClipSelection.activeClipId` et identité transitoire du clip joué | tests de hiérarchie, commandes et suite centrale de régression |
| projections temporelles | gestes dans `PianoRollTimeMapOverlay.tsx`, `PianoRollLoopOverlay.tsx` et `piano-roll-gesture-strategy.ts` | état publié dans `ProjectStore`, projections dans `TimeMapMarkerPreviewSession` / `LoopPreviewSession`, état effectif dans les consommateurs et le worklet | tests des sessions, projections, sélection mixte et AudioWorklet |
| transport | `src/presentation/transport/TransportControls.tsx` puis `usePianoRollTransportViewport.ts` | `TimeMap` et boucle publiées du clip, enchaînement global et auto-scroll du document ; timeline/transport publiés et surcharges effectives dans le worklet | politiques transport/viewport, tests AudioWorklet et suite centrale |
| persistance locale | `src/application/ports/project-repository.ts` puis `src/infrastructure/persistence/` | `StoredProject`, rapport transitoire, générations et quarantaine de `ProjectRepository` ; réglages dans `UserSettingsRepository` | `src/infrastructure/persistence/__tests__/project-repository-contract.test.ts` et `indexed-db-reset.test.ts` |
| fichiers `.pianola` | `src/infrastructure/project-files/pianola/pianola-project-codec.ts` puis `migrations/migrate-portable-project.ts` | document + `PersistedEditorWorkspace`, avec rapport de migration transitoire | `src/infrastructure/persistence/__tests__/persistence-codecs.test.ts` |
| MIDI | `src/presentation/project-files/usePianoRollProjectLifecycle.ts` puis `useMidiFileWorkflow.ts` | analyse transitoire puis nouveau projet | `tests/integration/midi-regression.test.mjs` |
| styles | `src/presentation/styles/index.css` | fichier CSS de la surface | build Vite et vérification humaine |

La « suite centrale » désigne
`tests/integration/audio-domain-regression.test.mjs`. Ses scénarios globaux
restent le garde-fou de parité des flux transversaux.

## Besoin → fichier de départ

| Besoin | Commencer ici | Continuer vers |
| --- | --- | --- |
| modifier le bouton Lecture | `src/presentation/transport/TransportControls.tsx` | `useAudioPlayback.ts`, puis `audio-worklet-transport.ts` |
| modifier le ruler ou la boucle | `src/presentation/piano-roll/PianoRollTimeline.tsx` | `PianoRollLoopOverlay.tsx`, `application/editor-session/loop-preview-session.ts`, puis painter et transport audio |
| modifier les marqueurs tempo/métrique/gamme/section | `src/presentation/piano-roll/PianoRollTimeMapOverlay.tsx` | `useTimeMapMarkerGesture.ts`, `application/editor-session/time-map-marker-preview-session.ts`, puis projection et plans sous `application/piano-roll/timeline/` |
| modifier la projection audio du tempo ou de la boucle | `src/presentation/transport/useAudioPlayback.ts` | `audio-worklet-transport.ts`, protocole puis `worklet-timeline-engine.ts` |
| modifier le playhead | `src/editor-core/model/playhead-position.ts` | signal global `playheadPosition`, puis `useAudioPlayback.ts` et `PianoRollTimeline.tsx` |
| modifier Undo/Redo ou les transactions | `src/application/history/editor-command-service.ts` | `project-store.ts`, puis reducers sous `src/domain/commands/` |
| modifier l’indicateur de lecture des clips | `src/presentation/inspector/clips/clip-playhead-visual.ts` | `src/presentation/inspector/clips/ClipInspector.tsx`, puis `src/presentation/styles/inspector.css` |
| modifier la concaténation d’un groupe | `src/presentation/inspector/clips/useClipGroupConcatenation.ts` | `src/domain/clips/concatenate-clips.ts`, puis `src/domain/commands/clip-concatenation-commands.ts` |
| modifier la découpe d’un clip | `src/presentation/dialogs/ClipSplitDialog.tsx` | `src/presentation/inspector/clips/useClipSplitting.ts`, `src/domain/clips/split-clip.ts`, puis `SplitClipIntoGroupCommand` |
| modifier la duplication d’un groupe | `src/presentation/inspector/clips/useClipGroupDuplication.ts` | `src/domain/clips/duplicate-clip.ts`, puis transaction de commandes hiérarchiques |
| modifier zoom/scroll | `src/presentation/piano-roll/viewport/PianoRollViewportControls.tsx` | `ViewportNavigationControls.tsx`, `usePianoRollTransportViewport.ts`, `useViewportControls.ts`, puis contrôleur viewport |
| modifier un geste de note | `src/presentation/piano-roll/interactions/piano-roll-gesture-strategy.ts` | noyau interactions puis cas d’usage notes |
| modifier Copy/Cut/Paste | `src/presentation/piano-roll/usePianoRollSelectionWorkflow.ts` | clipboard et plans de sélection |
| modifier le menu radial ou le bouton du stylet | `src/presentation/radial-menu/piano-roll-radial-command-model.ts` | `usePianoRollRadialMenuCommands.ts`, `useDocumentRadialMenu.ts`, puis `piano-roll/interactions/useStylusAction.ts` |
| modifier les collisions | `src/presentation/piano-roll/interactions/useNoteCollisionDialogWorkflow.ts` | `src/domain/note-collision.ts` |
| modifier l’inspecteur | `src/presentation/inspector/ProjectInspector.tsx` | sous-capacité clips ou instruments |
| ajouter un champ instrument | `src/domain/instruments/instrument.ts` | validation, commandes et codec portable/local |
| modifier le master bus | `src/presentation/transport/MasterGainControl.tsx` | `src/domain/master-bus.ts` et transport workflow |
| modifier le tempo ou la métrique | `src/domain/transport/time-map.ts` | `meter-marker-operations.ts`, `point-marker-operations.ts`, commandes de transport, validation et painters ruler/grid |
| modifier `.pianola` | `src/infrastructure/project-files/pianola/pianola-project-codec.ts` | pipeline `pianola/migrations/`, workspace codec, parseur de document puis `presentation/project-files/useProjectMigrationDialog.tsx` pour un futur rapport |
| modifier autosave ou récupération | `src/presentation/project-files/usePianoRollProjectLifecycle.ts` | `src/application/persistence/project-autosave.ts`, projection sous `src/application/editor-session/workspace-persistence.ts`, ports, migrations de codec puis repository IndexedDB/Worker |
| modifier le MIDI | `src/infrastructure/project-files/midi/standard-midi-file.ts` | reader/writer et analyse |
| modifier les couleurs | `src/presentation/styles/application-colors.ts` | tokens CSS et styles de surface |
| modifier le responsive | `src/presentation/styles/responsive.css` | styles propriétaires des surfaces impliquées |

## Flux : geste de note

```text
PianoRollLayers
  → usePianoRollEvents
  → useInteractionManager
  → piano-roll-gesture-strategy
  → PianoRollInteractionSession
  → note-gesture-workflow-adapter
  → application/piano-roll/notes/note-gesture-workflow
  → EditorCommandPort
  → transaction du ProjectStore
```

Le contrôleur visuel DOM dessine uniquement l’état transitoire. Le document est
muté à la validation du geste. Les notes conservent leur draft géométrique dans
la session d’interaction ; si la sélection contient aussi des marqueurs, la
stratégie publie parallèlement une `TimeMap` projetée et l’utilise pour le snap
des ghosts comme pour la proposition finalement transmise au workflow.
La reconnaissance du double-tap, la géométrie des poignées de resize et
l'application du lasso ou du mode de sélection des marqueurs appartiennent à
`src/editor-core/`. La stratégie de présentation leur fournit les coordonnées
locales et conserve uniquement la mesure du DOM, le rendu transitoire et le
déclenchement des intentions applicatives.

## Flux : projection temporelle

```text
ProjectStore (TimeMap / boucle publiées)
  → TimeMapMarkerPreviewSession / LoopPreviewSession
  → snapshot éditorial effectif pour ruler, grille, notes, clavier et snap
  → useAudioPlayback
  → messages tempo-map-preview / loop-preview
  → WorkletTimelineEngine (publié + surcharge = effectif)
```

Les sessions de projection sont liées au clip, à la révision source et à un
jeton de geste. Elles ne sont ni persistées ni historisées. Les deux canaux
audio restent indépendants : annuler une boucle ne retire pas un tempo projeté,
et inversement.

## Flux : transport

```text
TransportControls
  → usePianoRollTransportViewport
  → useAudioPlayback
  → compilePlaybackPlan
  → createTransferableAudioWorkletTimeline
  → AudioWorkletTransport / MessagePort
  → WorkletTimelineEngine
  → SubtractiveWorkletVoice
```

Le statut et les voix ne sont ni persistés ni annulables. Le worklet avance
l’horloge à chaque échantillon ; l’UI ne planifie aucune occurrence. Il conserve
les snapshots publiés séparément des surcharges effectives de tempo et boucle.

## Flux : persistance et fichier portable

```text
ProjectStore / signaux workspace
  → ProjectAutosave
  → WorkerStoredProjectCodec
  → IndexedDbProjectRepository
  → génération + résumé publiés atomiquement

Ouverture courante : génération v1 → validation stricte
Future ouverture historique : version → migrations pures → validation courante
Échec complet : diagnostics par génération → archive brute + rapport texte

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
  → usePianoRollProjectState / useProjectStoreSelector
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
| shell/workspace | `src/presentation/styles/shell.css` |
| entrées de type range | `src/presentation/styles/range-input.css` |
| en-tête | `src/presentation/styles/editor-header.css` |
| contexte de l'en-tête | `src/presentation/styles/editor-context-panel.css` |
| toolbar | `src/presentation/styles/editor-toolbar.css` |
| transport | `src/presentation/styles/transport.css` |
| fichiers | `src/presentation/styles/project-files.css` |
| piano roll | `src/presentation/styles/piano-roll.css` |
| contrôles du viewport | `src/presentation/styles/piano-roll-viewport-controls.css` |
| menu radial flottant | `src/presentation/styles/radial-menu.css` |
| inspecteur | `src/presentation/styles/inspector.css` |
| dialogues | `src/presentation/styles/dialogs.css` |
| coordination multi-surface | `src/presentation/styles/responsive.css` |

## Modules volumineux

- `src/presentation/piano-roll/PianoRollWorkspace.tsx` reste un coordinateur de surface ;
  le DOM, les protocoles complets et les abonnements sont extraits chez leurs
  propriétaires.
- `src/presentation/styles/application-colors.ts` est une table de données de thème sans
  protocole concurrent.
- `src/domain/note-collision.ts` possède l’algorithme cohérent de résolution ;
  son orchestration de dialogue est ailleurs.
- `src/infrastructure/project-files/midi/smf-reader.ts` et
  `src/infrastructure/project-files/pianola/parsing/parse-instruments.ts` regroupent chacun un
  parseur cohérent dont les sous-étapes restent internes au propriétaire.

Le contrôle `npm run check:structure` signale tous les modules dépassant 500
lignes et interdit le retour des chemins retirés.
lignes et interdit le retour des chemins retirés.
