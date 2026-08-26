# Cartographie de migration

Ce fichier indique la destination par défaut. Avant tout déplacement, vérifier
les imports réels et consigner les exceptions découvertes dans `STATUS.md`.

## Racines

| Chemin actuel | Destination |
| --- | --- |
| `src/app/` | `src/bootstrap/` |
| `src/use-cases/` | `src/application/` |
| `src/editor/` | `src/editor-core/`, sauf runtime applicatif |
| `src/ui/` | `src/presentation/` |
| `src/audio/` | `src/infrastructure/audio/`, sauf concepts métier éventuels |
| `src/project-io/midi/` | `src/infrastructure/project-files/midi/` |
| `src/project-io/portable/` | `src/infrastructure/project-files/pianola/` |
| `src/project-io/native/` | logique courante réutilisable vers `pianola/parsing`, puis suppression complète du dossier et de ses anciens codecs |
| `src/pwa/persistence/` | `src/infrastructure/persistence/` |
| `src/pwa/register-service-worker.ts` | `src/infrastructure/browser/service-worker/` |
| `src/persistence/` | ports vers `application/ports`, codecs et modèles stockés vers `infrastructure/persistence` |
| `src/music/` | `src/domain/harmony/` |
| `src/config/` | distribué chez les propriétaires |
| `src/styles/` | `src/presentation/styles/` |

## Exceptions importantes

- `src/editor/runtime/editor-runtime.ts` ne doit pas être déplacé aveuglément :
  son agrégation applicative va sous `application`, tandis que ses ports et
  signaux purs restent sous `editor-core`.
- `src/domain/project-store.ts` possède l'historique et l'orchestration des
  commandes ; sa destination pressentie est `application/history/` après
  séparation des invariants du reducer.
- `src/project-io/portable/portable-project-codec.ts` utilise actuellement le
  parseur de `native/parsing`. Le parseur partagé doit être extrait avant toute
  suppression de `native/`.
- les types de repository présents dans
  `src/persistence/project-persistence-model.ts` sont des ports applicatifs ;
  les enveloppes sérialisées et erreurs de codec restent infrastructurelles.
- `ScaleMarker` conserve son nom conformément à D-002.

## Fichiers horizontaux à redistribuer

| Actuel | Propriétaire cible |
| --- | --- |
| `config/domain-limits.ts` | `domain/project/` ou chaque agrégat concerné |
| `config/audio-config.ts` | `infrastructure/audio/` |
| `config/midi-config.ts` | `infrastructure/project-files/midi/` |
| `config/native-file-config.ts` | `infrastructure/project-files/pianola/` avec renommage |
| `config/rendering-config.ts` | `presentation/editor/piano-roll/rendering/` |
| `config/interaction-config.ts` | `editor-core/interactions/` |
| `config/application-colors.ts` | `presentation/styles/` |
| `config/product-config.ts` | `bootstrap/` |
| `ui/shared/CommandIcon.tsx` | composant possédé par l'éditeur/toolbar |
| `ui/shared/useCardReorder.ts` | `presentation/interactions/card-reorder/` |

## Renommages conceptuels planifiés

| Ancien | Nouveau | Stratégie |
| --- | --- | --- |
| `ProjectState` | `EditorSessionState` | alias temporaire puis migration des consommateurs |
| `WorkspaceState` | `ActiveClipSelection` | alias temporaire |
| `ProjectWorkspaceState` | `PersistedEditorWorkspace` | migration des codecs puis UI |
| `ProjectClipWorkspaceState` | `PersistedClipEditorState` | même lot que le précédent |
| `Track` | `InstrumentTrack` | type alias, puis commandes et codecs |
| préfixes `NATIVE_PROJECT_*` courants | `PIANOLA_PROJECT_*` | avec la nouvelle baseline de version, sans alias de compatibilité final |
