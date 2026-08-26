# Baseline architecturale

Ce diagnostic décrit le point de départ observé le 2026-08-26. Il constitue une
hypothèse à vérifier avant chaque lot, pas une vérité immuable.

## Synthèse

Pianola possède déjà une séparation macroscopique explicite et documentée :
`domain`, `use-cases`, `editor`, `ui`, `audio` et `project-io`. Le contrôle des
frontières passait sur 316 fichiers source lors de l'audit.

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
| `ui` | 116 |
| `domain` | 50 |
| `audio` | 32 |
| `project-io` | 31 |
| `editor` | 30 |
| `use-cases` | 20 |
| `persistence` | 13 |
| `config` | 11 |
| `pwa` | 8 |

Points de concentration observés :

- `PianoRollWorkspace.tsx` : plus de 1 300 lignes et 61 imports internes ;
- `time-map.ts` : plus de 1 000 lignes ;
- `ClipInspector.tsx`, `InstrumentPresetDialog.tsx` et `clip-commands.ts` :
  plus de 700 lignes chacun ;
- 23 fichiers directement sous `ui/piano-roll/interactions` ;
- 20 fichiers directement sous `ui/piano-roll`.

Ces valeurs doivent être recalculées avant de servir de critère à un lot.

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

Le legacy et le parsing courant doivent être séparés avant tout nettoyage.

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

## Dette documentaire initiale

Au moment de la préparation, `check:docs` ne passe pas en raison de documents
préexistants : liens absolus d'un ancien audit et références à deux guides
supprimés du worktree. Les documents canoniques de ce dossier n'ajoutent pas de
nouvelle violation connue.
