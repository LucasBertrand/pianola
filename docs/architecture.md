# Architecture de Pianola

Ce document décrit l’architecture observée dans le code, les responsabilités de
chaque module et les règles à préserver. Il complète le [README](../README.md),
orienté installation et utilisation, et la [feuille de route](roadmap.md), qui
ordonne les améliorations incrémentales. L’option d’une reconstruction complète
est conservée comme ancienne hypothèse dans la
[feuille de route v2 archivée](old-hypothetical-rewrite-roadmap.md) ; elle ne
constitue plus la trajectoire active.

Dernière revue complète du dépôt : 13 août 2026.

## Vue d’ensemble

Pianola est une application web statique. Le projet musical, l’historique,
l’état d’édition et le moteur audio vivent dans l’onglet du navigateur. Il n’y
a ni serveur applicatif, ni base de données, ni synchronisation distante.

L’architecture protège trois propriétés essentielles :

1. les règles musicales et les commandes sont testables sans navigateur ;
2. les gestes, le playhead et le rendu Canvas à haute fréquence ne déclenchent
   pas de rendu React à chaque frame ;
3. une intention utilisateur validée produit une transaction unique dans
   l’historique Undo/Redo.

Le système peut être lu comme six ensembles :

```text
main.tsx
  └─ app : composition React et création du runtime
      ├─ ui : composants, Canvas et adaptateurs du navigateur
      ├─ application : cas d’usage et ports de mutation
      ├─ interaction : état et calcul des gestes
      ├─ audio : compilation, planification et Web Audio
      ├─ midi : codec SMF et conversion de projets
      └─ persistence : format natif .pianola

domain : modèle persistant, invariants, commandes et historique
music / geometry / config : briques partagées et déterministes
```

`src/app/App.tsx` est la racine de composition : il est normal qu’elle connaisse
les adaptateurs concrets. À l’inverse, `domain`, `music`, `geometry` et les
calculs purs d’`interaction` ne doivent connaître ni React, ni le DOM, ni Canvas,
ni Web Audio.

## Vocabulaire canonique

Le même vocabulaire doit être utilisé dans le modèle, les variables, les noms de
fichiers et la documentation :

| Terme | Sens |
| --- | --- |
| projet | document complet et source persistante de vérité |
| clip | séquence musicale locale avec notes, durée et transport |
| instrument de projet | son, mixage et identité partagés par tous les clips |
| état d’instrument du clip | verrouillage d’édition local au clip |
| piste | notes d’un instrument dans un clip |
| preset | modèle utilisé pour initialiser une configuration ; il n’est pas le son actif |
| runtime d’éditeur | services et signaux transitoires d’une instance d’éditeur |
| voix audio | occurrence sonore active dans le moteur ; ce terme ne désigne pas un instrument de projet |

Dans le code, les identifiants se terminent par `Id`, les dictionnaires par
`ById`, les ordres explicites par `Order` et les valeurs physiques par leur unité
(`Ticks`, `Seconds`, `Hz`, `CssPixels`).

## État et propriétaires

| État | Propriétaire | Persisté | Fréquence |
| --- | --- | --- | --- |
| projet, clips, instruments, notes, transport | `ProjectState` | oui | faible |
| historique Undo/Redo | `ProjectStore` | non | par transaction |
| playhead, viewport, grille et snap tonal par clip | `EditorRuntime` | oui dans `editor.clipStatesById` | élevée |
| sélection de notes | `EditorSelection` | non | pendant l’édition |
| draft de geste et notes masquées | session d’interaction | non | très élevée |
| statut et événements audio planifiés | scheduler et moteur audio | non | temps réel |
| modales et formulaires ouverts | React | non | faible |

Il ne doit exister qu’un propriétaire canonique par donnée. Un signal de rendu
publie une valeur graphique ; il ne remplace pas un bus de commandes. Une
requête ponctuelle, comme « vider la sélection », passe par
`EditorSelectionRequests` et non par un faux état persistant.

## Modules actuels

### `src/domain`

Contient le noyau métier :

- `model.ts` définit `ProjectState`, `Clip`, `ProjectInstrument`, `Track` et
  `Note` ;
- `commands.ts` définit les commandes, le reducer pur et les invariants de
  transaction ;
- `project-store.ts` possède l’historique borné et les abonnements ;
- `validation.ts` valide les valeurs entrantes ;
- `note-collision.ts` construit les plans de fusion ou de découpe ;
- `selection-transformations.ts` calcule les transformations de notes ;
- `instrument-presets.ts` fournit le catalogue intégré immuable.

Une modification persistante passe normalement par `EditorCommandService`, une
`Transaction`, puis `projectReducer`. Les commandes de notes et de transport
ciblent le clip actif. L’ajout ou la suppression d’un instrument propage la
piste et l’état d’édition correspondants à tous les clips.

Le mixage (`gain`, `pan`, `muted`, `solo`) et la configuration sonore sont
globaux dans `ProjectInstrument`. Seul `ClipInstrumentState.locked` est local au
clip.

### `src/application`

Contient les intentions utilisateur indépendantes de leur représentation :

- `EditorCommandService` est le port unique de mutation de l’éditeur ;
- `EditorSelection` possède la sélection transitoire canonique ;
- `NoteGestureWorkflow` valide un geste terminé, gère le protocole de collision
  et réconcilie la sélection ;
- `note-edit-commands.ts` et `selection-edit-plans.ts` construisent des lots de
  commandes atomiques ;
- `note-collision-resolution.ts` définit la demande applicative à laquelle la
  modale UI répond.

Une fonction de cette couche doit pouvoir être testée avec des objets TypeScript
et des ports factices, sans React ni API du navigateur.

### `src/interaction`

Contient la stratégie pointeur, la session longue durée et les calculs de geste.
Le sous-dossier `core` regroupe actuellement l’échantillon pointeur normalisé,
le draft mutable, la machine à états, le pinch/pan, le double tap à deux doigts
et le masque des notes en cours d’édition.

`PianoRollInteractionSession` conserve une identité stable pendant le montage du
piano roll. Elle possède les buffers réutilisables, le convertisseur, la
sélection et le snapshot nécessaire au passage d’un à deux doigts.

Les événements DOM sont convertis en `PointerSample` dans `src/ui/interactions`.

### `src/geometry` et `src/music`

`geometry` possède les conversions ticks/pixels, les bornes du viewport, les
rectangles visibles et l’index spatial réparti sur 128 hauteurs MIDI. `music`
possède le snap tonal, les modes, les accords et leur orthographe. Ces modules
sont déterministes et ne dépendent pas de React.

### `src/audio`

Le pipeline audio est séparé en quatre responsabilités :

```text
ProjectState
  → compilePlaybackSnapshot
  → LookaheadScheduler
  → WebAudioEngine
  → InstrumentRenderer
  → sources Web Audio
```

- `playback-snapshot.ts` valide et compacte le clip actif en tableaux immuables ;
- `lookahead-scheduler.ts` convertit transport, boucle et tempo en événements
  horodatés sans créer de nœud Web Audio ;
- `web-audio-engine.ts` possède l’`AudioContext`, le master, les bus
  d’instruments, les annulations et l’allocation de polyphonie ;
- `audio/instruments` contient les renderers spécifiques. Le renderer
  soustractif est actuellement le seul disponible ;
- `useAudioPlayback.ts` relie ce pipeline au cycle de vie React.

Un futur instrument ajoute une variante discriminée de snapshot et un renderer.
Le scheduler commun ne doit pas contenir de branche propre à cet instrument.

### `src/midi` et `src/persistence`

`midi` sépare le codec Standard MIDI File (`smf-reader`, `smf-writer`) de la
conversion vers et depuis le domaine (`midi-importer`, `midi-exporter`). L’import
accepte les formats 0 et 1 en PPQN et applique des limites de sécurité.

`persistence/native-project-file.ts` sérialise et parse le JSON `.pianola`. Le
parseur traite toute entrée comme inconnue, impose des bornes, contrôle les clés
et reconstruit un `ProjectState` validé. Le format natif conserve également les
états d’éditeur durables par clip.

### `src/ui`

La couche UI contient :

- les composants React et les formulaires à basse fréquence ;
- les peintres Canvas de grille et de notes ;
- les contrôleurs visuels DOM des ghosts, poignées et lasso ;
- les hooks qui adaptent Pointer Events, ResizeObserver et Web Audio ;
- les contrats étroits consommés par le piano roll.

React monte les couches et publie les changements structurels. Les notes ne sont
jamais une liste de composants React. Les chemins à haute fréquence réutilisent
leurs buffers et lisent les `RenderSignal` depuis `requestAnimationFrame`.

### `src/app`

`App.tsx` assemble l’interface, les workflows et les dialogues.
`editor-runtime.ts` crée le store, les services et les signaux d’une instance
d’éditeur. `demo-scene.ts` crée le projet de démonstration et le projet vierge.

Les hooks de `app/workflows` orchestrent actuellement clips, instruments,
sélection, transport, fichiers, MIDI et viewport. Cette localisation est
historique : la cible est de réserver `app` à la composition et de rapprocher
les adaptateurs React de `ui`, comme détaillé dans la feuille de route.

## Flux principaux

### Validation d’un geste de note

```text
PointerEvent natif
  → PointerSample
  → useInteractionManager (capture, timers, multi-touch)
  → stratégie de usePianoRollEvents
  → PianoRollInteractionSession + draft mutable
  → DomInteractionVisualController (feedback immédiat)
  → NoteGestureWorkflow au pointerup
  → plan de commandes ou demande de résolution de collision
  → EditorCommandService
  → ProjectStore / projectReducer / Undo-Redo
```

Pendant `pointermove`, `ProjectState` n’est pas modifié. Le store reçoit une
seule transaction après validation. Une note désactivée reste indexée et
éditable, mais la compilation audio et l’export MIDI l’ignorent.

### Réaction à une transaction

```text
ProjectStore publie (nouvel état, ancien état, transaction)
  ├─ App actualise les contrôles React
  ├─ EditorRuntime reconstruit l’index spatial si les pistes changent
  ├─ EditorRuntime actualise les styles si mixage/verrouillage changent
  └─ useAudioPlayback recompile le snapshot si le playback est affecté
```

Changer de clip est une navigation, pas une entrée Undo/Redo. Le runtime capture
l’état d’éditeur du clip quitté puis restaure celui du clip choisi.

### Sauvegarde et import

```text
Save : ProjectState + états du runtime → validation → JSON → Blob → téléchargement
Load : File → JSON inconnu → parsing borné → ProjectState → remplacement du runtime
MIDI : File → SMF → analyse → confirmation → projet importé → remplacement du runtime
```

Le chargement et l’import arrêtent la lecture, annulent le geste, vident la
sélection et le presse-papier, remplacent le store puis restaurent l’état
d’éditeur.

## Direction des dépendances

La règle cible est la suivante :

```text
app (composition)
  └─→ ui et adaptateurs navigateur
        ├─→ application ─→ domain
        ├─→ interaction ─→ domain + music + geometry
        ├─→ audio ───────→ domain
        ├─→ midi ────────→ domain
        └─→ persistence ─→ domain + modèle d’éditeur neutre

config : chaque groupe est importé uniquement par son propriétaire
```

Cette vue exprime une direction de connaissance, pas l’ordre d’exécution.
`app` peut tout assembler ; les modules internes ne remontent pas vers `app`.

Les écarts actuels connus sont explicites :

- `persistence/native-project-file.ts` importe `GridSettings` et
  `NoteColorMode` depuis `ui/rendering` ; ces contrats persistés doivent devenir
  des types d’éditeur indépendants de l’UI ;
- `interaction/piano-roll-interaction-session.ts` possède directement une
  `EditorSelection` de la couche application ; une interface étroite ou un
  déplacement de la session doit clarifier cette frontière ;
- `app/workflows/dialog-types.ts` dépend d’un type de composant UI ; le port de
  dialogue doit appartenir à l’orchestration, puis être adapté par l’UI ;
- `program-constants.ts` mélange limites métier, paramètres audio, interaction
  et rendu, ce qui crée des dépendances transversales inutiles.

Ces écarts ne justifient pas une réécriture. Ils définissent les premières
extractions de la [feuille de route](roadmap.md).

## Conventions de modules

- Un fichier non React utilise `kebab-case.ts` ; un composant utilise
  `PascalCase.tsx` ; un hook utilise `useCamelCase.ts`.
- Les dossiers utilisent `kebab-case` et décrivent une responsabilité, pas un
  type générique comme `utils` ou `helpers`.
- Les types et classes exportés utilisent `PascalCase`, les fonctions et
  variables `camelCase`, les constantes de configuration partagées
  `UPPER_SNAKE_CASE`.
- Le code et les identifiants restent en anglais ; la documentation utilisateur
  reste en français.
- Une dépendance navigateur se reconnaît à sa localisation dans `ui` ou dans un
  adaptateur explicitement nommé.
- Les fonctions pures reçoivent l’horloge, les identifiants ou les ressources
  dont elles ont besoin ; elles ne lisent pas implicitement le DOM.
- Les fichiers d’agrégation ne doivent pas masquer une dépendance circulaire.
  Préférer un import explicite vers le module propriétaire.

## Ajouter une fonctionnalité

### Commande métier

1. Définir l’intention et ses données dans le domaine.
2. Implémenter le reducer sans mutation de l’état reçu.
3. Valider toutes les entités avant de publier le nouvel état.
4. Construire la commande dans `application`, jamais dans le JSX.
5. Envoyer une transaction unique depuis `EditorCommandService`.
6. Tester le succès, le rejet, Undo et Redo.

### Interaction

1. Extraire les calculs déterministes dans `interaction`.
2. Ajouter les transitions de la machine à états.
3. Adapter seulement les événements natifs dans `ui`.
4. Garder le feedback visuel dans `DomInteractionVisualController`.
5. Tester souris, tactile, annulation, passage à deux doigts et instrument
   verrouillé.

### Instrument audio

1. Ajouter une variante de configuration au domaine.
2. Ajouter une variante discriminée de snapshot de playback.
3. Implémenter `InstrumentRenderer` dans `audio/instruments`.
4. Enregistrer le renderer dans le moteur commun.
5. Tester scheduling, annulation, mute/solo et sa politique de polyphonie.

## Vérification

La commande de référence est :

```bash
npm run verify
```

Au 13 août 2026, elle exécute le TypeScript strict, le build Vite, 62 scénarios
domaine/application/audio/persistance et 9 scénarios d’intégration MIDI. Les
gestes DOM, Canvas, le responsive et Web Audio réel restent principalement
manuels ; leur automatisation est priorisée dans la feuille de route.
