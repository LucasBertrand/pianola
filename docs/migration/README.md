# Migration architecturale de Pianola

Ce dossier est le point d'entrée unique pour préparer, exécuter et reprendre la
migration architecturale de Pianola. Un agent doit pouvoir travailler à partir
de ces documents sans reconstruire l'intention depuis l'historique des
conversations.

## Ordre de lecture obligatoire

1. [`DECISIONS.md`](DECISIONS.md) : décisions déjà prises et hors débat ;
2. [`BASELINE.md`](BASELINE.md) : diagnostic factuel à revérifier ;
3. [`TARGET.md`](TARGET.md) : architecture et règles de dépendances cibles ;
4. [`MAPPING.md`](MAPPING.md) : correspondance entre chemins actuels et cibles ;
5. [`ROADMAP.md`](ROADMAP.md) : lots ordonnés et critères de sortie ;
6. [`RUNBOOK.md`](RUNBOOK.md) : procédure d'exécution sûre pour un agent ;
7. [`VALIDATION.md`](VALIDATION.md) : contrôles à appliquer à chaque lot ;
8. [`STATUS.md`](STATUS.md) : état réel et point de reprise courant.

En cas de contradiction, l'ordre d'autorité est :

```text
DECISIONS.md > TARGET.md > ROADMAP.md > MAPPING.md > BASELINE.md > STATUS.md
```

`STATUS.md` décrit ce qui est fait ; il ne peut pas modifier une décision.

## But de la migration

Rendre l'emplacement et la direction des dépendances prévisibles :

```text
bootstrap
   ↓
presentation → application → domain
      ↓              ↑
infrastructure ──────┘

presentation → editor-core → domain
```

Le résultat attendu n'est pas une multiplication des dossiers. Pour tout
nouveau fichier, un développeur doit pouvoir déterminer un propriétaire unique
à partir de sa responsabilité.

## Règle de conduite

Chaque lot doit être petit, testable et réversible. Ne jamais mélanger dans le
même lot :

- déplacement architectural ;
- renommage conceptuel ;
- modification fonctionnelle.

Les changements préexistants dans le worktree appartiennent à l'utilisateur et
doivent être préservés.
