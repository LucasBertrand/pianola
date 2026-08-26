# Décisions validées

Ce fichier contient les décisions déjà arbitrées. Un agent ne doit pas les
rouvrir sans demande explicite de l'utilisateur.

## D-001 — Architecture hybride

Les couches sont visibles au premier niveau et les capacités métier structurent
l'intérieur de chaque couche. Pianola ne sera pas réorganisé exclusivement par
type technique ni exclusivement en vertical slices.

## D-002 — `ScaleMarker` est conservé

Le nom `ScaleMarker` est jugé suffisamment clair dans le contexte du produit.
Il ne doit pas être renommé en `TonalScaleMarker` pendant cette migration.

Cette décision s'applique au type, aux commandes, aux fichiers et aux noms de
tests associés.

## D-003 — Le format utilisateur s'appelle `.pianola`

Le format courant doit employer le vocabulaire `Pianola project file`. Le terme
`native` est réservé, si nécessaire, à une compatibilité historique clairement
isolée sous `migrations/legacy-*`.

## D-004 — Propriété des couches

- `domain` possède les invariants et concepts musicaux ;
- `application` possède les intentions, ports et orchestrations sans framework ;
- `editor-core` possède la mécanique d'édition sans React ni DOM ;
- `presentation` possède React, DOM, Canvas et CSS ;
- `infrastructure` possède IndexedDB, Worker, Web Audio, MIDI et codecs ;
- `bootstrap` possède uniquement le démarrage et l'assemblage.

## D-005 — Pas de big bang

La migration se fait par lots indépendants. Le code doit rester compilable et
testable à la fin de chaque lot. Les anciens chemins peuvent recevoir des alias
temporaires, mais chaque alias doit avoir un lot de suppression identifié.

## D-006 — Tests

Les tests unitaires restent colocalisés avec leur propriétaire. Les scénarios
traversants restent sous `tests/integration` et les tests architecturaux sous
`tests/architecture` lorsque cette zone sera créée.

## D-007 — Conventions de fichiers

- modules TypeScript : `kebab-case.ts` ;
- composants React : `PascalCase.tsx` ;
- hooks React : `useCamelCase.ts` ;
- tests : nom du module suivi de `.test.ts` ou `.test.tsx` ;
- pas de nouveaux `utils`, `helpers`, `common`, `shared`, `types` ou `data`
  sans responsabilité plus précise.
