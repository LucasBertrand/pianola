# Architecture : Moteur de Gestes Interne (In-House Gesture Engine)

## 1. Objectif et Motivation

Actuellement, le fichier `gesture-state-machine.ts` mélange la gestion bas niveau des événements de pointage (coordonnées, identifiants de pointeurs, calcul de distance) avec la logique métier musicale du Piano Roll (ticks, pitch, snapping).

L'objectif de cette refonte est d'extraire la logique cinématique (inspirée de `@use-gesture/core`) dans un moteur générique et pur. Cela garantit que :
1. La physique du pointeur (vélocité, offset, détection de clic/drag) est testable indépendamment.
2. Le `PianoRollGestureStateMachine` ne manipule plus de pixels, mais uniquement des intentions gestuelles de haut niveau.
3. Le noyau `editor-core` reste 100% indépendant de React et du DOM, tout en bénéficiant d'une robustesse digne des meilleures bibliothèques d'interaction.

## 2. Architecture Proposée (Modèle en 3 Couches)

Nous proposons de scinder la gestion des interactions en trois strates distinctes :

### Couche A : `PointerTracker` (Le capteur)
Gère le cycle de vie brut d'un pointeur (down, move, up) et accumule l'historique des positions pour calculer la cinématique.

### Couche B : `GestureEngine` (Le moteur cinématique)
Transforme les données brutes du `PointerTracker` en un `GestureState` standardisé. C'est ici que l'on détermine si le mouvement a dépassé un certain seuil (pour différencier un *Tap* d'un *Drag*), ou que l'on calcule la vélocité.

### Couche C : `PianoRollIntentTranslator` (La logique métier musicale)
L'ancienne machine à états. Elle s'abonne ou consomme le `GestureState` pour le traduire en commandes musicales (`deltaTicks`, `deltaPitch`).

---

## 3. Définition des Contrats (Types)

### Le `GestureState` (Inspiré de `@use-gesture`)

```typescript
export interface GestureState {
  /** L'identifiant natif du pointeur (utile pour le multi-touch) */
  pointerId: number;
  
  /** Vrai si le pointeur est actuellement enfoncé */
  down: boolean;
  
  /** Vrai lors de la toute première frame du geste */
  first: boolean;
  
  /** Vrai lors de la toute dernière frame du geste (relâchement) */
  last: boolean;
  
  /** Vrai si le seuil de mouvement a été franchi (c'est un Drag, pas un clic) */
  active: boolean;
  
  /** Différence [x, y] par rapport au point d'origine du geste (PointerDown) */
  movement: [number, number];
  
  /** Position [x, y] globale accumulée (utile pour persister la position entre plusieurs gestes) */
  offset: [number, number];
  
  /** Vélocité [vx, vy] en pixels par milliseconde (pour l'inertie) */
  velocity: [number, number];
  
  /** Vrai si le geste a été relâché sans dépasser la tolérance de mouvement */
  tap: boolean;
}
```

---

## 4. Aperçu de l'Implémentation

### 4.1. Le Moteur Cinématique (`gesture-engine.ts`)

```typescript
export class GestureEngine {
  private origin: [number, number] = [0, 0];
  private lastPosition: [number, number] = [0, 0];
  private lastTime: number = 0;
  
  private state: GestureState = this.getInitialState();
  
  constructor(private readonly toleranceCssPixels: number = 3) {}

  public onPointerDown(pointerId: number, x: number, y: number, timeMs: number): GestureState {
    this.origin = [x, y];
    this.lastPosition = [x, y];
    this.lastTime = timeMs;
    
    this.state = {
      ...this.state,
      pointerId,
      down: true,
      first: true,
      last: false,
      active: false,
      tap: false,
      movement: [0, 0],
      velocity: [0, 0]
    };
    return this.state;
  }

  public onPointerMove(x: number, y: number, timeMs: number): GestureState {
    if (!this.state.down) return this.state;

    const dx = x - this.origin[0];
    const dy = y - this.origin[1];
    
    // Détection d'activation (dépassement du seuil de drag)
    const distance = Math.hypot(dx, dy);
    const active = distance > this.toleranceCssPixels;

    // Calcul de la vélocité
    const dt = timeMs - this.lastTime;
    const velocity: [number, number] = dt > 0 
      ? [(x - this.lastPosition[0]) / dt, (y - this.lastPosition[1]) / dt]
      : [0, 0];

    this.lastPosition = [x, y];
    this.lastTime = timeMs;

    this.state = {
      ...this.state,
      first: false,
      active,
      movement: [dx, dy],
      velocity
    };
    return this.state;
  }

  public onPointerUp(): GestureState {
    this.state = {
      ...this.state,
      down: false,
      last: true,
      active: false,
      tap: !this.state.active // Si ça n'a jamais été actif, c'est un tap
    };
    
    // Mise à jour de l'offset persistant
    this.state.offset[0] += this.state.movement[0];
    this.state.offset[1] += this.state.movement[1];
    
    return this.state;
  }
}
```

### 4.2. Traduction dans le Piano Roll (`piano-roll-gesture-state-machine.ts`)

La machine à états actuelle du piano roll se trouvera extrêmement simplifiée. Elle ne calculera plus les distances ni les dépassements de seuil. Elle se contentera de convertir les `movement` en unités musicales.

```typescript
export class PianoRollGestureStateMachine {
  constructor(private readonly engine: GestureEngine, private readonly draft: InteractionDraft) {}

  public handleGesture(state: GestureState, tickScale: number, pitchScale: number) {
    if (state.first) {
      // Équivalent de beginPointer
      this.prepareDraft();
    }

    if (state.active && this.draft.mode === "DRAGGING") {
      // Le moteur de geste nous donne directement le delta brut en pixels
      const pixelDeltaX = state.movement[0];
      const pixelDeltaY = state.movement[1];
      
      // On convertit les pixels en logique musicale pure (ticks, pitch)
      const rawDeltaTicks = pixelDeltaX * tickScale;
      const rawDeltaPitch = pixelDeltaY * pitchScale;

      this.draft.deltaTicks = this.snapTicks(rawDeltaTicks);
      this.draft.deltaPitch = this.clampPitch(rawDeltaPitch);
    }

    if (state.last) {
      if (state.tap) {
        // C'était juste un clic
        this.selectNoteUnderCursor();
      } else {
        // Validation du geste (drag/resize terminé)
        this.commitDraft();
      }
    }
  }
}
```

## 5. Plan de Migration

Pour migrer sans régressions, nous recommandons la démarche suivante :

1. **Création du `GestureEngine`** (dans un dossier `editor-core/interactions/engine/`).
2. **Tests Unitaires Purs** : Écrire des tests mathématiques purs sur `GestureEngine` pour vérifier que la vélocité, le `tap`, et le `movement` sont calculés correctement sur une séquence de `down` -> `move` -> `up`.
3. **Intégration Façade** : Injecter le `GestureEngine` dans le `PianoRollGestureStateMachine` existant, et remplacer petit à petit les calculs manuels (comme `this.hasMovedBeyond`) par la lecture de `state.active` et `state.tap`.
4. **Nettoyage** : Supprimer l'état des pointeurs bruts de l'`InteractionDraft` (`originLocalX`, `currentLocalX`, etc.) qui sont désormais gérés par le `GestureEngine`.

Cette séparation des préoccupations rendra le code beaucoup plus facile à maintenir et ouvrira la porte à des interactions avancées (inertie, zoom complexe) de façon très structurée.
