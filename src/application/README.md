# Application

## Que possède cette zone ?

Les intentions indépendantes de React : autosave, workflows de notes/sélection
du piano roll et plans de fichiers projet. L'historique, le service de commandes
et la projection de session vivent dans cette même couche ; les contrats de
persistance injectés sont sous `ports/`.

## Quel fichier lire en premier ?

Lire `history/editor-command-service.ts` pour le port de mutation. Pour le piano
roll, commencer par
`piano-roll/notes/note-gesture-workflow.ts` ou
`piano-roll/selection/selection-edit-plans.ts`. La persistance de session part
de `persistence/project-autosave.ts`.

## Quelles dépendances sont autorisées ?

L’application dépend du domaine et des ports du noyau éditeur nécessaires à ses
orchestrations. Elle ne dépend jamais de React, d’un composant, d’un hook UI ou
d’une implémentation d’infrastructure.

## Où sont les tests ?

Les plans sont couverts par la suite centrale sous `tests/integration/`. Les
commandes métier ont leurs unités dans `src/domain/commands/__tests__/`.
