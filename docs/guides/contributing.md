# Contribuer au projet

Ce guide est le parcours court pour commencer une modification sans devoir
reconstruire les conventions du dépôt. Il complète le
[`README` racine](../../README.md), qui reste le portail général.

## Avant de modifier le code

1. Vérifier l'état du worktree avec `git status --short` et préserver les
   changements préexistants.
2. Identifier la capacité concernée dans la [`carte du code`](../code-map.md).
3. Lire le README local de la zone avant de choisir un fichier ou une
   dépendance.
4. Consulter l'[`architecture`](../architecture.md) pour un changement
   transversal, et la [propriété des états](../state-ownership.md) si une donnée
   est créée, déplacée ou persistée.
La structure actuelle est celle du worktree et des guides produit.

## Choisir le bon propriétaire

Un fichier doit avoir un propriétaire fonctionnel unique :

| Responsabilité | Zone actuelle | Premier guide |
| --- | --- | --- |
| invariants et document musical | `src/domain/` | [`src/domain/README.md`](../../src/domain/README.md) |
| géométrie et gestes sans DOM | `src/editor-core/` | [`src/editor-core/README.md`](../../src/editor-core/README.md) |
| historique, commandes et session | `src/application/history/`, `src/application/editor-session/` | [`docs/state-ownership.md`](../state-ownership.md) |
| intentions et orchestrations neutres | `src/application/` | [`src/application/README.md`](../../src/application/README.md) |
| timeline et moteur temps réel | `src/infrastructure/audio/` | [`src/infrastructure/audio/README.md`](../../src/infrastructure/audio/README.md) |
| formats `.pianola` et MIDI | `src/infrastructure/project-files/` | [`src/infrastructure/project-files/README.md`](../../src/infrastructure/project-files/README.md) |
| routage des données versionnées | `src/infrastructure/migration/` | [`README local`](../../src/infrastructure/migration/README.md) |
| React et adaptateurs d'interface | `src/presentation/` | [`src/presentation/README.md`](../../src/presentation/README.md) |
| rendu du piano roll | `src/presentation/piano-roll/rendering/` | [`README local`](../../src/presentation/piano-roll/rendering/README.md) |

Avant d'ajouter un dossier, une façade ou une abstraction, vérifier qu'un
propriétaire existant ne couvre pas déjà la responsabilité. Éviter les modules
fourre-tout nommés seulement `types`, `helpers`, `utils`, `common`, `state`,
`input` ou `contracts`.

## Règles de développement

- Garder le domaine et le noyau d'édition indépendants de React, du DOM, de
  Canvas, de Web Audio et de la composition applicative.
- Faire entrer une modification musicale validée par un cas d'usage et une
  commande ; une intention validée produit au plus une transaction.
- Ne pas écrire dans l'état durable pendant les mouvements intermédiaires d'un
  geste. La sélection temporaire, le draft et le lasso sont des états de
  session.
- Donner aux peintres Canvas des snapshots explicites. Les décisions de geste,
  sélection, collision, snapping et mutation vivent hors du rendu.
- Utiliser des imports précis et ne pas créer de barrel global.
- Nommer les fichiers TypeScript en `kebab-case`, les composants React en
  `PascalCase` et les hooks en `useCamelCase`.
- Placer les tests purs près du module. Réserver `tests/integration/` aux flux
  qui traversent plusieurs propriétaires.
- Traiter 500 lignes comme un seuil d'alerte : découper par responsabilité ou
  documenter explicitement pourquoi le module doit rester cohérent.
- Mettre à jour dans le même changement les guides, README et entrées de la
  carte du code rendus inexacts.
- Toute évolution de donnée persistée augmente la version de son enveloppe et
  ajoute une migration pure `n -> n + 1` déclarée près du format ; le pipeline
  commun sous `infrastructure/migration/` est l'unique point de routage.
  Ne pas disperser des branches de rétrocompatibilité dans les parseurs métier.

## Boucle de travail

Après une première installation avec `npm ci` :

```bash
npm run dev
npm run test:vitest:watch
```

Pendant le développement, lancer le test le plus proche du comportement
modifié :

```bash
npm test -- chemin/du/test.test.ts
npm run typecheck
```

Pour un changement Canvas, tactile ou Web Audio, compléter les tests par une
vérification humaine dans un navigateur adapté. Pour les formats projet,
vérifier les contrats décrits dans le
[guide des fichiers](project-files.md) et la procédure du
[`README` des migrations](../../src/infrastructure/migration/README.md).

## Avant de livrer

Exécuter depuis la racine :

```bash
npm run verify
```

`verify` vérifie les liens et chemins documentés, la structure, les frontières
d'import, les trois configurations TypeScript, le build Vite, le module
AudioWorklet produit et la suite Vitest.

Relire ensuite le diff et confirmer :

- aucun changement préexistant de l'utilisateur n'a été écrasé ;
- le comportement nouveau ou corrigé possède une preuve de non-régression ;
- les dépendances respectent le propriétaire choisi ;
- la documentation décrit le code réellement livré ;
- les vérifications manuelles restantes sont signalées dans le compte rendu.

La checklist de [pull request](../../.github/PULL_REQUEST_TEMPLATE.md) reprend
ces points pour la livraison.
