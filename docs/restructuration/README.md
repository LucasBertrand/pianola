# Plan directeur de restructuration

Ce dossier est le livrable opératoire du chantier structurel de Pianola. Il
décrit une cible, un ordre de migration et un protocole de reprise. Il reste
volontairement autonome : le dossier historique `docs/migration/` peut être
supprimé sans rendre ce plan inutilisable.

La source principale est `diagnostic-consolide-2026-09-04`, confrontée à
l'arborescence et aux guides du dépôt. Les cinq audits sous
`docs/migration/audit` n'ont servi que d'archive historique. Le plan retient les
constats consolidés et écarte les conclusions fondées seulement sur la taille
des fichiers ou sur une lecture dogmatique des couches.

## Résultat visé

Pianola devient un monolithe modulaire organisé par capacités. Un développeur
part d'un terme produit, trouve son module à la racine de `src/`, puis suit un
flux complet sans traverser systématiquement `domain`, `application`,
`editor-core`, `presentation` et `infrastructure`.

La cible comporte six propriétaires explicites :

| Module | Question à laquelle il répond |
| --- | --- |
| `app` | Comment l'application démarre-t-elle et assemble-t-elle les capacités ? |
| `project` | Qu'est-ce qu'un projet musical et comment une intention durable le modifie-t-elle ? |
| `editor` | Comment l'utilisateur voit-il et manipule-t-il un projet ? |
| `audio` | Comment un projet devient-il une lecture Web Audio temps réel ? |
| `project-io` | Comment un projet entre-t-il, sort-il ou persiste-t-il ? |
| `ui` | Quelles primitives visuelles sont réellement partagées ? |

Ce choix n'essaie pas de reproduire quatre couches canoniques. Il conserve en
revanche les propriétés qui ont une valeur concrète : calcul musical pur,
gestes sans DOM, transactions atomiques, snapshots Canvas explicites,
validation stricte des données et moteur audio préalloué.

## Critères de réussite globaux

Le chantier est terminé lorsque :

- les six anciennes racines architecturales ont disparu, à l'exception de
  `src/main.tsx` qui reste le point d'entrée ;
- chaque flux majeur possède un point d'entrée nommé dans un seul module ;
- le store historisé ne contient que `ProjectDocument` et ne retire/réinjecte
  plus de `workspace` pendant Undo/Redo ;
- les hooks React n'instancient plus les adaptateurs navigateur et ne
  construisent plus les séquences de commandes des intentions durables ;
- `editor-core` n'existe plus comme catégorie hybride, mais ses algorithmes purs
  restent sans React, DOM, Canvas ni Web Audio ;
- les formats `.pianola`, IndexedDB, réglages et MIDI conservent leurs contrats
  externes, sauf décision de produit explicite et migration versionnée séparée ;
- les anciens chemins, façades de transition et code produit réservé aux tests
  ont été retirés ;
- `npm run verify` réussit et la recette manuelle finale Canvas, tactile,
  responsive et Web Audio est signée.

La facilité de navigation se contrôle aussi qualitativement : modifier une
note, un clip, un marqueur, la lecture ou un import doit demander au plus un
point d'entrée de capacité et un saut vers son mécanisme interne. Ce critère
n'est pas transformé en quota artificiel de fichiers ou de lignes.

## Ordre de lecture

1. [Architecture cible](architecture-cible.md) : arborescence, dépendances,
   états et conventions.
2. [Cartographie de migration](cartographie-migration.md) : destination des
   zones actuelles et traitement des hotspots diagnostiqués.
3. [Séquence des chantiers](sequence-chantiers.md) : lots ordonnés, tâches et
   critères de passage.
4. [Protocole de passation](protocole-passation.md) : méthode de reprise par un
   agent démarrant à froid.
5. [MIGRATION_STATE](MIGRATION_STATE.md) : unique état opérationnel à tenir à
   jour pendant l'exécution.
6. [Points d'attention](points-attention.md) : compromis, pièges, invariants et
   recette finale.

## Politique d'exécution

Le chantier se déroule sur une branche dédiée. Après la baseline, aucune
compilation ni suite de tests n'est exigée entre les lots : un état
temporairement non fonctionnel est accepté et doit simplement être décrit dans
`MIGRATION_STATE.md`. Les contrôles complets sont regroupés dans le dernier lot.

Cette liberté ne dispense pas de garder des lots lisibles. Chaque changement
doit appartenir à un identifiant de tâche, distinguer déplacement mécanique et
changement de responsabilité, et laisser une instruction de reprise exacte.

## Hors périmètre

- aucune fonctionnalité produit nouvelle ;
- aucune réécriture du DSP, du modèle temporel ou des algorithmes de collision
  au seul motif de la restructuration ;
- aucune nouvelle dépendance de production sans besoin démontré ;
- aucune suppression de champ persistant inutilisé sans décision produit,
  version de schéma et migration explicites ;
- aucune suppression de `docs/migration/` par les agents de ce chantier : cette
  archive reste sous le contrôle de son propriétaire.
