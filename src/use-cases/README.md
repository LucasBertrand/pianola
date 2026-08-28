# Cas d’usage

> **État courant.** Ce guide décrit la zone présente dans le worktree. Pour une
> tâche de migration, commencer par
> [`../../docs/migration/README.md`](../../docs/migration/README.md) et vérifier
> `STATUS.md` avant d'utiliser un propriétaire cible.

## Que possède cette zone ?

Les intentions indépendantes de React : service de commandes, autosave,
projection du workspace et workflows de notes/sélection du piano roll. Les
contrats de persistance injectés sont sous `../application/ports/`.

## Quel fichier lire en premier ?

Lire `commands/editor-command-service.ts` pour le port de mutation. Pour le
piano roll, commencer par `piano-roll/notes/note-gesture-workflow.ts` ou
`piano-roll/selection/selection-edit-plans.ts`. La persistance de session part
de `persistence/project-autosave.ts`.

## Quelles dépendances sont autorisées ?

Les cas d’usage dépendent du domaine, du noyau éditeur et des types de formats
nécessaires. Ils ne dépendent jamais de composants ou hooks UI.

## Où sont les tests ?

Les plans sont couverts par la suite centrale sous `tests/integration/`. Les
commandes métier ont leurs unités dans `src/domain/commands/__tests__/`.
