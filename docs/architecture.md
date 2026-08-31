# Architecture de Pianola

Ce document décrit les frontières et les principaux pipelines. Pour chercher un
comportement précis, partir de la [carte du code](code-map.md). Pour décider si
un état doit persister ou entrer dans Undo/Redo, consulter
[`state-ownership.md`](state-ownership.md).

Dernière revue complète : 31 août 2026.

## Vue d’ensemble

Pianola est une application web statique. Le document, l’historique, le runtime
d’édition et le moteur audio vivent dans l’onglet du navigateur.

```text
bootstrap/main.tsx
  → bootstrap/App.tsx      création du runtime
  → presentation           composition React et adaptateurs DOM/Canvas
  → application            intentions, historique, session et ports
  → domain                 document, commandes et invariants

editor-core                noyau d’édition sans DOM
infrastructure             audio, fichiers projet, navigateur et persistance
```

Règles exécutables :

1. `src/bootstrap/` démarre et assemble sans héberger de protocole complet ;
2. `src/domain/` — théorie musicale comprise — et `src/editor-core/` ne connaissent
   ni React ni le navigateur ;
3. `src/editor-core/` ne dépend pas de `src/application/` ;
4. `src/application/` ne dépend pas de l’UI ni de l’infrastructure ;
5. `src/infrastructure/` implémente les ports sans dépendre de la composition ;
6. `src/infrastructure/audio/` et `src/infrastructure/project-files/` ne dépendent pas de la composition ;
7. une intention musicale validée produit au plus une transaction.

Le contrôle couvre explicitement les six racines TypeScript courantes avec une
liste fermée de dépendances. Il construit deux graphes distincts pour le code
produit et les tests, interdit tout import produit vers un test et détecte les
cycles dans chacun. Aucun cycle n'est accepté ; tout nouveau cycle échoue
immédiatement.

## Composition

`src/bootstrap/App.tsx` crée l'agrégat `EditorRuntime`, dont le contrat appartient à
`src/application/editor-session/editor-runtime.ts`, et monte
`src/presentation/piano-roll/PianoRollWorkspace.tsx`. Le workspace coordonne les contrats,
`PianoRollWorkspaceLayout` possède la structure DOM et le portal de toolbar,
et les protocoles sont délégués à des hooks nommés :

- `useApplicationDialogs` pour alertes et confirmations ;
- `useInstrumentDialogWorkflow` pour le brouillon d’instrument ;
- `useNoteCollisionDialogWorkflow` pour merge/slice ;
- `usePianoRollProjectState` et `useProjectStoreSelector` pour les snapshots
  stables du projet, du clip, de l’instrument et de la sélection ;
- `usePianoRollUserPreferences` pour préférences et presets personnels ;
- `usePianoRollProjectLifecycle` pour autosave, fermeture et fichiers ;
- `useProjectMigrationDialog` pour les futurs rapports de migration dans la
  modale applicative commune ;
- `usePianoRollTransportViewport` pour audio, commandes, suivi et viewport ;
- les workflows de clips, sélection et marqueurs.

L’inventaire détaillé des états de composition est dans
[`app-composition.md`](app-composition.md).

## Domaine

Le domaine est réparti par propriétaire :

| Propriétaire | Contenu |
| --- | --- |
| `src/domain/identifiers.ts` | identifiants et tick |
| `src/domain/notes/note.ts` | note, pitch, vélocité, sourdine et verrouillage |
| `src/domain/instruments/instrument.ts` | sons, presets et instruments |
| `src/domain/clips/clip.ts` | pistes, timeline et clips |
| `src/domain/transport/transport.ts` | horloge (PPQN) et boucle locale au clip |
| `src/domain/transport/time-map.ts` | surface publique de la time map ; modèle, navigation, normalisation, marqueurs et éditions structurelles sont dans des modules voisins |
| `src/domain/music-theory/` | snap par motif de hauteurs, orthographe des hauteurs et détection d'accords |
| `src/domain/commands/clip-*-commands.ts` | commandes de valeurs, groupes, concaténation/découpe et hiérarchie de clips |
| `src/domain/master-bus.ts` | gain, mute et accordage master |
| `src/domain/project/project-document.ts` | document, enchaînement global, workspace et accès clip |

La `TimeMap` publiée d’un clip est l’unique source de vérité temporelle. Notes,
marqueurs de tempo, de gamme et de section sont ancrés à leurs ticks absolus.
Un marqueur de section associe un commentaire libre à son tick. Lors d'une
découpe de clip, les marqueurs placés exactement sur une frontière de mesure
interne peuvent être sélectionnés comme points de coupe.
Les marqueurs de métrique sont structurels : chacun doit commencer une mesure
complète. Une modification en amont conserve son tick s’il reste valide,
sinon elle le projette vers la première frontière valide suivante, sans jamais
le reculer. La fin du clip suit la même règle et peut donc s’allonger.

L’ajout et la suppression de mesures sont, eux, des insertions et suppressions
littérales de temps : le contenu situé à droite est décalé de la durée exacte
ajoutée ou retirée. Mesures, positions musicales et conversions tick↔seconde
sont dérivées de la `TimeMap` ; aucun nombre de mesures ni tempo « courant »
n’est persisté.

Les mutations durables passent par `EditorCommandPort`, une transaction et les
reducers de `src/domain/commands/`. `EditorCommandService` et `ProjectStore`
appartiennent à `src/application/history/`; `ProjectStore` est le propriétaire de
l’historique musical. La concaténation d’un groupe construit d’abord un clip
indépendant à partir des descendants non bypassés dans
`src/domain/clips/concatenate-clips.ts`, puis une commande
atomique remplace le nœud du groupe à la même position et retire ses descendants.
La duplication de groupe construit une transaction unique contenant les copies
de clips et du sous-arbre, ce qui conserve une seule étape Undo/Redo. Le bypass
est porté par le nœud de groupe et ne réécrit jamais le bypass des feuilles.
La découpe suit le chemin inverse de la concaténation : `splitClip` construit
les sous-clips par mesure ou aux marqueurs de section sélectionnés, tranche les
notes chevauchantes et réinjecte le contexte métrique, le tempo et le motif de hauteurs au tick 0.
`SplitClipIntoGroupCommand` remplace ensuite atomiquement la feuille source par
un groupe à la même position dans la hiérarchie.

## Noyau du piano roll

Tout le noyau propre à l’éditeur visible partage la racine
`src/editor-core/` :

```text
geometry/       conversions, bornes, région visible et index spatial
interactions/   draft, machine de gestes, pointeurs et session
model/          signaux et réglages neutres
selection/      sélection transitoire et requêtes
viewport/       publication, batching et suivi de lecture
```

L'agrégat de session qui compose ces mécanismes reste hors du noyau, sous
`src/application/editor-session/`. Les cas d’usage correspondants partagent
`src/application/piano-roll/notes/` et
`src/application/piano-roll/selection/`. Le service de commandes transversal est
possédé par `src/application/history/`.

Les projections musicales de marqueurs et de boucle appartiennent aussi à cet
agrégat applicatif, respectivement via `TimeMapMarkerPreviewSession` et
`LoopPreviewSession`. Elles sont immuables, rattachées au clip et à la révision
qui ont ouvert le geste, et distinctes du draft géométrique haute fréquence de
`PianoRollInteractionSession`. Une nouvelle révision ou un changement de clip
les invalide automatiquement.

## Présentation et styles

Les composants sont rangés par surface : dialogs, editor-header,
editor-toolbar, inspector, piano-roll, project-files, radial-menu et transport.
La primitive continue commune appartient à `presentation/slider/` : elle garde
une session de pointeur relative et transitoire, publie les previews pendant le
geste, restaure sur annulation et laisse le commit durable au consommateur.
Les icônes de commandes ont le propriétaire nommé `command-icons`, et le
réordonnancement de cartes appartient à `inspector/card-reorder`. Le piano roll garde ses adaptateurs DOM
dans `src/presentation/piano-roll/interactions/` et ses peintres Canvas dans
`src/presentation/piano-roll/rendering/`.

Les valeurs partagées qui produisent du JSX passent par
`useProjectStoreSelector` ou `useRenderSignalValue`, fondés sur
`useSyncExternalStore`. Le sélecteur conserve sa référence tant que sa
projection ne change pas et ne notifie pas React pour une mutation sans rapport.
Le viewport, le playhead, les survols et les projections de geste restent des
signaux à invalidation DOM/Canvas directe. Les adaptateurs de rendu résolvent
une `TimeMap` ou une boucle effective à partir du snapshot publié et de la
projection compatible ; les peintres reçoivent seulement ce snapshot explicite.

`src/presentation/styles/index.css` importe des propriétaires symétriques :
slider, shell, editor header et contexte, editor toolbar, contrôles du viewport,
transport, project files, piano roll, menu radial, inspector, dialogs et
responsive. Le fichier responsive ne coordonne que plusieurs surfaces.

## Pipeline d’un geste

```text
PointerEvent
  → dom-pointer-sample
  → stratégie de geste
  → PianoRollInteractionSession
  → draft géométrique + projection éditoriale marqueurs/boucle
  → snapshot effectif pour DOM/Canvas, snap et ghosts
  → NoteGestureWorkflow
  → plan de commandes ou demande de collision
  → EditorCommandPort
  → ProjectStore / reducer / Undo-Redo
```

Pendant `pointermove`, le document ne change pas. La projection des marqueurs
est calculée par la même primitive pure que le plan de commit ; une note
déplacée avec un marqueur de gamme se cale ainsi sur la gamme projetée, puis les
notes et marqueurs sont publiés dans une seule transaction. Les rôles fréquents sont
séparés : manager de pointeurs, politique de seuils, double-tap, lasso,
ciblage/stratégie, contrôleur de sélection et contrôleur visuel.

## Pipeline audio

```text
ClipPlaybackSource
  → compilePlaybackPlan
  → PlaybackSnapshot publié
  → createTransferableAudioWorkletTimeline (données audio minimales)
  → AudioWorkletTransport (cycle de vie navigateur et commandes)
  → MessagePort
  → WorkletTimelineEngine
      timeline/transport publiés + surcharges tempo/boucle
      → état effectif (horloge, boucles, occurrences et polyphonie)
  → SubtractiveWorkletVoice (oscillateur, enveloppes et filtre par échantillon)
```

Le worklet possède le transport et déclenche les occurrences depuis le nombre
d’échantillons réellement rendus. Le thread principal ne possède aucun timer
audio et n’envoie aucun événement par note. Une charge React ou Canvas peut
retarder l’affichage du playhead, jamais la lecture.

`useAudioPlayback` projette les previews temporelles vers deux messages légers
et indépendants. Le tempo effectif change la pente tick↔seconde sans seek ni
redémarrage de voix. La boucle effective agit dès la prochaine frontière audio,
y compris si sa fin passe derrière le playhead. Chaque message porte l’identité
et la séquence de la timeline ainsi qu’une version monotone ; une projection
tardive ne peut donc pas contaminer une autre source. Une mise à jour publiée
reste mémorisée sous la surcharge, et retirer celle-ci révèle toujours la
dernière version publiée.

`EditorRuntime.playheadPosition` est l’unique position de lecture et contient le
clip ainsi que son tick. `ActiveClipSelection.activeClipId` reste une sélection
d’édition indépendante. Une fin naturelle déplace ce playhead selon l’ordre
visible et charge le prochain clip non bypassé qui n’a aucun groupe parent
bypassé ; la boucle du clip courant reste prioritaire et le dernier clip
jouable s’arrête. Un clip bypassé lancé directement reste jouable et peut
amorcer la suite. S’il appartient à un groupe bypassé, la recherche ignore le
reste de ce groupe et reprend après son nœud. Le suivi visuel sélectionne le
clip joué puis suit
son tick uniquement lorsqu’il est activé ; il est désactivé au montage et ne
publie alors aucune modification de viewport.

Le dialogue d’instrument reste propriétaire de son brouillon. Chaque réglage
est envoyé au worklet comme un message léger ; les paramètres continus des voix
actives sont lissés et les paramètres structurels s’appliquent aux voix
suivantes. Aucune note n’est recompilée pendant cette interaction. Annuler retire
le paramètre transitoire ; confirmer publie une unique transaction dans
`ProjectStore`.

La façade publique est `src/infrastructure/audio/audio-worklet-transport.ts`. Le protocole et
le DSP sont sous `src/infrastructure/audio/worklet/`. L’adaptateur navigateur peut être remplacé
sans modifier le moteur temps réel pur.

## Persistance et fichiers projet

Le domaine ne connaît aucune API navigateur. `ProjectAutosave` reçoit les ports
injectés, le Web Worker sérialise et valide les snapshots, puis le repository
IndexedDB publie atomiquement génération et résumé. Le format portable reste un
pipeline distinct du stockage local. Le MIDI sépare validation, lecture/écriture
SMF, analyse, avertissements, collisions et construction de projet.

Les contrats `ProjectRepository`, `StoredProjectCodec`,
`UserSettingsRepository` et `AutosaveScheduler` sont sous
`src/application/ports/`. Leurs implémentations Worker, IndexedDB, navigateur et
mémoire sont sous `src/infrastructure/persistence/`. Les codecs routent d'abord
l'identité et la version inconnues dans le pipeline commun
`src/infrastructure/versioned-data/`. Chaque format ne déclare que sa version
courante, le format attendu par version et ses étapes pures successives ; le
pipeline refuse centralement les versions futures, les étapes manquantes et les
sorties de migration incohérentes, puis les parseurs valident strictement le
modèle courant.
Le fichier portable, le snapshot local, le document musical et le layout
IndexedDB partent tous de leur version 1. Aucune version historique ni migration
de projet n'est encore déclarée.

Les échecs complets alimentent les diagnostics de quarantaine et restent
exportables sans mutation. IndexedDB crée son premier layout avec
`onupgradeneeded` et recrée tout layout supérieur incompatible pendant ce reset
initial. Les futurs
changements ajouteront des migrations pures successives avant la validation
courante.

```text
Autosave : document + workspace → Worker → deux générations IndexedDB
Ouverture: génération v1 → validation stricte
Export   : document + workspace → JSON portable v1 validé → Blob
Import   : File → version v1 → validation → nouvelle entrée locale
Settings : mise à jour atomique → document IndexedDB séparé
MIDI     : File ↔ codec SMF ↔ analyse/projection neutre ↔ projet
```

## Exceptions au seuil de 500 lignes

Le seuil déclenche une revue, pas un échec de CI. Les exceptions restantes ont
une responsabilité unique documentée dans leur guide local : données de
palette, composition du workspace, résolution de
collisions et parseurs MIDI/`.pianola`. Le contrôle structurel affiche la liste
courante à chaque vérification.

## Vérification

`npm run verify` exécute documentation, structure, frontières, TypeScript,
build, smoke test du module worklet produit et la suite de tests. Les règles
structurelles sont dans
`scripts/check-structure.mjs`; les frontières techniques restent dans
`scripts/check-import-boundaries.mjs`.

La documentation de référence est indexée dans [`README.md`](README.md).
