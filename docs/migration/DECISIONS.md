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
`native` ne doit subsister ni dans les chemins courants ni dans une zone de
compatibilité historique.

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

## D-008 — Gestion hybride de l'état de présentation

La décomposition de `PianoRollWorkspace` ne doit pas introduire de store UI
global supplémentaire. En particulier, Zustand n'est pas ajouté pendant cette
migration : `ProjectStore` et les signaux du runtime couvrent déjà les états
partagés et l'ajout d'un troisième modèle créerait des propriétaires concurrents.

Chaque état conserve un propriétaire canonique unique. L'état local reste chez
la surface qui le possède, les services partagés sont injectés sans dupliquer
leur état, et les valeurs à haute fréquence ne doivent pas provoquer un rendu
global du workspace.

Le choix d'un store UI externe ne pourra être réévalué qu'après identification
d'un domaine d'état UI partagé, autonome, durable et sans propriétaire naturel
dans les stores ou signaux existants. Les recettes d'abonnement, de sélection et
d'invalidation qui mettent en œuvre cette décision sont documentées comme
lignes directrices révisables dans `TARGET.md` et `ROADMAP.md`.

## D-009 — Réinitialisation du versionnement et absence de legacy

La migration réinitialise le versionnement des projets persistés et du format
`.pianola`. Le nouveau schéma constitue le seul format supporté après la
migration.

- les projets locaux et fichiers exportés avec les anciens schémas ne sont pas
  migrés et ne sont pas garantis lisibles ;
- aucun lecteur d'ancienne version, migration historique, dossier `legacy`,
  alias de codec ou façade de compatibilité ne reste dans la cible finale ;
- les numéros et constantes de version repartent d'une nouvelle baseline
  explicitement définie par le nouveau codec ;
- les tests de compatibilité ascendante sont supprimés ou remplacés par des
  tests qui rejettent clairement les formats non supportés ;
- les données locales incompatibles sont réinitialisées selon une politique
  explicite et testée, sans tentative de conversion silencieuse.

Les alias temporaires nécessaires aux renommages de code restent permis par
D-005 pendant un lot, mais doivent disparaître avant sa sortie ou au plus tard
au lot 8. Ils ne constituent pas une compatibilité de données.
