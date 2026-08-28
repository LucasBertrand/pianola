# Inventaire de l'historisation et des états d'éditeur

Ce document prépare le lot 1 sans anticiper son implémentation. Il décrit le
code courant, puis classe ses données vers `EditorSessionState`,
`ActiveClipSelection`, `PersistedEditorWorkspace` et
`PersistedClipEditorState`.

## Frontière actuelle de l'historique

`ProjectStore` empile des snapshots de `ProjectDocument`. Avant l'empilement,
il retire explicitement la propriété `workspace` de `ProjectState`. La frontière
fonctionnelle est donc :

```text
ProjectState courant
├── ProjectDocument          historisé et persisté
└── WorkspaceState           non historisé
```

Une transaction métier validée produit au plus une entrée. La pile conserve au
maximum `PROJECT_CONSTANTS.maximumHistoryEntries`, soit actuellement 200
snapshots. Une nouvelle transaction vide la pile Redo ; un simple changement de
clip actif ne la vide pas.

La propriété `revision` demande une précision : elle figure dans
`ProjectDocument`, mais Undo et Redo ne restaurent pas sa valeur historique.
Chaque opération lui affecte la révision courante plus un. `schemaVersion` et
`clock` figurent aussi dans les snapshots, bien qu'aucune commande courante ne
les modifie.

Sources principales :

- [`project-document.ts`](../../src/domain/project/project-document.ts) ;
- [`project-store.ts`](../../src/application/history/project-store.ts) ;
- [`editor-command-service.ts`](../../src/application/history/editor-command-service.ts).

## Contenu du `ProjectDocument` historisé

### Projet

| Donnée | Champs couverts |
| --- | --- |
| métadonnées | `schemaVersion`, `revision`, `title` |
| horloge | `clock.ppqn`, `clock.launchGridTicks` |
| instruments | `projectInstrumentsById`, `instrumentOrder` |
| presets | `instrumentPresetsById`, `instrumentPresetOrder` |
| clips | `clipsById` et tout le contenu de chaque clip |
| organisation | `clipHierarchy`, y compris groupes, ordre, couleurs et bypass |
| lecture globale | `autoAdvanceEnabled`, `autoScrollEnabled` |
| bus master | `gain`, `muted`, `tuningFrequencyHz` |

L'ordre de lecture des clips est dérivé de `clipHierarchy` : il est restauré par
l'historique, mais n'est pas stocké dans un second champ.

### Clips, timelines et notes

Chaque clip historise :

- `id`, `name`, `color` et `bypassEnabled` ;
- `timeline.durationTicks` ;
- les marqueurs métriques avec `startTick`, `numerator`, `denominator` et
  `beatGroups` ;
- les marqueurs de tempo avec `startTick` et `bpm` ;
- les `ScaleMarker` avec `startTick`, `rootNote`, `patternType` et `patternId` ;
- les marqueurs de section avec `startTick` et `comment` ;
- `tracksByInstrumentId`, avec `instrumentId` et `notesById` pour chaque piste ;
- chaque note avec `id`, `instrumentId`, `pitch`, `startTick`, `durationTicks`,
  `velocity`, `muted` et `locked` ;
- `transportSettings.loop.startTick`, `transportSettings.loop.endTick` et
  `transportSettings.loopEnabled`.

### Instruments, presets et mixage

Chaque instrument projet historise :

- `id`, `name`, `color`, `gain`, `muted`, `solo` et `pan` ;
- la configuration du synthé : forme d'onde, polyphonie, detune, phase libre,
  pulse width, enveloppes ADSR, cutoff, résonance, key tracking et enveloppe de
  filtre ;
- les effets avec `id`, `kind`, `enabled` et `parameters` ;
- les règles génératives avec `id`, `kind`, `enabled` et `parameters` ;
- l'interprétation avec `transposeSemitones`, `timingOffsetTicks`, `gateRatio`,
  `velocityScale` et `probability`.

Chaque preset historise `id`, `name`, `kind` et la configuration complète du
synthé. Le bus master historise son gain, son mute et sa fréquence d'accordage.

## Checkpoints transitoires associés à Undo/Redo

`EditorCommandService` maintient en parallèle de la pile documentaire un
checkpoint `before` et `after` pour la sélection concernée par chaque
transaction :

```ts
interface EditorSelectionHistoryTarget {
  readonly clipId: ClipId;
  readonly noteIds: readonly NoteId[];
  readonly markerGroups?: readonly {
    readonly startTick: Tick;
    readonly kinds: readonly ("tempo" | "scale" | "section")[];
  }[];
}
```

Ces valeurs rendent la sélection cohérente après Undo ou Redo, mais elles :

- ne font pas partie du document musical ;
- ne sont jamais sérialisées ;
- sont effacées au remplacement complet du projet ;
- ne restaurent la sélection que si leur `clipId` correspond encore au clip
  actif.

Elles ne vont dans aucun des quatre états renommés. Leur propriétaire cible est
le service applicatif d'historique sous `application/history`.

## Classement vers les types du lot 1

### `EditorSessionState`

Ce type remplace `ProjectState`. Il représente le document ouvert accompagné de
l'état minimal de session :

```text
EditorSessionState
├── ProjectDocument
└── ActiveClipSelection
```

Le type de session peut agréger ces éléments, mais la pile Undo/Redo doit
continuer à extraire uniquement `ProjectDocument`. Utiliser
`EditorSessionState` entier comme entrée d'historique ferait entrer la
navigation entre clips dans Undo/Redo et constituerait une régression.

### `ActiveClipSelection`

Ce type remplace `WorkspaceState` et contient uniquement :

```ts
interface ActiveClipSelection {
  readonly activeClipId: ClipId;
}
```

Le clip actif reste stable pendant une transaction, un Undo ou un Redo tant
qu'il existe encore. Si le document restauré ne contient plus ce clip,
`ProjectStore` choisit le premier clip de l'ordre de lecture comme repli.

### `PersistedEditorWorkspace`

Ce type remplace `ProjectWorkspaceState` :

```ts
interface PersistedEditorWorkspace {
  readonly activeClipId: ClipId;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly clipStatesById: Readonly<
    Record<ClipId, PersistedClipEditorState>
  >;
}
```

Il est sauvegardé atomiquement avec le document et exporté dans une section
distincte du `.pianola`, mais n'entre jamais dans Undo/Redo.

`activeClipId` apparaît à la fois dans la session et dans sa projection
persistée. La valeur canonique pendant l'exécution reste
`ActiveClipSelection.activeClipId` ; `PersistedEditorWorkspace.activeClipId`
n'est que la valeur sérialisée puis utilisée à la réouverture.

### `PersistedClipEditorState`

Ce type remplace `ProjectClipWorkspaceState`. Pour chaque clip, il contient :

- `pitchSnapSettings` : `enabled`, `visualGuideEnabled`, `rootNote`,
  `patternType` et `patternId` ;
- `gridSettings` : `baseResolutionTicks`, `subdivision` et `resolutionTicks`.

Le modèle courant ne persiste plus le viewport. Les anciens champs
`firstVisibleTick`, `highestVisiblePitch`, `horizontalZoom` et `verticalZoom`
sont encore validés par le codec historique puis abandonnés. `playheadTick` est
traité de la même manière. D-009 impose leur disparition avec les anciens
lecteurs au lot 2, sans couche de compatibilité finale.

## Données hors des quatre types

Les données suivantes restent hors du document, du workspace persisté et de
l'historique documentaire :

- sélection de notes et de marqueurs, hors checkpoints transitoires ci-dessus ;
- presse-papier, lasso, draft et preview de geste ;
- viewport courant, dimensions visibles et survols ;
- playhead, lecture, voix DSP et buffers Canvas ;
- état d'ouverture et brouillons des dialogues ;
- import ou collision en attente ;
- préférences utilisateur, notamment mode de sélection, couleur des notes,
  préécoute et raccourcis.

## Matrice récapitulative

| Donnée actuelle | Destination du lot 1 | Persistée | Undo/Redo |
| --- | --- | --- | --- |
| `ProjectDocument` | partie documentaire de `EditorSessionState` | oui | oui |
| `WorkspaceState.activeClipId` | `ActiveClipSelection` | via projection | non |
| `ProjectWorkspaceState.activeClipId` | `PersistedEditorWorkspace` | oui | non |
| `ProjectWorkspaceState.selectedInstrumentId` | `PersistedEditorWorkspace` | oui | non |
| `ProjectWorkspaceState.clipStatesById` | `PersistedEditorWorkspace` | oui | non |
| `ProjectClipWorkspaceState.pitchSnapSettings` | `PersistedClipEditorState` | oui | non |
| `ProjectClipWorkspaceState.gridSettings` | `PersistedClipEditorState` | oui | non |
| checkpoints de sélection `before`/`after` | `application/history` | non | auxiliaire |
| sélection, gestes, playhead et viewport courants | propriétaires de session/runtime | non | non |
