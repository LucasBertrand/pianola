# Validation de la migration

## Validation rapide

À exécuter après une sous-étape locale :

```powershell
npm run typecheck
npm run check:boundaries
```

Ajouter le test unitaire ciblé du propriétaire modifié.

## Couverture préalable aux découpages

Avant de découper un point de concentration listé dans `BASELINE.md` :

1. produire sa couverture de lignes et branches avec un fournisseur compatible
   avec la version de Vitest du projet ;
2. relier les tests existants aux comportements publics du module ;
3. ajouter des tests de caractérisation pour tout comportement critique non
   couvert ;
4. consigner le rapport ou la matrice, ainsi que les lacunes acceptées, dans
   `STATUS.md`.

L'absence d'un rapport global n'empêche pas un lot sans découpage, mais une
couverture inconnue bloque le découpage de `PianoRollWorkspace.tsx`,
`time-map.ts`, `ClipInspector.tsx`, `InstrumentPresetDialog.tsx`,
`clip-commands.ts` ou `active-clip-command-helpers.ts`.

## Non-régression de rendu du lot 5

Le lot 0 définit un scénario reproductible sur un projet fixture : lecture du
transport, déplacement/zoom du viewport, survol et preview d'un geste. Mesurer
sur la même build de développement, avec le même navigateur et la même machine,
au moyen du React Profiler ou de compteurs de rendu temporaires :

- le nombre de commits de `PianoRollWorkspace` et des surfaces non concernées ;
- les notifications reçues par les sélecteurs dont la valeur ne change pas ;
- les longues frames ou saccades visibles pendant le scénario.

Au jalon 6 du lot 5, une mise à jour à fréquence frame ne doit produire aucune
notification d'un sélecteur inchangé ni rerendu des surfaces non consommatrices.
Comparer trois exécutions au relevé du lot 0 ; toute hausse reproductible de plus
de 10 % du nombre de commits ou des longues frames bloque la sortie jusqu'à
correction ou justification documentée. Les compteurs temporaires peuvent être
retirés après consignation des résultats ; les tests automatisés de stabilité
des snapshots et de non-notification restent dans le dépôt.

## Validation d'un lot

```powershell
npm run check:docs
npm run check:structure
npm run check:boundaries
npm run typecheck
npm test
npm run build
npm run test:worklet-build
```

`npm run verify` peut remplacer cette séquence une fois que sa composition couvre
bien tous les contrôles souhaités.

## Recherches obligatoires

Adapter les motifs au lot :

```powershell
rg "ancien-nom|ancien-chemin" src tests docs
rg "utils|helpers|common|shared|types|data" src
```

Une occurrence décrivant un chemin source dans `MAPPING.md` peut être légitime.
Toute occurrence produit d'une migration historique, d'un ancien codec ou d'un
chemin `legacy` bloque en revanche la sortie de la migration.

## Critères architecturaux

- aucune dépendance interdite selon `TARGET.md` ;
- aucun nouveau cycle d'import ;
- aucun accès navigateur depuis `domain`, `application` ou `editor-core` ;
- aucune dépendance React depuis ces mêmes couches ;
- aucun import de `bootstrap` depuis une autre couche ;
- les ports sont déclarés côté application, leurs implémentations côté
  infrastructure ;
- chaque fichier déplacé possède un propriétaire évident et un nom fonctionnel.

## Critères de compatibilité

- la nouvelle baseline de version est unique et documentée ;
- les projets locaux incompatibles sont réinitialisés de manière explicite et
  testée ;
- les anciens fichiers `.pianola` sont rejetés avec une erreur claire, sans
  tentative de migration ;
- export puis réimport conserve document et workspace attendus ;
- l'Undo/Redo n'intègre pas l'état de workspace persisté ;
- le MIDI et l'AudioWorklet passent leurs régressions ;
- aucune modification fonctionnelle non prévue n'est incluse.

## Preuves à consigner

Pour chaque lot, reporter dans `STATUS.md` :

- commandes réellement exécutées ;
- statut succès/échec ;
- tests ciblés ajoutés ou modifiés ;
- couverture ou matrice de comportements avant tout découpage ;
- pour le lot 5, protocole, mesures de rendu et comparaison à la baseline ;
- anciens chemins encore présents et justification ;
- alias temporaires et lot prévu pour leur suppression.
