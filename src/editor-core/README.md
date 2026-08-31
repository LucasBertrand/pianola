# Éditeur

## Que possède cette zone ?

Le noyau indépendant du DOM du piano roll : géométrie, interactions, sélection,
viewport et signaux. Il possède notamment les recognizers de pointeurs, la
géométrie de hit-test des gestes et les politiques de sélection par lasso ou
marqueur. L'agrégat applicatif de ces mécanismes appartient à
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

Les unités géométriques vivent près de `geometry/`, les tests de recognizers
près de `interactions/` et les politiques de sélection près de `selection/`.
Les contrats de contrôleur sont dans
`tests/integration/editor-controller-contracts.test.ts` et les flux complets de
gestes dans la suite d'intégration.
