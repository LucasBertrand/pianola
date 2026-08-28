# Éditeur

> **État courant.** Ce guide décrit la zone présente dans le worktree. Pour une
> tâche de migration, commencer par
> [`../../docs/migration/README.md`](../../docs/migration/README.md) et vérifier
> `STATUS.md` avant d'utiliser un propriétaire cible.

## Que possède cette zone ?

Le noyau indépendant du DOM du piano roll : géométrie, interactions, sélection,
viewport et signaux. L'agrégat applicatif de ces mécanismes appartient à
`../application/editor-session/`.

## Quel fichier lire en premier ?

Pour un geste, partir de `interactions/piano-roll-interaction-session.ts`, puis
`interactions/gestures/gesture-state-machine.ts`. Pour comprendre les services
assemblés, partir de `../application/editor-session/editor-runtime.ts`.

```text
PointerSample → session → machine de gestes → résultat déterministe
```

## Quelles dépendances sont autorisées ?

L’éditeur peut dépendre du domaine ; ses constantes de viewport, modèle et
interaction sont colocalisées dans leurs capacités. Il ne dépend pas
d'`application`. React, DOM, Canvas et Web Audio sont
interdits.

## Où sont les tests ?

Les unités géométriques vivent près de `geometry/`. Les contrats de contrôleur
sont dans `tests/integration/editor-controller-contracts.test.ts` et les
régressions de gestes dans la suite centrale.
