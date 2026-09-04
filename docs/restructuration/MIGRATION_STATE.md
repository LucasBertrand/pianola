# État de la restructuration

Ce fichier est le journal opérationnel unique. Sa structure et ses règles sont
définies dans [le protocole de passation](protocole-passation.md). Il est
initialisé pour le futur chantier ; aucun lot de migration source n'a encore
été exécuté dans le cadre de ce livrable.

## État courant

| Champ | Valeur |
| --- | --- |
| `plan_version` | `1` |
| `global_status` | `NOT_STARTED` |
| `branch` | `TO_SET` |
| `baseline_ref` | `TO_SET` |
| `last_checkpoint` | `UNCOMMITTED` |
| `active_batch` | `P00` |
| `active_task` | `P00-T01` |
| `task_status` | `READY` |
| `owner` | `UNASSIGNED` |
| `validation_mode` | `final-only` |
| `expected_broken_state` | `aucun : la migration source n'a pas commencé` |
| `last_update` | `2026-09-04T00:00:00+02:00` |

### Prochaine action exacte

`P00-T01` — Sur la branche dédiée autorisée pour le chantier, relever le nom de
branche, le SHA de base et `git status --short`; remplacer `TO_SET`, inventorier
chaque modification préexistante à préserver, puis attribuer `P00-T02`.

### Commande de reprise

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
```

Résultat attendu avant prise en charge : les valeurs obtenues sont encore à
reporter dans ce fichier ; aucun fichier source n'est attribué au chantier.

## Changements préexistants à préserver

À compléter par `P00-T01` depuis le worktree réel. Ne jamais restaurer, déplacer
ou supprimer une entrée de cette table sans instruction explicite de son
propriétaire.

| Chemin | État initial | Propriétaire/contexte | Traitement autorisé |
| --- | --- | --- | --- |
| `TO_INVENTORY` | `TO_SET` | `TO_SET` | préserver par défaut |

## Progression des lots

| Lot | Statut | Tâches terminées | Dernier propriétaire | Preuve/observation |
| --- | --- | --- | --- | --- |
| `P00` | `READY` | — | — | journal initialisé, baseline à établir |
| `P01` | `TODO` | — | — | dépend de `P00` |
| `P02` | `TODO` | — | — | dépend de `P01` |
| `P03` | `TODO` | — | — | dépend de `P02` |
| `P04` | `TODO` | — | — | dépend de `P02`, `P03` |
| `P05` | `TODO` | — | — | dépend de `P03`, `P04` |
| `P06` | `TODO` | — | — | dépend de `P03`, `P04` |
| `P07` | `TODO` | — | — | dépend de `P02`, `P03` |
| `P08` | `TODO` | — | — | dépend de `P05`, `P06`, `P07` |
| `P09` | `TODO` | — | — | dépend de `P08` |
| `P10` | `TODO` | — | — | dépend de `P09` |

## Registre des familles de chemins

| Source | Destination | État | Dernière tâche | Reliquat |
| --- | --- | --- | --- | --- |
| `src/bootstrap/` | `src/app/`, `src/main.tsx` | `NOT_MOVED` | — | totalité |
| `src/domain/` | `src/project/` | `NOT_MOVED` | — | totalité |
| `src/application/history/` | `src/project/` | `NOT_MOVED` | — | totalité |
| `src/application/editor-session/` | `src/editor/`, `src/app/` | `NOT_MOVED` | — | totalité |
| `src/application/piano-roll/` | `src/editor/piano-roll/`, `src/project/` | `NOT_MOVED` | — | totalité |
| `src/editor-core/` | `src/editor/piano-roll/`, `src/audio/` | `NOT_MOVED` | — | totalité |
| `src/application/audio/`, audio port | `src/audio/` | `NOT_MOVED` | — | totalité |
| `src/infrastructure/audio/` | `src/audio/` | `NOT_MOVED` | — | totalité |
| `src/presentation/transport/` | `src/audio/ui/`, `src/audio/` | `NOT_MOVED` | — | totalité |
| persistance et migrations actuelles | `src/project-io/local/`, `versioning/` | `NOT_MOVED` | — | totalité |
| fichiers `.pianola` et MIDI actuels | `src/project-io/pianola/`, `midi/` | `NOT_MOVED` | — | totalité |
| présentation éditeur actuelle | `src/editor/` | `NOT_MOVED` | — | totalité |
| primitives de présentation actuelles | `src/ui/` | `NOT_MOVED` | — | totalité |
| home, shell, diagnostics actuels | `src/app/` | `NOT_MOVED` | — | totalité |

## État cassé connu

Aucun au moment de l'initialisation. Pendant le chantier, décrire ici les
imports non résolus, écrans indisponibles et flux volontairement déconnectés.
Ne pas utiliser une formule générale telle que « ça ne compile pas ».

## Baseline et preuves finales

| Preuve | Référence/résultat |
| --- | --- |
| baseline `npm run verify` | `TO_SET` |
| fixtures `.pianola` supportées | `TO_SET` |
| fixtures de stockage local/réglages | `TO_SET` |
| fixtures MIDI | `TO_SET` |
| recette manuelle de référence | `TO_SET` |
| validation finale `npm run verify` | `PENDING_P10` |
| recette manuelle finale | `PENDING_P10` |

## Décisions

| ID | Date | Tâche | Décision | Conséquences |
| --- | --- | --- | --- | --- |
| `D-001` | 2026-09-04 | plan | organisation par six capacités, validation complète uniquement en `P10` | remplace les couches horizontales sans relâcher les invariants observables |

## Journal — plus récent en premier

### 2026-09-04T00:00:00+02:00 — PLAN — Codex

- Statut : initialisation documentaire.
- Point de départ : non attribué ; la baseline réelle sera établie par
  `P00-T01`.
- Changements : création du plan et du journal, aucun changement sous `src/`.
- Décisions : architecture par capacités et protocole séquentiel de passation.
- Préexistant préservé : à inventorier depuis le worktree d'exécution.
- État cassé attendu : aucun, migration non commencée.
- Contrôles exécutés : lecture documentaire et inspection de l'arborescence.
- Tests/builds : non exécutés conformément au mandat documentaire ; baseline à
  enregistrer dans `P00`.
- Prochaine tâche : `P00-T01`.
- Action exacte : relever branche, SHA et worktree, puis remplir la baseline et
  la table des changements préexistants.
- Commande de reprise : `git branch --show-current; git rev-parse HEAD; git status --short`.

