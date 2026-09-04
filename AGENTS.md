# Politique de travail des agents

Ce fichier s'applique à l'ensemble du dépôt. Les instructions explicites de
l'utilisateur restent prioritaires. Les README locaux précisent les règles de
leur zone sans contredire cette politique.

## Objectif

Livrer le changement demandé avec le plus petit périmètre cohérent, préserver
les comportements existants hors demande et laisser le dépôt dans un état
vérifiable. Ne pas ajouter de fonctionnalité, de dépendance ou de refonte qui
n'est pas nécessaire à l'objectif.

## Avant toute modification

0. Ignorer `.idea/`.
1. Lire le `README.md` racine, puis `docs/guides/contributing.md`.
2. Vérifier `git status --short` et considérer toute modification préexistante
   comme appartenant à l'utilisateur.
3. Localiser la capacité dans `docs/code-map.md` et lire le README de sa zone.
4. Pour un changement transversal, consulter `docs/architecture.md`. Pour un
   état créé, déplacé ou persisté, consulter `docs/state-ownership.md`.
5. Examiner les tests proches avant de modifier le comportement.

## Règles de modification

- Travailler dans les propriétaires existants : `domain`, `editor-core`,
  `application`, `infrastructure`, `presentation` et `bootstrap`.
- Garder `domain` et `editor-core` indépendants de React, du DOM, de Canvas,
  de Web Audio et de la composition applicative.
- Garder `application` indépendante de `presentation` et `infrastructure` ;
  les accès externes passent par les ports applicatifs.
- Faire passer toute mutation musicale durable par un cas d'usage, une commande
  et au plus une transaction Undo/Redo par intention validée.
- Ne pas écrire dans l'état durable pendant les étapes intermédiaires d'un
  geste. Les drafts, lasso, survols et previews restent transitoires.
- Donner au rendu Canvas des snapshots explicites ; garder sélection, collision,
  snapping et mutation hors des peintres.
- Préférer les imports précis et les modules à propriétaire fonctionnel unique.
  Ne pas créer de barrel global ni de fichier fourre-tout (`types`, `helpers`,
  `utils`, `common`, `state`, `input` ou `contracts`).
- Nommer les fichiers TypeScript en `kebab-case`, les composants React en
  `PascalCase` et les hooks en `useCamelCase`.
- Traiter 500 lignes comme un seuil de revue et découper par responsabilité
  lorsque cela améliore réellement la cohésion.
- Mettre à jour dans le même changement les guides et la carte du code rendus
  inexacts.

## Données et compatibilité

- Traiter tout JSON importé ou persisté comme une donnée inconnue et le valider
  avant usage.
- Ne pas modifier un schéma `.pianola`, MIDI ou IndexedDB sans lire
  `docs/guides/project-files.md` et les contrats de tests associés.
- Ne jamais accepter, convertir ou abandonner silencieusement un champ ou une
  version non pris en charge. Rendre le rejet ou la réinitialisation explicite.
- Ne pas exposer de secret, de donnée locale ou de chemin personnel dans le
  code, les fixtures, les journaux ou la documentation.

## Tests et validation

- Ajouter ou adapter une preuve de non-régression pour tout comportement changé.
- Placer les tests purs près du module ; réserver `tests/integration/` aux flux
  traversant plusieurs propriétaires.
- Pendant le travail, lancer le test le plus proche puis le typecheck pertinent.
- Avant livraison, exécuter `npm run verify`. Si une vérification ne peut pas
  être exécutée, expliquer précisément laquelle et pourquoi.
- Compléter les tests automatisés par une vérification navigateur pour les
  changements Canvas, tactiles, responsives ou Web Audio lorsque nécessaire.

## Git et sécurité du worktree

- Ne pas écraser, restaurer, déplacer ou supprimer une modification
  préexistante sans demande explicite.
- Ne pas utiliser de commande Git destructive et ne pas réécrire l'historique.
- Ne pas créer de commit, changer de branche ou publier sans demande explicite.
- Limiter les suppressions aux chemins identifiés et vérifier leurs références
  avant de les retirer.
- Relire le diff final et distinguer clairement les changements de la tâche des
  changements préexistants de l'utilisateur.

## Compte rendu

Le compte rendu final doit indiquer le résultat livré, les validations
exécutées et leur statut, puis les limites ou vérifications manuelles restantes.
Il doit signaler explicitement tout changement préexistant laissé intact.
