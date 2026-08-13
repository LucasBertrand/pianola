# Migration P3 — éditeur et interface

État de référence : 13 août 2026. P3.1 à P3.5 sont terminées et le jalon M3 est
atteint.

## Résultat observable

L’éditeur conserve son comportement musical, mais ses chemins haute fréquence
ne sont plus concentrés dans trois composants de plus de 1 000 lignes. Le rendu,
les gestes, la sélection et le viewport possèdent désormais des frontières
explicites et testables. L’interface et ses styles sont rangés par capacité.

La commande de référence passe avec 162 fichiers contrôlés aux frontières,
trois configurations TypeScript, le build Vite et 102 scénarios Vitest.

## P3.1 — Ports de rendu Canvas

`PianoRollLayers.tsx` ne fait plus que monter les couches et l’overlay. Les
adaptateurs React et signaux vivent dans `ui/piano-roll/rendering/canvas-layer.tsx`.
Les peintres de grille, notes et ruler reçoivent des snapshots explicites et ne
lisent ni React ni le store global.

Le pipeline des notes est :

```text
RenderSignal + ProjectStore
  → adaptateur Canvas
  → requête SpatialIndex sur la région visible
  → NotePaintSnapshot préfiltré
  → peinture Canvas déterministe
```

Les largeurs de labels et le motif des notes verrouillées possèdent des caches
dédiés. Les labels ne sont peints que lorsque le zoom fournit l’espace utile.
L’overlay DOM reste propriétaire du focus, de la sélection, du lasso, des
ghosts et des autres informations accessibles.

## P3.2 — Interactions et sélection

`usePianoRollEvents.ts` est ramené au montage React, aux références et aux
abonnements. Ses trois anciennes responsabilités sont séparées :

- `piano-roll-gesture-strategy.ts` construit la stratégie consommée par le
  gestionnaire de pointeurs et conserve le hit-testing dans la géométrie ;
- `note-gesture-workflow-adapter.ts` traduit un geste terminé vers
  `NoteGestureWorkflow`, sans modifier le projet pendant `pointermove` ;
- `piano-roll-selection-controller.ts` expose le port impératif de sélection et
  centralise sa publication visuelle.

`PianoRollInteractionSession` reste l’unique propriétaire du draft mutable, de
la machine à états, de la sélection et des buffers de geste.

## P3.3 — Contrôleur de viewport

`editor/viewport/viewport-controller.ts` possède désormais :

- le bornage horizontal et vertical ;
- la publication conjointe du viewport et de la région visible ;
- le suivi du playhead et sa suspension pendant une manipulation directe ;
- le batching des quatre contrôles de scroll et de zoom ;
- la projection des valeurs de contrôles et des libellés de timeline.

Le contrôleur ne dépend ni de React ni du navigateur. `useViewportControls.ts`
conserve seulement les références DOM, `ResizeObserver`, `requestAnimationFrame`,
les listeners et les abonnements au runtime.

## P3.4 — Organisation fonctionnelle de l’UI

Les composants sont regroupés sans barrel global :

```text
src/ui/
├── dialogs/
├── editor-toolbar/
├── inspector/
│   ├── clips/
│   └── instruments/
├── piano-roll/
├── project-files/
├── shared/
└── transport/
```

Les hooks d’adaptation restent auprès de leur capacité. `App.tsx` référence les
propriétaires précis et demeure la racine de composition.

## P3.5 — Styles par propriétaire

`src/styles.css` est une entrée ordonnée de sept imports : tokens/reset, shell,
header/transport, piano roll, inspecteur, dialogues et responsive. Les règles
vivent dans `src/styles/`, ce qui permet de retrouver directement la feuille
propriétaire depuis une classe de composant tout en préservant l’ordre de la
cascade historique.

## Mesures de découpage

| Point d’entrée | Avant P3 | Après P3 |
| --- | ---: | ---: |
| `PianoRollLayers.tsx` | 1 022 lignes | 142 lignes |
| `usePianoRollEvents.ts` | 1 055 lignes | 210 lignes |
| `useViewportControls.ts` | 1 059 lignes | 385 lignes |
| `styles.css` | 2 585 lignes | 7 imports |

Sept scénarios de contrat ont été ajoutés : trois pour les peintres et quatre
pour le viewport, le formatage de timeline, le contrôleur de sélection et
l’adaptation transactionnelle des gestes.

## Vérification et risques acceptés

```bash
npm run verify
```

La validation P3 est verte avec 102 scénarios. Le bundle principal produit par
Vite atteint 516,12 kB minifiés et 146,71 kB gzip, ce qui conserve
l’avertissement de chunk supérieur à 500 kB.

P4 est délaissée par décision produit. Les tests Playwright, les budgets de
performance CI, l’accessibilité automatisée et les smoke tests Web Audio réels
ne sont donc pas engagés avant P5. Ces éléments restent documentés dans la
roadmap comme backlog réactivable et constituent des risques explicitement
acceptés, pas des critères de sortie manquants de P3.
