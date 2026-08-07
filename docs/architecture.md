# Architecture de Pianola

Ce document décrit les frontières internes de Pianola et les règles à suivre
pour faire évoluer l'application sans recréer les couplages historiques. Il
complète le `README.md`, consacré à l'installation, au déploiement et à la
maintenance courante.

## Principes directeurs

Pianola utilise une architecture en couches légère. Il ne s'agit pas
d'appliquer un framework d'architecture, mais de protéger trois propriétés
essentielles :

1. la musique et les commandes restent testables sans navigateur ;
2. les gestes à haute fréquence ne provoquent pas de rendu React ;
3. chaque action validée devient une unique transaction Undo/Redo.

La direction normale des dépendances est la suivante :

```text
config
  ↓
domain ← music ← geometry
  ↓        ↓        ↓
application      interaction/core
       ↘          ↙
        interaction
             ↓
             ui
             ↓
             app (composition root)
```

Une couche inférieure ne doit jamais importer un composant ou un hook React.
Les accès au DOM restent dans `src/ui`. La Web Audio API reste dans
`src/audio`.

## Responsabilités des dossiers

### `src/domain`

Contient les données durables et les règles métier : modèle immuable,
commandes, reducer, validation, collisions et historique. Une modification de
`ProjectState` doit normalement passer par une commande du domaine.

Cette couche ne connaît ni React, ni le DOM, ni Canvas, ni Web Audio.

### `src/application`

Orchestre des intentions utilisateur sans connaître leur représentation
visuelle :

- `EditorCommandService` attribue les identifiants de transaction et constitue
  l'unique port de mutation utilisé par l'éditeur ;
- `EditorSelection` possède la représentation canonique de la sélection ;
- `EditorSelectionRequests` transporte les intentions ponctuelles de sélection
  sans détourner un signal de rendu ;
- `note-edit-commands.ts` et `selection-edit-plans.ts` construisent les
  transactions complexes avant leur envoi au store ;
- `NoteGestureWorkflow` valide et finalise les déplacements, resize et dessins
  de notes, puis réconcilie la sélection après la transaction ;
- `note-collision-resolution.ts` définit le contrat entre une collision métier
  et la modale qui recueille le choix de l'utilisateur.

Une fonction de cette couche doit être testable avec de simples objets
TypeScript.

### `src/music`

Contient les concepts musicaux transversaux. Le snap tonal a été déplacé ici
car il est utilisé par le domaine d'édition, le rendu, la persistance et les
gestes ; il ne s'agit pas d'une responsabilité UI.

### `src/geometry`

Contient les conversions ticks/pixels, les rectangles visibles et l'index
spatial. Le type `Rect` appartient à cette couche : le domaine géométrique ne
doit pas dépendre d'un composant Canvas.

### `src/interaction/core`

Contient les entrées et calculs de gestes indépendants du navigateur :

- échantillon pointeur normalisé (`PointerSample`) ;
- brouillon mutable et machine à états des gestes ;
- quantification, bornes de sélection et de resize ;
- calcul du pinch/pan et verrouillage d'axe ;
- masque observable des notes temporairement cachées.

Ces modules n'utilisent pas `PointerEvent`, `HTMLElement`, React ou les API du
navigateur.

### `src/interaction`

Contient la session longue durée d'un piano roll et les requêtes de hit-test.
`PianoRollInteractionSession` possède le brouillon, la sélection, les buffers
réutilisables, le convertisseur et le snapshot nécessaire au passage d'un à
deux doigts. Son identité reste stable pendant toute la vie du piano roll.

### `src/ui`

Adapte les couches précédentes au navigateur :

- `pointer-sample.ts` traduit les événements natifs en `PointerSample` ;
- `useInteractionManager.ts` gère les listeners, le pointer capture, les
  timers et `requestAnimationFrame` ;
- `usePianoRollEvents.ts` adapte les résultats de la machine aux workflows
  applicatifs et au feedback visuel, sans porter la validation métier ;
- `DomInteractionVisualController` peint les ghosts, poignées et lasso dans le
  DOM sans passer par un state React ;
- `PianoRollLayers.tsx` compose la grille, les notes et l'overlay ;
- `PianoRollRuntimePort` limite le contrat partagé entre cette composition et
  le runtime concret.

React ne doit gérer que le montage, les formulaires et les abonnements à basse
fréquence. Les notes ne deviennent jamais une liste de composants React.

### `src/app`

Est la racine de composition. `editor-runtime.ts` construit les services et
signaux d'une instance d'éditeur. `demo-scene.ts` ne contient plus que les
fixtures de projet initial et vierge.

Cette séparation prépare un futur système d'onglets : chaque onglet pourra
posséder son propre `EditorRuntime` sans dupliquer les services globaux de
l'application.

## Cycle d'un geste d'édition

```text
PointerEvent natif
  → PointerSample immuable
  → useInteractionManager (capture, long press, multi-touch)
  → stratégie du piano roll
  → PianoRollInteractionSession + draft mutable
  → DomInteractionVisualController (feedback immédiat)
  → NoteGestureWorkflow au pointerup
  → validation métier et plan de commandes applicatif
  → EditorCommandService
  → ProjectStore / reducer / Undo-Redo
```

Pendant `pointermove`, le projet global ne doit pas être muté. La sélection et
le brouillon sont transitoires ; le store n'est modifié qu'après validation.

## État canonique et signaux

- `ProjectState` est la source de vérité persistante.
- `EditorSelection` est la source de vérité transitoire de la sélection. Ne pas
  maintenir en parallèle un `Set` et un tableau indépendants.
- Les `RenderSignal` servent uniquement à publier une valeur graphique qui
  change souvent. Ils ne sont pas des bus de commandes.
- `EditingNoteMask` signale au Canvas quelles notes masquer pendant que leur
  ghost est affiché.
- `EditorSelectionRequests` représente une intention ponctuelle, y compris si
  deux requêtes identiques se succèdent.

## Ajouter une interaction

1. Définir d'abord l'intention et les invariants dans `domain` ou
   `application`.
2. Extraire les calculs déterministes dans `interaction/core` et les tester.
3. Ajouter la transition dans la stratégie de `usePianoRollEvents`.
4. Ajouter uniquement le feedback visuel dans
   `DomInteractionVisualController`.
5. Envoyer une seule transaction lors de la validation du geste.
6. Vérifier souris, tactile à un doigt, passage à deux doigts, annulation et
   voix verrouillée.

## Ajouter une commande

1. Étendre l'union `PianoRollCommand`.
2. Implémenter le cas dans le reducer pur.
3. Valider toutes les notes avant de produire l'état suivant.
4. Construire la commande depuis `src/application`, pas depuis le JSX.
5. Ajouter un test de transaction et un test Undo/Redo.

## Dette restante et ordre conseillé

La modularisation est volontairement progressive. Les prochains chantiers les
plus rentables sont :

1. extraire les workflows de validation encore locaux à
   `App.tsx`, notamment les opérations de projet et de voix ;
2. extraire les grands panneaux JSX de `App.tsx` vers des composants focalisés
   avec des props explicites ;
3. séparer les constantes produit, musicales, audio et visuelles aujourd'hui
   regroupées dans `program-constants.ts` ;
4. ajouter des tests navigateur ciblés pour pointer capture, long press et
   passage un doigt/deux doigts ;
5. déplacer progressivement les peintres Canvas hors de
   `PianoRollLayers.tsx`.

Ne pas entreprendre ces étapes sous forme de réécriture totale. Chaque
extraction doit conserver le comportement, ajouter ou maintenir un test, puis
passer `npm run verify` avant de poursuivre.
