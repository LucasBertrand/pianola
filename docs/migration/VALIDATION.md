# Validation de la migration

## Validation rapide

À exécuter après une sous-étape locale :

```powershell
npm run typecheck
npm run check:boundaries
```

Ajouter le test unitaire ciblé du propriétaire modifié.

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
rg "ancien-nom|ancien-chemin" src tests docs idea/migration
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
- anciens chemins encore présents et justification ;
- alias temporaires et lot prévu pour leur suppression.
