# Protocole de passation entre agents

## 1. Principe

`MIGRATION_STATE.md` est l'unique source de vérité opérationnelle du chantier.
Le plan décrit ce qui devrait arriver ; le journal décrit ce qui est réellement
arrivé. Un agent qui démarre à froid ne déduit jamais l'état depuis les noms de
dossiers seuls.

Le protocole vise des reprises asynchrones et séquentielles. Une seule tâche est
active dans le même worktree. Si une exécution parallèle devient nécessaire,
elle doit utiliser des worktrees/branches distincts et un coordinateur doit
consolider leur état avant de changer `active_task` ; ce mode n'est pas le mode
normal de ce chantier transversal.

## 2. États autorisés

| Statut | Sens |
| --- | --- |
| `TODO` | tâche non préparée ou dépendances non terminées |
| `READY` | dépendances satisfaites, tâche sélectionnable |
| `IN_PROGRESS` | tâche possédée par l'agent nommé dans le journal |
| `DONE_STRUCTURAL` | critères structurels du lot satisfaits, sans promesse de compilation |
| `BLOCKED` | obstacle explicite qui exige une décision ou une donnée externe |
| `VALIDATED` | comportement couvert par la validation finale `P10` |
| `SKIPPED` | tâche devenue inutile, justification obligatoire |

Le statut global est l'un de `NOT_STARTED`, `ACTIVE`, `FINAL_VALIDATION` ou
`COMPLETE`. Seul `P10` transforme des tâches `DONE_STRUCTURAL` en état global
validé.

## 3. Démarrage à froid obligatoire

Avant toute édition, l'agent :

1. lit entièrement `docs/restructuration/README.md`, puis la fiche du lot actif
   dans `sequence-chantiers.md` ;
2. lit entièrement `MIGRATION_STATE.md`, en priorité `État courant`,
   `Changements attendus` et le dernier événement du journal ;
3. exécute depuis la racine :

   ```powershell
   git branch --show-current
   git rev-parse HEAD
   git status --short
   git diff -- docs/restructuration/MIGRATION_STATE.md
   ```

4. compare branche, SHA, fichiers modifiés et symptômes au journal ;
5. lit le diff des chemins attribués à la tâche active et les README de leurs
   propriétaires source/cible ;
6. s'attribue la tâche dans le journal, puis exécute mot pour mot
   `next_action` ou consigne pourquoi cette action est devenue invalide.

Si le worktree et le journal divergent, l'agent ne restaure ni ne supprime rien.
Il ajoute un événement `RECOVERY_REQUIRED`, liste les chemins inattendus et
fait de leur attribution la prochaine action.

## 4. Bloc d'état courant

Les champs suivants sont obligatoires et n'apparaissent qu'une fois :

| Champ | Contenu attendu |
| --- | --- |
| `plan_version` | version entière, incrémentée si ordre ou cible change |
| `global_status` | statut global autorisé |
| `branch` | branche dédiée réelle |
| `baseline_ref` | commit immuable validé avant migration |
| `last_checkpoint` | dernier commit/checkpoint autorisé connu, ou `UNCOMMITTED` |
| `active_batch` | identifiant `P00` à `P10` |
| `active_task` | identifiant exact `Pxx-Tyy` |
| `task_status` | statut de la tâche active |
| `owner` | nom d'agent ou `UNASSIGNED` |
| `validation_mode` | `final-only` pendant ce chantier |
| `expected_broken_state` | ce qui ne compile ou ne fonctionne volontairement pas |
| `next_action` | une tâche atomique formulée à l'impératif avec chemins concernés |
| `resume_check` | commande de lecture seule et résultat attendu |
| `last_update` | date/heure ISO 8601 avec fuseau |

`next_action` n'est jamais « continuer la migration ». Exemple acceptable :

> `P03-T03 — déplacer les types et reducers de notes vers
> src/project/notes/note-commands.ts, mettre à jour leurs imports directs, puis
> lister dans le journal les anciens fichiers devenus supprimables.`

`resume_check` ne lance pas la suite complète avant `P10`. Il localise le
reste exact du travail, par exemple :

```powershell
rg -n "EditorSessionState|preserveWorkspace|resolveWorkspace" src
```

## 5. Registre de progression

Le tableau des lots indique pour chacun : statut, tâches terminées, propriétaire
du dernier changement et preuve structurelle. Une tâche ne passe à
`DONE_STRUCTURAL` que si les critères du lot correspondants sont contrôlés et
si les chemins restants sont attribués à une autre tâche.

Le tableau de migration des chemins résume au minimum :

- ancienne famille de chemins ;
- destination ;
- état `NOT_MOVED`, `PARTIAL`, `MOVED`, `DELETED` ou `KEPT_BY_DECISION` ;
- dernier task ID ;
- reliquat exact.

Il n'est pas nécessaire de lister chaque fichier une fois le déplacement d'une
famille terminé. Pendant un état `PARTIAL`, le reliquat doit en revanche être
explicite ou reproductible par une commande `rg`/`Get-ChildItem` consignée.

## 6. Événement de journal

Avant de céder la main, ajouter en tête du journal un événement suivant ce
format :

```markdown
### 2026-09-04T18:30:00+02:00 — P02-T02 — agent-name

- Statut : DONE_STRUCTURAL
- Point de départ : <SHA ou UNCOMMITTED + état pertinent>
- Changements : <responsabilités et chemins, sans récit chronologique>
- Décisions : <choix nouveaux, ou aucune>
- Préexistant préservé : <chemins utilisateur concernés>
- État cassé attendu : <symptômes précis, ou aucun connu>
- Contrôles exécutés : <commandes de lecture/inspection et résultats>
- Tests/builds : non exécutés, validation finale P10
- Prochaine tâche : P02-T03
- Action exacte : <une phrase impérative et bornée>
- Commande de reprise : `<commande de lecture seule>`
```

Le journal est antéchronologique : le dernier événement est toujours le
premier. Les anciennes entrées ne sont pas réécrites, sauf correction factuelle
signalée dans une nouvelle entrée.

## 7. Passer une tâche

La passation est valide si l'agent sortant :

1. arrête toute édition et relit le diff de ses chemins ;
2. met à jour l'état de la tâche et le registre des chemins ;
3. décrit les symptômes cassés intentionnels ;
4. liste les décisions et écarts au plan ;
5. remet `owner` à `UNASSIGNED`, sauf reprise déjà attribuée ;
6. définit une seule `active_task`, une seule `next_action` et un
   `resume_check` reproductible ;
7. ajoute l'événement de journal ;
8. ne crée un commit, ne change de branche ou ne publie que si l'instruction de
   la session l'autorise explicitement ; sinon `last_checkpoint` reste
   `UNCOMMITTED` et le worktree attendu est décrit.

L'agent entrant accepte la tâche en inscrivant son nom, le statut
`IN_PROGRESS`, l'heure et un événement court de prise en charge avant sa
première modification.

## 8. Décisions et écarts

Une décision est ajoutée à la table dédiée avec : identifiant `D-xxx`, date,
task ID, contexte, choix, conséquences, chemins concernés et besoin éventuel de
mettre à jour le plan.

Doivent obligatoirement devenir une décision :

- changement du graphe de dépendances cible ;
- déplacement d'une famille d'état vers un autre propriétaire ;
- maintien d'une ancienne racine ou création d'une nouvelle racine ;
- changement de format ou version persistée ;
- nouvelle dépendance de production ;
- réécriture d'un algorithme au lieu d'un déplacement structurel ;
- ordre de lots modifié.

Les choix locaux réversibles, tels qu'un nom de fonction interne, sont consignés
dans l'événement mais ne nécessitent pas de décision permanente.

## 9. Blocage et récupération

Un blocage décrit :

- le fait observé ;
- la commande ou le fichier qui le prouve ;
- les options sûres déjà examinées ;
- la décision externe exacte attendue ;
- les chemins à ne pas toucher pendant l'attente.

Sont notamment des motifs d'arrêt : soupçon de perte de donnée persistée,
modification utilisateur non attribuée sur les mêmes fichiers, nécessité d'une
évolution fonctionnelle, ou contradiction entre une règle temps réel et la
cible. Une compilation cassée attendue entre deux lots n'est pas un blocage.

La reprise après blocage crée un nouvel événement ; l'entrée originale reste
inchangée afin de préserver le raisonnement.

## 10. Clôture

Le dernier agent ne marque `COMPLETE` qu'après :

- exécution verte de `npm run verify` ;
- recette manuelle signée ;
- compatibilité des formats confirmée ;
- absence de reliquat et de tolérance temporaire ;
- documentation courante mise à jour ;
- inventaire final des modifications utilisateur préexistantes préservées.

Le journal reste ensuite dans le dépôt comme historique concis du chantier. Il
ne remplace pas l'architecture et la carte du code courantes.

