# État de la migration

Ce fichier est le journal mutable et le point de reprise. Il doit refléter le
workspace réel, pas seulement l'intention.

## État global

- Statut : PRÉPARATION
- Lot actif : aucun
- Dernier lot terminé : aucun
- Prochaine action : établir la baseline du lot 0
- Dernière mise à jour : 2026-08-26

## Baseline connue

- arborescence source actuelle : `app`, `audio`, `config`, `domain`, `editor`,
  `music`, `persistence`, `project-io`, `pwa`, `styles`, `ui`, `use-cases` ;
- `check:boundaries` passe sur 316 fichiers source lors de l'audit initial ;
- `check:structure` échoue actuellement à cause de liens documentaires absolus
  présents dans `audit.md` ;
- un cycle d'import typé a été détecté entre `spatial-index.ts` et
  `spatial-index-search.ts` ;
- `PianoRollWorkspace.tsx` est le principal point de concentration ;
- le codec portable dépend encore d'un parseur sous `project-io/native`.

Cette baseline doit être revérifiée au début du lot 0 : elle peut devenir
obsolète si le projet évolue.

## Changements préexistants observés le 2026-08-26

Au moment de créer ce dossier :

```text
M  .gitignore
D  docs/persistence-strategy.md
D  docs/storage-strategies.md
```

Ils ne font pas partie de la migration préparée ici. Ne pas les restaurer ou les
modifier sans instruction explicite de l'utilisateur.

## Suivi des lots

| Lot | Statut | Notes |
| ---: | --- | --- |
| 0 | À FAIRE | Baseline et garde-fous |
| 1 | À FAIRE | Vocabulaire d'état |
| 2 | À FAIRE | Format `.pianola` |
| 3 | À FAIRE | Persistance |
| 4 | À FAIRE | Cœur d'édition |
| 5 | À FAIRE | `PianoRollWorkspace` |
| 6 | À FAIRE | Configurations et horizontales |
| 7 | À FAIRE | Renommage physique des couches |
| 8 | À FAIRE | Nettoyage final |

## Compatibilités temporaires

Aucune pour le moment.

## Écarts et découvertes

Aucun écart supplémentaire consigné.

## Journal

### 2026-08-26 — Préparation

- création du dossier d'exécution autonome ;
- enregistrement de la décision de conserver `ScaleMarker` ;
- aucune modification du code produit.
