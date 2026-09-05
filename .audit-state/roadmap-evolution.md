# Feuille de route évolutive

Dernière mise à jour : 2026-09-04  
Phase active : cartographie (prochaine session)  
Statut global : en cours

## Mission

Évaluer puis améliorer l'architecture (clean) et le langage du code sans modifier les
comportements hors périmètre ni engager de refonte globale non démontrée. La
structure obtenue doit réduire la charge cognitive des personnes qui lisent,
modifient et testent le produit.

## Principes de décision

- Chaque défaut est associé à une preuve, un impact et un propriétaire cible.
- Les dépendances sont corrigées par petites tranches fonctionnelles vérifiables.
- Un renommage doit améliorer le langage métier, pas seulement raccourcir un nom.
- Aucun déplacement massif n'est entrepris avant d'avoir identifié les flux,
  tests et états concernés.
- La charge cognitive humaine est un critère de conception : un propriétaire,
  un nom et un chemin doivent permettre de retrouver une responsabilité sans
  reconstruire mentalement l'architecture entière.
- Une découpe de module ou de dossier n'est retenue que si elle améliore la
  localité du code, la découvrabilité et le modèle mental des contributeurs.
- Les changements préexistants du worktree sont préservés.

## Architecture de référence provisoire

- `domain` : règles et invariants métier
- `editor-core` : mécanismes d'édition purs
- `application` : cas d'usage, orchestration et ports
- `infrastructure` : adaptateurs techniques
- `presentation` : React, DOM et Canvas
- `bootstrap` : composition et injection

Cette cible reste provisoire jusqu'à validation de ses frontières dans le code.

## Orientation stratégique : résorption de `editor-core`

À terme, le dossier `src/editor-core/` a vocation à disparaître. Son contenu
sera réparti entre les couches existantes selon sa responsabilité réelle, plutôt
que conservé comme un noyau transversal générique.

Cette orientation ne prescrit pas un déplacement mécanique. Pour chaque module,
l'audit déterminera son propriétaire cible, son vocabulaire explicite et ses
consommateurs : règle ou invariant métier dans `domain`, orchestration dans
`application`, adaptation d'interaction et état visuel transitoire dans
`presentation`, ou adaptateur technique dans `infrastructure`.

La résorption ne sera engagée que si elle réduit effectivement la charge
cognitive : une personne doit pouvoir déduire où chercher et où modifier une
capacité sans connaître l'ancien découpage. Elle ne doit pas créer de dossiers
transversaux vagues, de dépendances inversées ni de duplication de primitives.

## Étapes

| ID | Étape | Statut | Critère de sortie |
| --- | --- | --- | --- |
| A1 | Cartographier modules, flux et dépendances | planifié | graphe des dépendances et principaux flux documentés |
| A2 | Inventorier les violations et anomalies de nommage | à explorer | constats prouvés, classés par sévérité et effort |
| A3 | Définir les tranches de restructuration | à explorer | backlog ordonné avec critères de non-régression |
| A3.1 | Concevoir la résorption de `editor-core` | à explorer | cartographie module → propriétaire cible, flux affectés et critères de lisibilité validés |
| A4 | Refactorer itérativement | à explorer | chaque tranche testée et documentée |
| A5 | Renforcer les garde-fous | à explorer | frontières et conventions vérifiées automatiquement |
| A6 | Vérifier l'architecture obtenue | à explorer | audit final et dette résiduelle explicités |

## Classification des constats

- `critique` : corruption d'état, dépendance cyclique ou impossibilité de tester
- `majeur` : inversion de dépendance, responsabilité mal placée, couplage fort
- `modéré` : ambiguïté de contrat, duplication, frontière poreuse
- `mineur` : nomenclature ou organisation locale

Format d'identifiant : `ARCH-001`, `NAME-001`, `STATE-001`, `TEST-001`.

## Arbitrages de nommage

| ID | Terme actuel | Décision | Justification | Statut |
| --- | --- | --- | --- | --- |
| — | — | Aucun arbitrage effectué | Exploration non commencée | — |

## Prochaine session

1. Produire l'inventaire des modules et de leurs imports.
2. Repérer cycles, imports inversés, fichiers volumineux et abstractions génériques.
3. Cartographier `editor-core`, ses consommateurs et la charge cognitive induite
   par son découpage actuel.
4. Suivre deux ou trois flux verticaux de bout en bout.
5. Établir le premier backlog de constats, sans refactorer prématurément.
