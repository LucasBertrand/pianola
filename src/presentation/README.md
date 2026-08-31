# Présentation

## Que possède cette zone ?

Les surfaces React et les hooks de capacité : bibliothèque locale, dialogs,
diagnostics, toolbar, inspecteur, piano roll, fichiers et transport. Les
adaptateurs de stockage navigateur vivent sous
`src/infrastructure/persistence/` et implémentent les ports de
`src/application/ports/`.

L'en-tête et la toolbar appartiennent respectivement à `editor-header/` et
`editor-toolbar/`, les icônes de commandes à `command-icons/`, le menu radial à
`radial-menu/` et le réordonnancement de cartes à
`inspector/card-reorder/` ; aucune zone `presentation/shared` ne sert de
propriétaire par défaut.

## Quel fichier lire en premier ?

Lire `home/ApplicationHome.tsx` pour l'accueil et
`piano-roll/PianoRollWorkspace.tsx` pour l’assemblage de l'éditeur, puis
`piano-roll/PianoRollWorkspaceLayout.tsx` pour sa structure DOM. Les fichiers,
préférences et dialogues ont chacun un hook propriétaire. Les contrôles de
navigation, grille et snap par motif de hauteurs sont sous `piano-roll/viewport/`, tandis que
les signaux et contrôleurs restent possédés par le piano roll et le noyau.
Les fichiers sous `piano-roll/interactions/` adaptent les événements natifs,
le DOM, les retours visuels et les intentions applicatives ; les recognizers,
hit-tests et mutations de sélection indépendants du navigateur vivent dans
`../editor-core/`.
Pour le Canvas, utiliser
[`piano-roll/rendering/README.md`](piano-roll/rendering/README.md).

## Quelles dépendances sont autorisées ?

La présentation peut dépendre de l’application, du domaine, du noyau éditeur et
des adaptateurs d’infrastructure nécessaires. Aucun autre propriétaire ne doit
dépendre de la présentation.

## Où sont les tests ?

Les peintres ont leurs contrats près de `piano-roll/rendering/__tests__/`. Les
modèles de layout, dialogues, presets et sélecteurs ont leurs tests colocalisés ;
ceux du menu radial sont sous `radial-menu/__tests__/`. Les flux UI traversants
sont couverts par `tests/integration/` et le smoke navigateur du scénario de
rendu.
