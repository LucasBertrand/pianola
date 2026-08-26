# Auto-fit viewport sur changement de clip et suppression de la persistance zoom/position

## Contexte

À chaque changement de clip, le viewport doit automatiquement calculer un zoom et un positionnement idéaux pour afficher l'intégralité du contenu du clip. Les marges verticales doivent inclure une quinte (±7 demi-tons) autour des notes extrêmes. Les données de zoom et de position ne doivent plus être persistées par clip.

## Changements proposés

### Composant 1 : Calcul de la vue idéale (auto-fit)

#### [NEW] [`compute-clip-fit-viewport.ts`](file:///c:/Users/Bebou/Documents/DEV/PianoRoll/src/editor/viewport/compute-clip-fit-viewport.ts)

Nouvelle fonction pure `computeClipFitViewport` dans le module viewport, qui :

1. **Scanne toutes les notes** du clip actif pour déterminer :
   - `minPitch` et `maxPitch` (pitches extrêmes)
   - `maxEndTick` (tick de fin de la note la plus tardive)
2. **Ajoute un padding d'une quinte** (7 demi-tons) en haut et en bas, borné par la plage affichable (`lowestDisplayedMidiPitch` / `highestDisplayedMidiPitch`)
3. **Calcule le `zoomX`** pour que la durée totale du clip tienne dans le viewport width
4. **Calcule le `zoomY`** pour que la plage de pitches (avec padding) tienne dans le viewport height
5. **Calcule `scrollX = 0`** et le `scrollY` approprié pour centrer verticalement la plage de pitches
6. **Clip vide** (aucune note) : revient à la vue par défaut (plage centrale du piano)

> [!IMPORTANT]
> La fonction reçoit la largeur/hauteur du viewport, le clip complet et les constantes de la config. Elle n'a aucune dépendance DOM ou React.

---

### Composant 2 : Application au changement de clip

#### [MODIFY] [`create-app-runtime.ts`](file:///c:/Users/Bebou/Documents/DEV/PianoRoll/src/app/create-app-runtime.ts)

Dans le subscriber `projectStore.subscribe`, quand `activeClipId` change (lignes 128-141) :

- Au lieu de restaurer le viewport depuis `clipEditorStates`, **toujours appeler `computeClipFitViewport`** avec le nouveau clip et les dimensions courantes du viewport
- Les `clipEditorStates` continuent de stocker `pitchSnapSettings` et `gridSettings` par clip, mais **plus le viewport**
- Les méthodes `captureClipEditorStates` et `restoreClipEditorStates` ne capturent/restaurent plus le viewport (uniquement grid et pitchSnap)
- `duplicateClipEditorState` ne copie plus le viewport
- `createDefaultClipEditorRuntimeState` ne crée plus de viewport par défaut

#### [MODIFY] [`editor-runtime.ts`](file:///c:/Users/Bebou/Documents/DEV/PianoRoll/src/editor/runtime/editor-runtime.ts)

- Supprimer le champ `viewport` de `ClipEditorRuntimeState` (il ne contient plus que `pitchSnapSettings` et `gridSettings`)

> [!IMPORTANT]
> L'`EditorRuntime` aura besoin de connaître les dimensions courantes du viewport pour le calcul d'auto-fit. Le `ViewportController` maintient déjà `viewportWidth` et `viewportHeight`, mais le runtime n'y a pas accès directement. Pour résoudre cela, on ajoutera deux signaux `viewportWidth` et `viewportHeight` au runtime, mis à jour par le `ViewportController`.

---

### Composant 3 : Suppression de la persistance zoom/position

#### [MODIFY] [`project-persistence-model.ts`](file:///c:/Users/Bebou/Documents/DEV/PianoRoll/src/persistence/project-persistence-model.ts)

Supprimer de `ProjectClipWorkspaceState` les champs :
- `firstVisibleTick`
- `highestVisiblePitch`
- `horizontalZoom`
- `verticalZoom`

L'interface ne conserve que `pitchSnapSettings` et `gridSettings`.

#### [MODIFY] [`project-workspace-codec.ts`](file:///c:/Users/Bebou/Documents/DEV/PianoRoll/src/persistence/project-workspace-codec.ts)

- Adapter la lecture pour ignorer les anciens champs de zoom/position (migration silencieuse comme pour `playheadTick`)
- Ne plus exiger les champs supprimés lors du parsing

#### [MODIFY] [`project-workspace.ts`](file:///c:/Users/Bebou/Documents/DEV/PianoRoll/src/use-cases/persistence/project-workspace.ts)

- `createDefaultProjectWorkspace` : ne plus émettre les champs de zoom/position dans `ProjectClipWorkspaceState`
- `captureProjectWorkspace` / `toPersistentClipState` : ne plus capturer zoom/position (suppression de la fonction `toPersistentClipState`)
- `restoreProjectWorkspace` / `toRuntimeViewport` : ne plus restaurer le viewport depuis le workspace (suppression de la fonction `toRuntimeViewport`)

#### [MODIFY] [`portable-project-codec.ts`](file:///c:/Users/Bebou/Documents/DEV/PianoRoll/src/project-io/portable/portable-project-codec.ts)

- Adapter la sérialisation pour ne plus écrire les champs de zoom/position
- La lecture migre les anciens champs silencieusement

---

### Composant 4 : Propagation des dimensions viewport au runtime

#### [MODIFY] [`editor-runtime.ts`](file:///c:/Users/Bebou/Documents/DEV/PianoRoll/src/editor/runtime/editor-runtime.ts)

- Ajouter `viewportWidth: MutableRenderSignal<number>` et `viewportHeight: MutableRenderSignal<number>` à l'interface `EditorRuntime`

#### [MODIFY] [`create-app-runtime.ts`](file:///c:/Users/Bebou/Documents/DEV/PianoRoll/src/app/create-app-runtime.ts)

- Initialiser ces signaux avec les valeurs par défaut de `VIEWPORT_CONSTANTS`

#### [MODIFY] [`viewport-controller.ts`](file:///c:/Users/Bebou/Documents/DEV/PianoRoll/src/editor/viewport/viewport-controller.ts)

- Dans `updateDimensions`, mettre à jour `runtime.viewportWidth` et `runtime.viewportHeight`

---

## UI

Ajouter icone trigger auto-fit à coté du container pitch snap control

## Plan de vérification

### Tests automatisés

```bash
npx vitest run
```

Les tests existants doivent tous passer. De plus :

- Tests unitaires de `computeClipFitViewport` : clip vide, clip avec notes éparses, clip avec notes couvrant tout le piano, vérification du padding de 7 demi-tons
- Tests d'intégration : changement de clip → viewport auto-fitted
- Tests de persistence : round-trip sans champs viewport, migration silencieuse des anciens formats
