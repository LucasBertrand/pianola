# Interface utilisateur

## Que possède cette zone ?

Les surfaces React, les hooks de capacité et les adaptateurs navigateur :
dialogs, toolbar, inspecteur, piano roll, fichiers et transport.

## Quel fichier lire en premier ?

Lire `piano-roll/PianoRollWorkspace.tsx` pour l’assemblage, puis descendre dans
la surface concernée. Pour le Canvas, utiliser
[`piano-roll/rendering/README.md`](piano-roll/rendering/README.md).

## Quelles dépendances sont autorisées ?

L’UI peut dépendre des cas d’usage, du domaine, du noyau éditeur, de l’audio et
des formats. Aucun autre dossier ne doit dépendre de la composition UI.

## Où sont les tests ?

Les peintres ont leurs contrats près de `piano-roll/rendering/__tests__/`. Les
flux UI traversants sont couverts par `tests/integration/`. Le workspace reste
au-dessus de 500 lignes comme composition de surface, mais ses protocoles
complets sont tous délégués à des hooks nommés.
