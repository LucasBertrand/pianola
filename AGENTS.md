# Instructions pour les agents

Pour toute tâche qui prépare, exécute, vérifie ou reprend la migration
architecturale, commencer par [`docs/migration/README.md`](docs/migration/README.md)
et lire les documents qu'il impose dans l'ordre indiqué.

Pendant la migration :

- les documents hors de `docs/migration/` décrivent par défaut le code courant ;
- `docs/migration/TARGET.md` et `docs/migration/ROADMAP.md` décrivent la cible et
  la séquence autorisée ;
- `docs/migration/STATUS.md` est la vérité sur l'étape réellement atteinte ;
- ne jamais appliquer un chemin cible avant le lot prévu uniquement parce qu'il
  apparaît dans `TARGET.md` ou `MAPPING.md` ;
- mettre à jour dans chaque lot la documentation produit directement affectée ;
  le lot 8 est uniquement la réconciliation finale ;
- préserver les changements préexistants de l'utilisateur et suivre le rollback
  et les validations du runbook de migration.

Pour une tâche sans rapport avec la migration, suivre les chemins et propriétaires
du code courant documentés dans le README racine et `docs/`.
