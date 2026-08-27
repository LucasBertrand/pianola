# Baseline architecturale

Ce diagnostic décrit le point de départ observé le 2026-08-27. Il constitue une
hypothèse à vérifier avant chaque lot, pas une vérité immuable.

## Synthèse

Pianola possède déjà une séparation macroscopique explicite et documentée :
`domain`, `use-cases`, `editor`, `ui`, `audio` et `project-io`. Le contrôle des
frontières passe sur 321 fichiers source lors de l'audit.

Le problème principal est la coexistence de plusieurs taxonomies :

- couches architecturales : `domain`, `use-cases`, `ui` ;
- sous-systèmes techniques : `audio`, `pwa`, `persistence`, `project-io` ;
- noyaux transverses : `editor`, `music` ;
- catégories horizontales : `config`, `shared`.

La conséquence est une propriété incertaine pour les flux transversaux, surtout
la persistance et les fichiers projet.

## Mesures initiales

| Zone | Fichiers TypeScript/TSX |
| --- | ---: |
| `ui` | 119 |
| `domain` | 52 |
| `audio` | 32 |
| `project-io` | 31 |
| `editor` | 30 |
| `use-cases` | 20 |
| `persistence` | 13 |
| `config` | 11 |
| `pwa` | 8 |

Points de concentration observés :

- `PianoRollWorkspace.tsx` : plus de 1 400 lignes et 65 imports ;
- `time-map.ts` : plus de 1 300 lignes ;
- `ClipInspector.tsx`, `InstrumentPresetDialog.tsx` et `clip-commands.ts` :
  plus de 880 lignes chacun, et plus de 1 000 pour `clip-commands.ts` ;
- 23 fichiers directement sous `ui/piano-roll/interactions` ;
- 20 fichiers directement sous `ui/piano-roll`.

Ces valeurs doivent être recalculées avant de servir de critère à un lot.

## Couverture des points de concentration

La couverture par fichier n'est pas connue au moment de cette préparation.
Vitest exécute les tests, mais aucun fournisseur ni rapport de couverture n'est
configuré. La présence d'un test au nom proche ne prouve donc pas quelles
branches du module sont exercées.

Inventaire initial à confirmer au lot 0 :

| Module | Signal de test actuellement visible | Risque à lever |
| --- | --- | --- |
| `domain/transport/time-map.ts` | test unitaire colocalisé et usages dans plusieurs intégrations | couverture des branches à mesurer |
| `domain/commands/clip-commands.ts` | tests de familles de commandes, sans test homonyme | chemins réellement exercés à cartographier |
| `domain/commands/active-clip-command-helpers.ts` | test unitaire colocalisé | couverture des invariants à mesurer |
| `ui/piano-roll/PianoRollWorkspace.tsx` | aucun test homonyme | caractérisation des flux et rerendus requise avant le lot 5 |
| `ui/inspector/clips/ClipInspector.tsx` | tests de capacités voisines | comportement du composant à caractériser avant découpage |
| `ui/dialogs/InstrumentPresetDialog.tsx` | tests métier des presets, sans test homonyme | comportement du dialogue à caractériser avant découpage |

Le lot 0 doit produire un rapport de couverture ciblé compatible avec Vitest ou,
si l'instrumentation est temporairement impossible, une matrice explicite des
comportements couverts et manquants. Les lacunes qui touchent un futur découpage
doivent recevoir des tests de caractérisation avant ce découpage.

## Ambiguïtés confirmées

### Projet et workspace

- `ProjectDocument` représente le document musical durable ;
- `ProjectState` étend ce document avec un `WorkspaceState` minimal ;
- `ProjectWorkspaceState` représente un contexte d'édition persisté plus riche ;
- `PianoRollWorkspace` est un composant React.

Le mot `workspace` possède donc plusieurs sens et `ProjectState` masque la
frontière entre document et session.

### Format `.pianola`

Le guide de `project-io` présente `native/` comme déconnecté, mais le produit
courant en dépend encore :

- le codec portable appelle `native/parsing/parse-project` ;
- le Worker de persistance appelle également ce parseur ;
- le workflow de fichier portable utilise des constantes et métadonnées
  préfixées `NATIVE_PROJECT_*`.

La logique de parsing encore nécessaire au nouveau format doit être extraite,
puis les anciens codecs et le dossier `native` doivent être supprimés sans
conserver de couche de compatibilité.

### Persistance

La capacité est répartie entre :

- `use-cases/persistence` pour l'autosave et le workspace ;
- `persistence` pour ports, modèles, codecs et adaptateurs mémoire ;
- `pwa/persistence` pour IndexedDB et Worker ;
- `project-io/local` et `project-io/portable` pour d'autres codecs.

### Cœur d'édition

`editor/runtime/editor-runtime.ts` importe un port de `use-cases`, tandis que
les cas d'usage importent plusieurs types de l'éditeur. Ce n'est pas un cycle de
fichiers observé, mais la direction de couche est ambiguë.

Un cycle de fichiers a été observé entre `editor/geometry/spatial-index.ts` et
`editor/geometry/spatial-index-search.ts`. Le retour est uniquement typé, mais
doit être extrait proprement.

## Qualités à préserver

- domaine indépendant de React et du navigateur ;
- UI déjà organisée par surfaces fonctionnelles ;
- modules et tests majoritairement proches de leur propriétaire ;
- conventions `kebab-case.ts`, `PascalCase.tsx` et `useCamelCase.ts` ;
- suffixes précis tels que `codec`, `policy`, `repository`, `controller`,
  `port` et `workflow` ;
- documentation locale par grande zone ;
- tests d'intégration couvrant les flux audio, domaine, MIDI et interaction.

## État documentaire initial

`check:docs` passe sur les 29 fichiers Markdown présents. `npm run verify`
inclut ce contrôle par l'intermédiaire de `check:structure` avant les validations
techniques.
