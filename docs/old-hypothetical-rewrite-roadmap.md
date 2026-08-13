# Feuille de route de réécriture — Pianola v2

> **Statut : archive.** Cette hypothèse de reconstruction n’est plus la
> trajectoire active. Les travaux sont désormais pilotés par la
> [feuille de route incrémentale](roadmap.md). Ce document est conservé pour
> expliquer les options et arbitrages étudiés.

Ce document décrit une réécriture globale de Pianola. Il ne remplace pas la
[feuille de route de maintenance](roadmap.md), qui reste pertinente si le choix
est d’améliorer l’application actuelle par étapes. Ici, l’hypothèse est
différente : reconstruire le produit à côté de la v1, avec une architecture
nouvelle, puis basculer seulement lorsque l’expérience existante est reproduite.

Date de référence : 13 août 2026.

## Résultat recherché

La v2 doit rester Pianola pour l’utilisateur : mêmes gestes, mêmes concepts,
mêmes fichiers utiles, même réponse visuelle et musicale. La liberté de
réécriture concerne l’intérieur de l’application, pas son contrat d’usage.

La cible est un **monolithe frontend modulaire** : une seule application web
statique, sans backend obligatoire, mais composée de paquets aux dépendances
explicites. L’objectif n’est pas de produire le plus de modules possible ; il
est de rendre chaque responsabilité facile à trouver, tester et remplacer.

La réécriture sera considérée réussie lorsque :

- chaque parcours de la v1 possède un test de compatibilité dans la v2 ;
- les règles musicales restent exécutables sans React, DOM, Canvas ni Web Audio ;
- une intention validée produit une seule transaction Undo/Redo ;
- le pointeur, le playhead et le rendu ne transitent pas à chaque frame par
  React ou Redux ;
- le format `.pianola` v1 reste importable ;
- les performances tactiles et audio ne régressent pas sur les appareils de
  référence ;
- un développeur peut trouver le propriétaire d’un comportement depuis
  l’arborescence, sans suivre une chaîne d’imports ambiguë.

## Décision d’architecture

### Ce qui est conservé

- React, TypeScript strict et Vite : ce socle est adapté au produit et n’est pas
  la source principale de complexité.
- Une application locale au navigateur : pas de serveur, base de données,
  compte ou synchronisation ajoutés sans besoin produit.
- Un modèle musical immuable et sérialisable.
- Un rendu impératif séparé de React pour le piano roll.
- Une transaction atomique par geste utilisateur terminé.
- Les règles propres à Pianola : collisions, découpe, fusion, snap, clips,
  mapping des instruments et compilation de la lecture.

### Ce qui est remplacé

- Le store et l’historique faits maison par un store Redux Toolkit circonscrit
  au document et à l’espace de travail.
- Les cycles de gestes implicites par des machines XState explicites.
- Le moteur Web Audio de bas niveau par un adaptateur Tone.js, après preuve
  d’équivalence sonore et temporelle.
- Le codec SMF binaire maison par `@tonejs/midi`, isolé dans un Web Worker.
- La validation JSON manuelle par des schémas Zod versionnés.
- Les modales, menus, tooltips et sliders accessibles faits maison par les
  primitives Radix.
- Les scripts de test personnalisés par Vitest, fast-check et Playwright.

### Ce qui reste soumis à une preuve

L’historique `redux-undo` est lui aussi conditionné à un test mémoire sur de gros
projets. Grâce au partage structurel d’Immer, il est le choix le plus simple.
S’il dépasse le budget défini au jalon 0, il sera remplacé derrière la même API
par un journal de patches directs et inverses produit par Immer.

## Stack v2 proposée

| Besoin | Choix | Rôle et limite |
| --- | --- | --- |
| UI | React 19 | composition et vues à fréquence humaine ; aucun rendu par frame |
| Build | Vite + TypeScript strict | workspace, développement, chunks et compilation |
| État document | Redux Toolkit + React Redux | transactions, entités, sélecteurs et orchestration |
| Undo/Redo | `redux-undo`, sous benchmark | historique du document uniquement |
| Workflows | XState v5 + `@xstate/react` | gestes, lecture et imports sous forme d’états explicites |
| Validation | Zod 4 | validation aux frontières, jamais dans la boucle de rendu |
| Audio | Tone.js | contexte, transport, voix et effets derrière `AudioSession` |
| MIDI | `@tonejs/midi` | lecture/écriture SMF derrière l’adaptateur Pianola |
| Travail hors thread UI | Web Worker + Comlink | parsing, migrations et export des fichiers |
| Rendu | PixiJS v8 | rendu WebGL des couches du piano roll |
| UI accessible | Radix Primitives | dialogue, menu, tooltip, slider, tabs et toolbar |
| Styles | CSS Modules + custom properties | portée locale et tokens partagés, sans runtime CSS |
| Tests | Vitest | unités, contrats et intégrations déterministes |
| Propriétés | fast-check | invariants temporels, géométriques et de fichiers |
| Navigateur | Playwright | parcours, tactile émulé, visuel et accessibilité |

Ces bibliothèques ne deviennent pas le vocabulaire de l’application. Les objets
`Tone.Part`, `PIXI.Container`, `ZodSchema`, `ActorRef` ou `EntityState` ne doivent
pas franchir l’API publique du paquet qui les adapte.

### Bibliothèques volontairement non ajoutées

- Pas de Zustand, Signals ou second store réactif : Redux et les acteurs XState
  suffisent ; un troisième modèle d’état rendrait le propriétaire des données
  ambigu.
- Pas de framework CSS : la surface visuelle actuelle est spécifique et les
  CSS Modules répondent au besoin de localisation.
- Pas d’event bus global : les transactions, ports et événements d’acteurs ont
  des propriétaires nommés.
- Pas de bibliothèque générique de collision avant benchmark : les 128 hauteurs
  MIDI et les intervalles temporels forment un index spécialisé simple et
  prévisible.
- Pas de microservices, Electron, CRDT ou AudioWorklet sans fonctionnalité ou
  profil de performance qui les justifie.

## Arborescence cible

Le dépôt devient un workspace npm avec des références de projets TypeScript.
Chaque paquet possède un `src/index.ts` comme API publique et interdit les
imports profonds depuis les autres paquets.

```text
PianoRoll/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/                   # composition root, providers, bootstrap
│       │   ├── features/
│       │   │   ├── clips/
│       │   │   ├── instruments/
│       │   │   ├── piano-roll/
│       │   │   ├── project-files/
│       │   │   └── transport/
│       │   ├── pages/                 # assemblages de fonctionnalités
│       │   └── styles/                # reset et tokens globaux uniquement
│       └── index.html
├── packages/
│   ├── project-domain/                # valeurs, invariants, opérations pures
│   ├── project-store/                 # RTK, historique, transactions, sélecteurs
│   ├── music-theory/                  # pitch, gammes, couleurs et conversions
│   ├── editor-engine/                 # viewport, sélection, snap, collisions
│   ├── interaction-engine/            # acteurs de gestes et sessions
│   ├── piano-roll-renderer/           # port de rendu et backend retenu
│   ├── audio-engine/                  # plan de lecture, ports et adaptateur Tone
│   ├── project-io/                    # schémas, migrations, `.pianola` et MIDI
│   ├── ui-kit/                        # primitives Radix habillées pour Pianola
│   └── testkit/                       # builders, fakes, fixtures et assertions
├── workers/
│   └── io-worker/                     # entrée Worker et façade Comlink
├── tests/
│   ├── compatibility/                 # même entrée, même résultat v1/v2
│   ├── e2e/                           # Playwright
│   ├── fixtures/                      # projets et MIDI de référence
│   └── performance/                   # scènes et budgets reproductibles
├── docs/
│   ├── adr/                           # décisions et preuves mesurées
│   ├── architecture.md                # architecture effective après bascule
│   └── old-hypothetical-rewrite-roadmap.md
├── package.json
└── tsconfig.json
```

### Règles d’emplacement

1. `apps/web` assemble ; il ne définit pas de règle musicale.
2. Un dossier `features/<nom>` contient la vue, le contrôleur React et les tests
   de cette fonctionnalité, mais pas le moteur réutilisable.
3. Un paquet n’est créé que s’il possède une API, des tests et une direction de
   dépendance distinctes. Les fichiers génériques `utils.ts`, `helpers.ts`,
   `common.ts` et `types.ts` sont interdits.
4. Le port appartient au consommateur. Par exemple, `AudioSession` appartient à
   `audio-engine`, pas à un paquet transversal `contracts`.
5. Les fichiers sont nommés par capacité : `move-notes.ts`,
   `compile-playback-plan.ts`, `parse-native-project.ts`.
6. Les tests unitaires sont voisins du fichier testé ; les tests de plusieurs
   paquets vivent sous `tests/`.
7. Les exports de paquet sont explicites. Une règle ESLint empêche les imports
   `packages/*/src/*` et les cycles.

### Direction des dépendances

```text
apps/web ───────────────► project-store ─────────► project-domain
   │                           │                         ▲
   ├──► interaction-engine ────┼──► editor-engine ──────┤
   ├──► piano-roll-renderer ───┘                        │
   ├──► audio-engine ───────────────────────────────────┤
   ├──► project-io ─────────────────────────────────────┤
   ├──► ui-kit
   └──► io-worker (messages sérialisables uniquement)

music-theory est pur et peut être utilisé par project-domain, editor-engine,
audio-engine et project-io. Aucun de ces paquets ne dépend de apps/web.
```

## Modèle d’état

La v2 sépare quatre états au lieu de les faire converger dans la racine React.

| État | Propriétaire | Persisté | Dans Undo/Redo | Fréquence |
| --- | --- | --- | --- | --- |
| `ProjectDocument` | `project-store` | oui | oui | par transaction |
| `WorkspaceState` | `project-store` | oui, section `editor` | non | faible à moyenne |
| `EditorSession` | acteur d’interaction | non | non | élevée |
| `RealtimeState` | renderer et audio | non | non | par frame/quantum |

### `ProjectDocument`

Il contient uniquement la musique partageable : métadonnées, clips,
instruments, pistes, notes, tempo, mesure, boucle et mixage. Toutes les entités
ont un identifiant typé (`ClipId`, `InstrumentId`, `TrackId`, `NoteId`) et une
forme normalisée avec `ids` et `byId`.

Il ne contient ni clip actif, ni sélection, ni viewport, ni référence DOM, ni
objet de bibliothèque, ni cache dérivé. Il est intégralement sérialisable.

### `WorkspaceState`

Il contient le contexte de travail : clip et instrument actifs, grille, snap,
viewport, playhead d’édition et préférences visuelles par clip. Il est sauvegardé
dans la section `editor` d’un fichier `.pianola`, mais reste en dehors de
l’historique musical. Un Undo ne change donc ni le clip affiché ni le zoom.

### `EditorSession`

Il contient la sélection courante, le mode de geste, le draft, les pointeurs
capturés et les notes temporairement masquées. Une machine XState décrit les
transitions significatives :

```text
idle
├── selecting ──► committed | cancelled
├── lassoing ───► committed | cancelled
├── drawing ────► committed | cancelled
├── moving ─────► committed | cancelled
├── resizing ───► committed | cancelled
└── pinching ───► idle
```

Les coordonnées successives d’un `pointermove` restent dans un runtime impératif
mutable. Elles ne sont pas copiées dans le contexte XState ni dispatchées dans
Redux. La machine contrôle le cycle de vie ; le runtime contrôle la frame.

### `RealtimeState`

Le renderer possède ses buffers, invalidations et caches graphiques. Le moteur
audio possède ses événements programmés, voix et ancres de temps. Ces deux états
sont des projections remplaçables du document, jamais des sources de vérité.

## Transactions et historique

L’UI ne dispatchera pas des setters génériques. Elle émettra une intention
sémantique qui est planifiée, validée puis appliquée atomiquement :

```text
Pointer up
  → CompleteMoveNotes
  → planMoveNotes(document, selection, delta)
  → ProjectTransaction { label, operations[] }
  → projectTransactionCommitted(transaction)
  → reducer document
  → une entrée Undo
  → projections renderer et audio invalidées
```

`ProjectTransaction` utilise une union discriminée d’opérations (`noteAdded`,
`notesMoved`, `notesResized`, `notesDeleted`, `collisionResolved`, etc.). Le
reducer refuse une transaction invalide en développement ; les planificateurs
purs portent les règles de collision et de bornage.

Le reducer `document` seul est enveloppé par l’historique. Les actions de
navigation, sélection, dialogue, lecture ou viewport n’ont donc besoin d’aucun
filtre fragile. Un historique est remis à zéro à l’ouverture ou à la création
d’un projet.

## Rendu du piano roll

`piano-roll-renderer` expose un port indépendant de PixiJS :

```ts
interface PianoRollRenderer {
  mount(surface: HTMLElement): void;
  resize(viewport: SurfaceSize): void;
  renderScene(scene: PianoRollScene): void;
  renderDraft(draft: GestureDraft | null): void;
  renderPlayhead(positionTicks: number): void;
  dispose(): void;
}
```

Le renderer reçoit des projections déjà calculées. Il ne décide ni des
collisions, ni du snap, ni de la sélection et ne lit jamais le store global.

La scène est organisée en couches :

1. grille et bandes de hauteurs, mises en cache par niveau de zoom ;
2. notes visibles, batchées et limitées au rectangle de vue ;
3. sélection et draft ;
4. règles, playhead et feedback de geste ;
5. overlay DOM réservé au focus, menus et informations accessibles.

Le hit-testing reste dans `editor-engine`. Un index par hauteur MIDI puis par
intervalle temporel donne un résultat déterministe sans coupler les gestes à la
scène Pixi. Les labels de notes ne sont créés qu’au-dessus d’un seuil de zoom.

Le prototype Pixi doit mesurer au minimum : 1 000, 10 000 et 50 000 notes ;
pan, zoom et sélection ; DPR 1 à 3 ; changement d’orientation ; perte/restauration
du contexte WebGL ; Chrome desktop, Firefox desktop et une tablette Android de
référence.

## Audio

La logique audio est divisée en trois niveaux :

```text
ProjectDocument
  → PlaybackPlanCompiler (pur, ticks et événements musicaux)
  → AudioSession (port Pianola)
  → ToneAudioSession (Tone.Transport, Part, synthés, canaux et master)
```

`PlaybackPlanCompiler` reste propriétaire des choix Pianola : clips, boucle,
instruments muets, notes désactivées, bornes et reprise après édition. Tone.js
est propriétaire du temps Web Audio, de l’allocation des voix et du graphe de
traitement.

Chaque synthétiseur et effet est construit dans l’adaptateur Tone. Les callbacks
utilisent le temps précis fourni par Tone ; ils ne lisent pas `Date.now()`. Une
mise à jour du projet remplace uniquement les événements futurs et ne coupe pas
les voix déjà actives, sauf commande explicite d’arrêt.

Une `AudioSession` est créée après un geste utilisateur, conformément aux règles
d’autoplay des navigateurs. L’acteur de lecture possède les états `stopped`,
`starting`, `playing`, `paused`, `stopping` et `error` et garantit le nettoyage
de chaque session.

Le jalon audio doit comparer v1 et v2 sur : enveloppes, oscillateurs, filtre,
gain, polyphonie, notes simultanées, boucles, pause/reprise, déplacement du
playhead, changement de tempo et édition pendant la lecture.

## Formats et Worker d’I/O

### Format natif

Le format v2 utilise des schémas Zod distincts de l’état interne :

```text
unknown JSON
  → StoredProjectV1 | StoredProjectV2
  → migration explicite
  → validation des invariants métier
  → ProjectDocument + WorkspaceState
```

Les migrations sont des fonctions pures chaînées. Une version est lue, migrée
vers la suivante et ne connaît aucune version future. Les erreurs contiennent
un chemin, un code stable et un message traduisible. La sérialisation produit un
ordre déterministe afin de rendre les fixtures et diffs lisibles.

La v2 importe tous les fichiers v1 valides. L’export v2 n’a pas à rester lisible
par l’ancienne application, mais cette incompatibilité doit être annoncée avant
la bascule et accompagnée d’un export MIDI de secours.

### MIDI

`@tonejs/midi` remplace uniquement le codec binaire. Les décisions suivantes
restent dans `project-io` et sont testées comme règles Pianola :

- affectation des pistes, canaux et instruments ;
- conversion des ticks et du tempo ;
- clips produits par l’import ;
- collision, tronquage et avertissements ;
- format 0/1 et métadonnées exportées.

Le parsing et l’écriture s’exécutent dans `io-worker` via Comlink. Les
`ArrayBuffer` sont transférés, pas copiés. La façade impose une taille maximale,
un délai d’exécution et peut terminer le Worker. Le résultat du codec est validé
avant d’entrer dans le store.

## Interface React

React assemble des vues à partir de sélecteurs fins. Aucun composant ne reçoit
le projet complet si quelques champs suffisent. Les fonctionnalités exposent un
petit contrôleur React et réutilisent les cas d’usage des paquets.

Radix prend en charge les comportements difficiles à fiabiliser : focus des
dialogues, fermeture Escape, aria, navigation clavier, menus, tooltips et
sliders. `ui-kit` impose ensuite les tokens, dimensions tactiles et variantes
visuelles de Pianola.

Les règles de style sont simples :

- variables CSS pour couleurs, espacements, élévations et tailles tactiles ;
- un module CSS voisin de chaque composant ;
- aucun sélecteur global hors reset, typographie et tokens ;
- aucun nom lié à une couleur visuelle (`blueButton`) : préférer le rôle
  (`primaryAction`, `mutedTrack`) ;
- les icônes gardent toujours un libellé accessible ou un texte adjacent.

## Convention de nommage

| Élément | Convention | Exemple |
| --- | --- | --- |
| identifiant | type + suffixe `Id` | `clipId: ClipId` |
| dictionnaire | suffixe `ById` | `notesById` |
| ordre persistant | suffixe `Order` | `clipOrder` |
| unité | suffixe physique | `startTicks`, `frequencyHz`, `widthCssPixels` |
| booléen | question positive | `isMuted`, `hasSelection`, `canUndo` |
| événement passé | fait accompli | `projectLoaded`, `gestureCancelled` |
| commande | intention à l’infinitif anglais | `MoveNotes`, `ImportMidi` |
| fonction de calcul | verbe précis | `planMoveNotes`, `compilePlaybackPlan` |
| adaptateur | technologie + port | `ToneAudioSession`, `PixiPianoRollRenderer` |
| test | comportement observable | `move-notes.test.ts` |

Le code reste en anglais ; les textes de produit et la documentation restent en
français. Un glossaire unique dans `docs/architecture.md` relie les deux.

## Stratégie de tests

### Pyramide

1. **Unités Vitest** : valeurs, invariants, transactions, migrations,
   projections, calculs de viewport et compilation audio.
2. **Propriétés fast-check** : absence de note hors bornes, idempotence des
   normalisations, round-trip des formats, invariants après collision et
   équivalence ticks/secondes.
3. **Contrats d’adaptateurs** : la même suite s’exécute contre les fakes et les
   adaptateurs Tone, Pixi et Worker lorsque cela est possible.
4. **Intégrations** : store + acteur + projection, import + migration + commit,
   édition + replanification audio.
5. **Playwright** : parcours complets, tailles tablette, interactions pointer,
   snapshots visuels et snapshots d’accessibilité.

Playwright ne synthétise directement qu’un `tap` tactile simple. Un helper de
test dispatchera donc des séquences Pointer Events multi-pointeurs contrôlées
pour le pinch et le pan à deux doigts. Les gestes critiques resteront également
testés manuellement sur une tablette réelle avant release.

### Matrice de compatibilité UX

| Domaine | Scénarios obligatoires avant bascule |
| --- | --- |
| projet | nouveau, ouvrir v1, sauvegarder v2, erreur de fichier, Undo/Redo |
| clips | créer, renommer, dupliquer, réordonner, supprimer, changer d’onglet |
| notes | dessiner, lasso, sélectionner, déplacer, redimensionner, copier/coller, supprimer |
| tactile | appui long, pan/zoom deux doigts, annulation, sortie de surface |
| collisions | fusion, découpe, tronquage, annulation et notes désactivées |
| grille | snap temporel, snap tonal, zoom, scroll, changement de mesure |
| instruments | créer, modifier, assigner, mute, solo, volume, verrouillage local |
| transport | lecture, pause, stop, boucle, seek, tempo, édition en lecture |
| clavier | audition, hauteur affichée, raccourcis et focus |
| échanges | import MIDI 0/1, export MIDI 1, round-trip `.pianola` |
| responsive | bureau, paysage tablette, portrait, changement d’orientation |

Pour chaque ligne, une fixture v1 et le résultat attendu sont capturés avant
d’écrire la v2. Le test compare l’état final et, lorsque pertinent, une capture
visuelle ou un plan audio ; il ne compare pas l’implémentation.

## Budgets non fonctionnels

Le jalon 0 mesure la v1 sur le matériel de référence et enregistre la baseline.
La v2 ne peut pas être livrée si elle dépasse l’un de ces budgets sans décision
explicite :

- aucune régression statistiquement significative du temps de frame pendant le
  pan, le zoom et le déplacement d’un groupe de notes ;
- feedback visuel d’un geste en moins de 50 ms au 95e percentile ;
- aucun événement audio manqué dans les scénarios déterministes de lecture ;
- ouverture et import hors thread principal pour les grosses fixtures ;
- aucun long task supérieur à 100 ms produit par une opération de fichier sur
  la surface d’édition ;
- historique de 500 transactions sur la fixture 50 000 notes sous le budget
  mémoire défini par l’ADR du matériel cible ;
- bundle analysé à chaque build, avec chunks séparés pour le renderer, l’audio
  et les formats chargés à la demande lorsque le parcours le permet ;
- zéro violation d’accessibilité détectée automatiquement sur les vues standard
  et parcours clavier complet pour les dialogues et menus.

Les nombres dépendants du matériel — FPS, mémoire et temps d’ouverture — seront
fixés dans `docs/adr/000-baseline-v1.md` après mesure, pas choisis arbitrairement.

## Plan de livraison

Chaque jalon doit pouvoir être démontré et rejeté sans fragiliser la v1. Les
jalons 0 à 2 sont le chemin critique ; le rendu, l’I/O et l’audio peuvent ensuite
avancer en parallèle si l’équipe le permet.

### J0 — Figer le contrat et lever les inconnues

Objectif : transformer « même expérience » en preuves et décider les composants
les plus risqués avant de construire dessus.

- Capturer les fixtures, états finaux, plans audio et captures des parcours v1.
- Mesurer bundle, mémoire, frame time, ouverture et import sur le matériel cible.
- Prototyper Pixi avec 1 000, 10 000 et 50 000 notes.
- Prototyper Tone sur boucle, tempo, seek et édition en lecture.
- Mesurer `redux-undo` sur 500 transactions d’une fixture 50 000 notes.
- Vérifier `@tonejs/midi` sur le corpus MIDI actuel, les fichiers invalides et
  les limites de taille.
- Écrire les ADR : renderer, audio, historique, format v2 et navigateurs cibles.

**Sortie :** quatre décisions mesurées, une baseline v1 versionnée et une matrice
de compatibilité exécutable. Aucun développement structurel ne commence avant
les décisions renderer, audio et historique.

### J1 — Construire le workspace et les frontières

Objectif : installer l’ossature compilable sans réimplémenter l’application.

- Créer `apps`, `packages`, `workers` et les références TypeScript.
- Configurer les exports publics, aliases, ESLint, détection de cycles et
  interdiction des imports profonds.
- Installer Vitest, fast-check et Playwright.
- Créer `testkit`, les builders typés et le premier test de compatibilité.
- Préparer la CI v1 + v2 : typecheck, tests, build, E2E et rapport de bundle.

**Sortie :** une page v2 vide déployable, chaque paquet testable isolément et
les règles de dépendance exécutées en CI.

### J2 — Refaire le domaine, le store et l’historique

Objectif : obtenir un document complet sans UI ni navigateur.

- Définir les identifiants typés et le `ProjectDocument` normalisé.
- Porter les invariants par sous-domaine : projet, clips, instruments, notes et
  transport.
- Porter les opérations pures et planificateurs de transactions.
- Installer Redux Toolkit, les entity adapters et les sélecteurs.
- Séparer `WorkspaceState` du document historique.
- Installer l’Undo/Redo retenu par l’ADR.
- Rejouer les scénarios actuels et les propriétés génératives.

**Sortie :** tous les comportements de document sont manipulables par tests,
avec une seule entrée d’historique par transaction et aucune dépendance DOM.

### J3 — Refaire les formats et migrations

Objectif : charger et sauvegarder sans bloquer la surface d’édition.

- Écrire les schémas Zod v1 et v2 et la migration v1 vers v2.
- Séparer `StoredProject` du modèle interne.
- Construire le Worker Comlink avec annulation, timeout et transferts.
- Intégrer `@tonejs/midi` derrière `MidiCodec`.
- Porter les mappings et avertissements Pianola.
- Valider les round-trips et le corpus de fichiers malformés.

**Sortie :** la v2 ouvre les projets v1, sauvegarde le v2, importe et exporte le
MIDI sans long task sur le thread principal.

### J4 — Refaire l’éditeur et le renderer

Objectif : afficher et naviguer dans un projet réel avec le backend retenu.

- Porter conversions de coordonnées, viewport, snap et index spatial dans
  `editor-engine`.
- Construire les projections visibles et invalidations incrémentales.
- Implémenter le port `PianoRollRenderer` et le backend décidé en J0.
- Ajouter grille, notes, sélection, playhead, labels et changement de DPR.
- Gérer resize, orientation et restauration de contexte graphique.
- Exécuter les benchmarks et snapshots visuels à chaque couche.

**Sortie :** projet 50 000 notes navigable, rendu visuellement équivalent et
budgets de frame respectés, sans interaction d’édition.

### J5 — Refaire les interactions

Objectif : restaurer tous les gestes souris et tactiles.

- Définir l’acteur de session et les machines de gestes XState.
- Implémenter capture, annulation et arbitrage mono/multi-pointeur.
- Connecter les drafts au renderer sans Redux ni rerender React par frame.
- Connecter chaque fin de geste à une transaction du domaine.
- Porter sélection, lasso, dessin, déplacement, resize, appui long, suppression,
  pan et pinch.
- Rejouer toute la matrice pointer et tactile.

**Sortie :** édition complète avec exactement une transaction par geste validé
et aucune transaction lors d’une annulation.

### J6 — Refaire l’audio et le transport

Objectif : retrouver le comportement musical de la v1 sur Tone.js.

- Porter `PlaybackPlanCompiler` sans dépendance Tone.
- Implémenter `ToneAudioSession`, synthés, mixage, master et polyphonie.
- Construire l’acteur de lecture et l’initialisation sur geste utilisateur.
- Connecter les changements de document sans interrompre les voix actives.
- Porter audition du clavier, boucle, seek, pause/reprise et changement de tempo.
- Comparer les plans et enveloppes à la baseline v1.

**Sortie :** tous les tests audio de compatibilité passent dans les navigateurs
cibles et aucune ressource audio ne survit au remplacement d’une session.

### J7 — Refaire l’interface produit

Objectif : assembler l’expérience complète sans reconstruire des primitives
d’accessibilité.

- Créer les tokens et composants `ui-kit` autour de Radix.
- Assembler clips, instruments, transport, toolbar, dialogues et projet.
- Connecter des sélecteurs fins et charger les chunks lourds au besoin.
- Porter responsive, raccourcis, états d’erreur et confirmations.
- Auditer focus, clavier, contraste, aria et tailles tactiles.

**Sortie :** matrice UX complète sur bureau et tablette, captures approuvées et
aucun accès direct au store depuis `ui-kit`.

### J8 — Parité, durcissement et bascule

Objectif : remplacer la v1 sans perte de données ni surprise d’usage.

- Faire tourner toute la suite v1/v2 et résoudre chaque écart documenté.
- Tester une bibliothèque de vrais projets utilisateurs anonymisés si elle est
  disponible.
- Exécuter les tests longs, mémoire, orientation, contexte WebGL et audio.
- Ajouter télémétrie locale de diagnostic exportable, sans collecte distante par
  défaut.
- Préparer une build de prévisualisation et une checklist manuelle tablette.
- Geler les changements fonctionnels de la v1 pendant la recette finale.
- Taguer la dernière v1 et conserver son artefact déployable pour rollback.
- Basculer l’entrée vers `apps/web`, surveiller puis retirer l’ancien `src/`.

**Sortie :** v2 en production, migration v1 couverte et rollback documenté.
L’ancien code n’est supprimé qu’après une période de validation définie dans
l’ADR de bascule.

### J9 — Nettoyage après bascule

Objectif : empêcher que le chantier temporaire devienne l’architecture durable.

- Supprimer les adaptateurs de comparaison v1/v2 et dépendances inutilisées.
- Mettre `docs/architecture.md`, README et guides de contribution à l’état réel.
- Transformer les budgets de J0 en seuils CI.
- Vérifier qu’aucun package ne contourne les exports publics.
- Archiver les ADR abandonnés en conservant la raison de leur rejet.

**Sortie :** dépôt sans double implémentation, documentation navigable et CI
alignée sur l’architecture finale.

## Ordre et points de décision

```text
J0 preuves
 ├── rejet Pixi ──► backend Canvas 2D
 ├── rejet redux-undo ──► historique par patches Immer
 └── rejet Tone ──► scheduler v1 porté derrière AudioSession
        │
        ▼
J1 frontières ──► J2 domaine/store ──► J3 formats
                         │
                         ├──► J4 renderer ──► J5 interactions
                         └──► J6 audio
                                      │
                                      ▼
                              J7 UI ──► J8 bascule ──► J9 nettoyage
```

Un rejet de bibliothèque ne remet donc pas en cause la structure. Il change un
adaptateur, pas les règles ni les consommateurs.

## Risques principaux

| Risque | Signal précoce | Réponse |
| --- | --- | --- |
| divergence fonctionnelle v1/v2 | comportements décrits seulement à l’oral | fixtures et tests avant le portage |
| sur-ingénierie des paquets | nombreuses APIs d’un seul symbole, imports croisés | fusionner les paquets sans frontière réelle |
| régression Pixi sur mobile | chauffe, contexte perdu, texte flou | décision J0 et backend Canvas alternatif |
| interruption audio à l’édition | voix coupées ou doublées | plan pur, événements futurs remplaçables, tests de session |
| historique trop volumineux | croissance mémoire après gestes répétés | seuil J0 puis patches Immer |
| codec tiers sur fichier hostile | Worker bloqué ou mémoire excessive | taille limite, timeout, terminaison et validation |
| Redux dans les chemins chauds | action par `pointermove` ou playhead | profil CI et runtime impératif local |
| XState utilisé comme base de données | contexte acteur contenant projet ou buffers | machines limitées aux cycles de vie |
| double maintenance trop longue | correction faite seulement en v1 ou v2 | gel fonctionnel, fenêtre de réécriture et journal d’écarts |
| bundle gonflé par la stack | chunk initial en hausse continue | analyse CI, imports ciblés et chargement différé |

## Définition de terminé

La réécriture globale est terminée uniquement si :

- toutes les lignes de la matrice de compatibilité sont vertes ;
- les fichiers `.pianola` v1 valides du corpus s’ouvrent sans perte ;
- les budgets mesurés en J0 sont respectés sur le matériel cible ;
- Undo/Redo ne contient que des mutations du document et reste atomique ;
- aucun chemin haute fréquence ne dispatch dans Redux ou rerend la racine React ;
- les paquets purs compilent et se testent sans les bibliothèques navigateur ;
- les dépendances vont dans la direction documentée et aucun cycle n’est toléré ;
- les dialogues et menus sont utilisables au clavier et au tactile ;
- les erreurs de fichiers et d’audio sont récupérables et compréhensibles ;
- l’ancienne implémentation est retirée après validation, pas conservée comme
  seconde architecture officieuse ;
- README, architecture, ADR et commandes de développement correspondent au
  dépôt réellement livré.

## Première itération recommandée

La première pull request ne doit installer aucune bibliothèque de production.
Elle doit créer le harnais de décision :

1. documenter dix parcours v1 critiques ;
2. ajouter leurs fixtures et états attendus ;
3. enregistrer la baseline de performance ;
4. créer quatre prototypes jetables pour renderer, audio, historique et MIDI ;
5. rédiger les ADR avec mesures, décision et condition de réexamen.

Cette itération évite de transformer une préférence de stack en contrainte
irréversible. Une fois les preuves acquises, J1 peut figer les dépendances et le
workspace.

## Documentation des choix

Les décisions proposées s’appuient sur les documentations officielles suivantes :

- [Redux Toolkit — `createEntityAdapter`](https://redux-toolkit.js.org/api/createEntityAdapter),
  [listener middleware](https://redux-toolkit.js.org/api/createListenerMiddleware)
  et [guide de style Redux](https://redux.js.org/style-guide/) ;
- [redux-undo](https://redux-undo.js.org/) et
  [patches Immer](https://immerjs.github.io/immer/patches/) pour les deux
  stratégies d’historique évaluées ;
- [XState v5](https://stately.ai/docs) pour les machines et acteurs ;
- [Tone.js](https://tonejs.github.io/docs/) pour le transport et le graphe audio ;
- [architecture PixiJS v8](https://pixijs.com/8.x/guides/concepts/architecture)
  et [état de ses renderers](https://pixijs.com/8.x/guides/components/renderers) ;
- [Zod 4](https://zod.dev/packages/zod) pour les schémas de frontière ;
- [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction)
  pour les composants accessibles non stylés ;
- [`@tonejs/midi`](https://github.com/Tonejs/Midi) pour le codec SMF ;
- [Comlink](https://github.com/GoogleChromeLabs/comlink) pour l’interface Worker ;
- [Vitest](https://main.vitest.dev/guide/why),
  [fast-check](https://fast-check.dev/docs/introduction/what-is-property-based-testing/)
  et [Playwright](https://playwright.dev/docs/next/emulation) pour la stratégie de
  vérification ;
- [références de projets TypeScript](https://www.typescriptlang.org/docs/handbook/project-references)
  pour les frontières de compilation du workspace.
