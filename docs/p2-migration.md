# Migration P2 — domaine et formats

État de référence : 13 août 2026. P2.1 à P2.5 sont terminés.

## Résultat observable

Les comportements musicaux, le format natif v1 courant et les deux points
d’entrée MIDI restent couverts par `npm run verify`. La suite compte désormais
95 scénarios Vitest, dont des contrats explicites pour chaque famille de
commandes et des suites séparées pour le parseur et le sérialiseur natifs.

## Commandes et validation

`src/domain/commands/` contient les types, transactions, erreurs, reducer et
handlers par famille. Les imports historiques vers `domain/commands.ts` ont été
migrés vers leur propriétaire précis. Le reducer racine conserve le dispatch et
la conversion commune des erreurs de validation ; chaque famille est couverte
sur succès, rejet et Undo/Redo.

`src/domain/validation/` partage `ValidationIssue`, `ValidationResult` et
`DomainValidationError`, puis sépare notes/pistes, instruments/presets et
transport/durée. Les descripteurs restent validés avec l’instrument qui les
possède, ce qui évite de dupliquer leurs bornes dans les parseurs.

## Format natif v1

Le pipeline est désormais :

```text
JSON inconnu
  → reconnaissance format/version
  → lecteurs JSON sans dépendance domaine
  → parseurs éditeur, instruments, clips et projet
  → ProjectDocument + WorkspaceState + NativeEditorState
```

`native-project-schema.ts` décrit l’arbre JSON stocké indépendamment de
`ProjectState`. `serialize-native-project.ts` convertit explicitement le domaine
vers des valeurs JSON finies et déterministes. `version.ts` documente le point
d’insertion d’une future migration pure : après reconnaissance de la version,
avant les parseurs qui construisent le domaine.

Ce v1 est le format de référence de la migration. Les sauvegardes produites
avant sa refonte ne sont pas garanties compatibles. Cette incompatibilité doit
rester visible dans les notes de livraison avant toute distribution ; l’export
MIDI demeure le format de secours indépendant.

## Import MIDI

Les points d’entrée publics sont :

- `analyzeMidiImport` dans `analyze-midi-import.ts` ;
- `createProjectFromMidiImport` dans `create-project-from-midi-import.ts`.

Ils composent des modules dédiés au timing PPQN et à la métrique, au nommage,
aux collisions, aux avertissements et aux contrats d’import. La résolution de
collision MIDI reste séparée de la collision d’édition : l’import doit traiter
des groupes entiers, créer des fragments stables et faire respecter une limite
globale avant la création du projet, tandis que le domaine résout une intention
d’édition déjà rattachée à des pistes existantes. Une fusion prématurée
masquerait ces sémantiques différentes.

## Fondations P2.5 livrées

- `ProjectDocument` contient exclusivement le projet musical durable ;
  `WorkspaceState` porte la navigation et reste hors Undo/Redo ;
- `ProjectClock` centralise tempo, PPQN et grille de lancement ;
- chaque clip porte une `ClipTimeline` avec durée et `MeterMap`, dont le premier
  segment représente la métrique constante actuelle ;
- toutes les commandes musicales, les collisions et les plans de sélection
  reçoivent un `clipId` explicite, y compris pour un clip non affiché ;
- `anchorAudioTimeSeconds` a quitté `TransportState` et le format persistant ;
- `PlaybackPlan`, ses projections d’instrument et `MidiExportPlan`
  conservent leur `sourceId` ;
- le plan de lecture projette tous les segments de `MeterMap`, sans consulter
  le clip affiché ;
- chaque note du plan MIDI conserve son origine `(sourceId, noteId)` ;
- `InstrumentPreviewPort` rend la preview audio explicite sans la persister ;
- `PlaybackSource` et le registre des renderers restent indépendants de l’écran
  actif ;
- le moteur de transformations ciblées conserve `(sourceKind, sourceId)` et
  fonctionne pour une cible `clip` ou `pattern` sans lire le store.

La navigation est sauvegardée dans la section éditeur du fichier natif, jamais
dans le document musical. L’historique stocke des snapshots de
`ProjectDocument` et préserve le `WorkspaceState` courant lors d’Undo/Redo.

## Vérification

```bash
npm run verify
```
