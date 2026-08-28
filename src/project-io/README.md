# Entrées et sorties projet

> **État courant.** Ce guide décrit la zone encore présente dans le worktree.
> Pour une tâche de migration, lire
> [`../../docs/migration/README.md`](../../docs/migration/README.md) et vérifier
> `STATUS.md` avant d'appliquer un chemin cible.

## Que possède cette zone ?

Les codecs et validations du Standard MIDI File. Le format `.pianola` est déjà
possédé par `src/infrastructure/project-files/pianola/` et la persistance locale
par `src/infrastructure/persistence/`.

## Quel fichier lire en premier ?

Pour MIDI : `midi/standard-midi-file.ts`, puis reader/writer et analyse.

## Quelles dépendances sont autorisées ?

Cette zone dépend du domaine, de ses constantes MIDI colocalisées et des
projections neutres. React, composants UI et composition `app` sont interdits.

## Où sont les tests ?

La régression MIDI est dans `tests/integration/midi-regression.test.mjs`.
`midi/smf-reader.ts` est signalé comme module volumineux par le contrôle
structurel.
