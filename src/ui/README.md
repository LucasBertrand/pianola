# Interface utilisateur

> **État courant.** Ce guide décrit la zone présente dans le worktree. Pour une
> tâche de migration, commencer par
> [`../../docs/migration/README.md`](../../docs/migration/README.md) et vérifier
> `STATUS.md` avant d'utiliser un propriétaire cible.

## Que possède cette zone ?

Les surfaces React et les hooks de capacité : bibliothèque locale, dialogs,
diagnostics, toolbar, inspecteur, piano roll, fichiers et transport. Les
adaptateurs de stockage navigateur vivent sous `src/pwa/persistence/`.

## Quel fichier lire en premier ?

Lire `home/ApplicationHome.tsx` pour l'accueil et
`piano-roll/PianoRollWorkspace.tsx` pour l’assemblage de l'éditeur, puis
descendre dans la surface concernée. Pour le Canvas, utiliser
[`piano-roll/rendering/README.md`](piano-roll/rendering/README.md).

## Quelles dépendances sont autorisées ?

L’UI peut dépendre des cas d’usage, du domaine, du noyau éditeur, de l’audio et
des formats. Aucun autre dossier ne doit dépendre de la composition UI.

## Où sont les tests ?

Les peintres ont leurs contrats près de `piano-roll/rendering/__tests__/`. Les
flux UI traversants sont couverts par `tests/integration/`. Le workspace reste
au-dessus de 500 lignes comme composition de surface, mais ses protocoles
complets sont tous délégués à des hooks nommés.
