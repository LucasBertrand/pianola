# Architecture cible

## Arborescence

```text
src/
├── bootstrap/
│   ├── main.tsx
│   ├── App.tsx
│   └── create-editor-session.ts
├── domain/
│   ├── project/
│   ├── clips/
│   ├── notes/
│   ├── instruments/
│   ├── timeline/
│   ├── playback/
│   ├── harmony/
│   └── commands/
├── application/
│   ├── ports/
│   ├── history/
│   ├── projects/
│   ├── piano-roll/
│   └── project-files/
├── editor-core/
│   ├── geometry/
│   ├── interactions/
│   ├── selection/
│   ├── viewport/
│   └── signals/
├── presentation/
│   ├── home/
│   ├── editor/
│   ├── inspector/
│   ├── transport/
│   ├── project-files/
│   ├── dialogs/
│   ├── diagnostics/
│   └── styles/
└── infrastructure/
    ├── audio/
    ├── persistence/
    ├── project-files/
    │   ├── pianola/
    │   └── midi/
    └── browser/
```

Cette arborescence est une destination logique. Les noms précis de fichiers
peuvent évoluer si leur responsabilité est mieux exprimée, sans modifier la
direction des dépendances.

## Matrice de dépendances

| Source | Dépendances internes autorisées |
| --- | --- |
| `domain` | `domain` uniquement |
| `editor-core` | `editor-core`, `domain` |
| `application` | `application`, `domain`, ports ciblés de `editor-core` |
| `infrastructure` | `infrastructure`, `application` pour implémenter ses ports, `domain` pour les formats nécessaires |
| `presentation` | `presentation`, `application`, `editor-core`, `domain` |
| `bootstrap` | toutes les couches, uniquement pour les assembler |

### Interdictions

- `domain` ne connaît ni React, ni navigateur, ni infrastructure ;
- `editor-core` ne connaît ni React, DOM, Canvas, Web Audio, ni application ;
- `application` ne connaît aucun composant React ni API navigateur ;
- `infrastructure` ne dépend pas de `presentation` ou `bootstrap` ;
- aucun dossier ne dépend de `bootstrap` ;
- les cycles d'import entre fichiers sont interdits, y compris les cycles
  uniquement typés lorsqu'une extraction simple peut les éviter.

## Règle de placement

```text
Invariant ou calcul musical pur       → domain
Intention utilisateur sans React      → application
Géométrie, sélection ou geste pur     → editor-core
Composant, hook, DOM, Canvas ou style → presentation
IndexedDB, Worker, MIDI ou Web Audio  → infrastructure
Création et injection des objets      → bootstrap
```

## Réactivité de la présentation

La présentation ne possède pas de store UI global par défaut. Elle combine
quatre mécanismes selon la durée de vie et la fréquence de l'état :

| État | Mécanisme cible |
| --- | --- |
| local à une surface ou à un dialogue | `useState` ou reducer colocalisé |
| partagé et visible dans du JSX | propriétaire canonique lu par un hook `useSyncExternalStore` avec sélecteur ciblé |
| service, commandes ou capacité stable | contexte React étroit servant uniquement à l'injection |
| viewport, playhead ou preview à haute fréquence | signal du runtime et invalidation directe DOM/Canvas |

Un contexte ne transporte jamais un snapshot global du workspace. Un hook
sélecteur doit retourner une référence stable lorsque sa projection n'a pas
changé. Zustand ou un autre store UI externe ne fait pas partie de la cible de
cette migration ; son adoption demanderait une nouvelle décision documentée et
un domaine d'état sans propriétaire existant.

## Vocabulaire cible

| Concept | Sens unique attendu |
| --- | --- |
| `ProjectDocument` | document musical durable et annulable |
| `EditorSessionState` | document ouvert et état minimal de session |
| `PersistedEditorWorkspace` | contexte d'édition persisté hors Undo/Redo |
| `ActiveClipSelection` | sélection du clip actif dans la session |
| `InstrumentTrack` | notes d'un instrument au sein d'un clip |
| `ScaleMarker` | marqueur de gamme musicale dans la time map |
| `ProjectRepository` | port applicatif de stockage des projets |
| `PianolaProjectCodec` | codec du format utilisateur `.pianola` |
