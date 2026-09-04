# Séquence des chantiers

## 1. Stratégie de séquencement

Le chantier accepte une application non compilable entre les lots. Il évite
donc les couches de compatibilité temporaires et les doubles arborescences
maintenues artificiellement. En contrepartie, l'ordre est strict : on sépare
d'abord les autorités d'état, puis on déplace les propriétaires, puis on
simplifie leurs flux, et seulement ensuite on stabilise l'ensemble.

Après le lot `P00`, les tests, builds et pipelines ne sont pas des critères de
passage intermédiaires. Les critères portent sur la complétude du déplacement,
l'absence d'autorité dupliquée et la qualité de la consigne de reprise. Toute
validation complète est concentrée dans `P10`.

## 2. Vue chronologique

| Lot | Objet | Dépend de | État fonctionnel attendu |
| --- | --- | --- | --- |
| `P00` | baseline, filets et journal | aucun | version de départ validée |
| `P01` | vocabulaire cible et squelette de migration | `P00` | peut encore compiler, non exigé |
| `P02` | séparation document/session/réglages | `P01` | rupture transitoire probable |
| `P03` | consolidation du module `project` | `P02` | imports anciens incomplets acceptés |
| `P04` | absorption d'`editor-core` dans `editor` | `P02`, `P03` | UI potentiellement indisponible |
| `P05` | intentions durables hors React | `P03`, `P04` | flux en cours de reconnexion |
| `P06` | regroupement du flux audio | `P03`, `P04` | audio temporairement indisponible |
| `P07` | regroupement du cycle `project-io` | `P02`, `P03` | persistance/import temporairement indisponibles |
| `P08` | composition finale et shell | `P05`, `P06`, `P07` | convergence vers une application compilable |
| `P09` | suppression des reliquats et documentation courante | `P08` | arborescence cible complète |
| `P10` | convergence, validation globale et recette | `P09` | application livrable |

Une seule tâche est `IN_PROGRESS` à la fois dans `MIGRATION_STATE.md`. Un lot
peut être confié à un nouvel agent, mais deux agents ne modifient jamais la
même famille de fichiers en parallèle.

## 3. Lots détaillés

### P00 — Baseline et filets de sécurité

**But.** Rendre la version de départ, les données de compatibilité et les
scénarios humains récupérables avant toute rupture.

Tâches :

- `P00-T01` — inscrire dans `MIGRATION_STATE.md` la branche dédiée, le commit de
  base, le résultat de `git status --short` et les changements préexistants à
  préserver ;
- `P00-T02` — référencer les fixtures `.pianola`, snapshots locaux, réglages et
  MIDI couvrant toutes les versions supportées ; ajouter seulement les cas
  manquants qui sont nécessaires à la compatibilité structurelle ;
- `P00-T03` — enregistrer une exécution verte de `npm run verify` sur la
  baseline et capturer la recette manuelle de référence : Canvas, souris,
  tactile/stylet, responsive, lecture, previews, import/export et récupération
  locale ;
- `P00-T04` — initialiser le journal, nommer le premier propriétaire et définir
  `next_action` sur `P01-T01`.

Critères de passage :

- un SHA ou autre référence immuable permet de retrouver exactement la
  baseline ;
- les changements qui existaient avant le chantier sont listés et attribués ;
- les chemins des fixtures et les résultats de référence sont consignés ;
- la politique `validation_mode: final-only` est inscrite ;
- aucune donnée utilisateur n'est copiée dans une fixture ou le journal.

Instruction de reprise : exécuter `P01-T01` depuis la référence de travail
consignée, en lisant d'abord la section active de `MIGRATION_STATE.md`.

### P01 — Vocabulaire cible et cadre de migration

**But.** Installer les règles qui empêchent de recréer les anciennes couches
sous des noms différents.

Tâches :

- `P01-T01` — ajouter les README racine de `app`, `project`, `editor`, `audio`
  et `project-io` au fur et à mesure de la création de ces dossiers ; y
  copier seulement responsabilité, point d'entrée et dépendances cibles ;
- `P01-T02` — adapter les scripts de structure et de frontières pour accepter
  simultanément les chemins source et cible pendant le chantier, tout en
  interdisant les cycles et les dépendances contraires au graphe cible ;
- `P01-T03` — créer une table temporaire exhaustive `ancien chemin → lot →
  destination` dans le journal ou dans un fichier de travail référencé par le
  journal ;
- `P01-T04` — réserver les nouveaux termes `Editor`, `EditorSession`,
  `EditorProjectSettings`, `EditorInteractionState` et
  `PlaybackController` ; interdire toute nouvelle
  occurrence ambiguë de `Workspace`.

Ne pas créer de proxies de réexport, alias TypeScript globaux ou barrels pour
faire coexister les deux structures. Les imports cassés sont acceptés.

Critères de passage :

- chaque fichier produit de `src/` est assigné à un lot et une destination ;
- le graphe de dépendances cible est écrit dans les scripts ou leur fichier de
  configuration, même si les anciens chemins bénéficient d'une tolérance
  temporaire explicitement marquée ;
- aucune destination « divers », `common`, `shared`, `utils` ou `helpers`
  n'apparaît dans la table ;
- `next_action` pointe sur `P02-T01`.

### P02 — Séparer les durées de vie de l'état

**But.** Éliminer la cause structurelle la plus profonde avant les déplacements
massifs.

Tâches :

- `P02-T01` — remplacer `EditorSessionState extends ProjectDocument` par trois
  objets composés : `ProjectDocument`, `EditorProjectSettings` et
  `EditorSession` ;
- `P02-T02` — faire accepter aux commandes et reducers un
  `ProjectDocument`; faire de `ProjectStore` l'autorité de ce document seul ;
- `P02-T03` — sortir `activeClipId` du document et conserver sa restauration
  via les réglages/session, sans le faire entrer dans Undo/Redo ;
- `P02-T04` — déplacer `autoScrollEnabled` dans
  `EditorProjectSettings`; conserver le wire model courant par un adaptateur
  explicite sous `editor`, sans faire dépendre les codecs de l'éditeur ;
- `P02-T05` — remplacer les dépendances de `EditorSelection` et
  `ViewportController` à la session entière par des snapshots ou requêtes
  étroits ; sortir le formatage d'en-tête du contrôleur ;
- `P02-T06` — mettre à jour capture/restauration de workspace, sélecteurs et
  snapshots de sélection autour des transactions.

Critères de passage :

- `rg "EditorSessionState" src` ne retourne plus de code produit ;
- `ProjectStore` ne contient plus de fonctions de retrait, préservation ou
  réinjection de `workspace` ;
- une mutation musicale ne reçoit jamais les réglages UI complets ;
- le schéma écrit reste à sa version actuelle et chaque translation de champ
  est explicite ;
- la table de propriété d'état de l'architecture cible reflète le code obtenu.

Instruction de reprise en cas d'arrêt : prendre le premier résultat restant de
`rg "EditorSessionState|preserveWorkspace|resolveWorkspace" src`, l'associer à
`P02-T0x` et documenter pourquoi il subsiste avant toute autre migration.

### P03 — Construire le module `project`

**But.** Rassembler modèle durable, règles, commandes et historique par concept
musical.

Tâches :

- `P03-T01` — déplacer `ProjectDocument`, identifiants, clips, notes,
  instruments, timeline, master bus et théorie musicale sous `src/project/` ;
- `P03-T02` — déplacer `ProjectStore` et son historique de documents à la
  racine du module ; déplacer séparément les checkpoints de sélection dans un
  `EditorHistoryController` sous `editor`, puis réduire les interfaces
  dupliquant exactement les classes concrètes ;
- `P03-T03` — colocaliser types de commandes et reducers par famille
  (`notes`, `clips`, `instruments`, `timeline`, projet), puis conserver une
  union/transaction commune explicite ;
- `P03-T04` — distribuer `PROJECT_CONSTANTS` chez les concepts propriétaires et
  supprimer l'objet global ;
- `P03-T05` — regrouper les micro-fichiers qui changent ensemble : modèle,
  défauts et validation d'instrument ; synthé et enveloppes de configuration ;
  bibliothèque de presets ; primitives de commande indissociables ;
- `P03-T06` — séparer le calcul d'intervalles de collision du plan de
  transaction et de restauration de sélection ;
- `P03-T07` — distribuer `domain/music-theory` : types, valeurs persistables et
  validation des motifs sous `project/timeline/pitch-pattern.ts`; affecter le
  reste à `P04-T07` ;
- `P03-T08` — absorber `time-map-model.ts` dans un vrai
  `project/timeline/time-map.ts`, supprimer ses réexports et rediriger les
  consommateurs vers navigation, marqueurs, normalisation ou éditions
  structurelles.

Ne pas réécrire les algorithmes de time map, split/concaténation, collision ou
théorie musicale dans ce lot. Un déplacement mécanique peut être combiné avec
une consolidation évidente, mais toute modification sémantique imprévue est
consignée et reportée.

Critères de passage :

- les anciens fichiers produit de `src/domain/` et
  `src/application/history/` ont tous une destination ou une suppression
  justifiée ;
- le module `project` n'importe aucun autre module produit, hors bibliothèque
  musicale pure déjà acceptée ;
- `PROJECT_CONSTANTS` n'existe plus ;
- chaque intention durable retourne au plus une transaction ;
- `time-map.ts` contient une implémentation et aucun réexport d'agrégation ;
- le module `project` ne contient plus de fonction de snap, de libellé ou de
  reconnaissance destinée à l'éditeur.

### P04 — Construire `editor` et supprimer la catégorie `editor-core`

**But.** Colocaliser la surface d'édition et ses mécanismes sans abandonner la
pureté des calculs.

Tâches :

- `P04-T01` — déplacer l'accueil, le menu projet, la présentation du piano
  roll, l'inspecteur, header, toolbar, dialogues, diagnostics et menu radial
  sous `src/editor/` ;
- `P04-T02` — redistribuer géométrie, interactions, sélection, viewport et
  signaux d'`editor-core` dans la sous-capacité qui les consomme ;
- `P04-T03` — déplacer styles de rendu, préférences de couleur/label et
  constantes UI chez Canvas, viewport, contrôles ou préférences ; supprimer
  `EDITOR_CONSTANTS` ;
- `P04-T04` — extraire du hook de boucle une session pure alignée avec les
  gestes de notes et marqueurs ; laisser DOM et React dans l'adaptateur ;
- `P04-T05` — renommer les interfaces locales `*Port` en `*Handle`,
  `*Snapshot` ou `*Actions`, et appliquer le vocabulaire de session cible ;
- `P04-T06` — déplacer les tests unitaires avec leurs modules et laisser les
  tests traversants dans `tests/integration/` ;
- `P04-T07` — déplacer sous `editor/pitch/` les réglages et calculs de snap,
  options de sélecteur, labels, orthographe tonale et reconnaissance d'accords.

Critères de passage :

- `src/editor-core/` ne contient plus de code ; sa suppression physique est
  enregistrée ;
- aucune arborescence `editor/piano-roll/` n'est créée : `editor` est le piano
  roll au sens produit ;
- les fichiers purs migrés n'importent ni React, ni DOM, ni Canvas, ni Web
  Audio ;
- les adaptateurs d'événements portent explicitement la conversion DOM →
  échantillon neutre ;
- `EDITOR_CONSTANTS` et les noms techniques ambigus de workspace ont disparu
  du code produit ;
- `src/domain/music-theory/` a disparu et ses responsabilités sont réparties
  entre `project/timeline` et `editor/pitch` ;
- la preview d'un geste reste séparée du document publié.

### P05 — Sortir les intentions durables de React

**But.** Donner un point d'entrée non React aux workflows qui construisent des
identités, commandes et transactions.

Tâches :

- `P05-T01` — extraire split, concaténation, duplication et réordonnancement
  final des hooks de clips ;
- `P05-T02` — extraire création, modification et preset d'instrument, avec une
  preview toujours transitoire ;
- `P05-T03` — réorganiser `selection-edit-plans.ts` autour de trois parcours
  cohésifs : clipboard, transformations de sélection et transfert
  d'instrument ;
- `P05-T04` — séparer modèle de dialogue/labels des opérations et commits de
  marqueurs sans dupliquer le calcul de projection ;
- `P05-T05` — créer `IdGenerator` et `Clock` minimaux, injectés seulement aux
  intentions qui en ont besoin ; supprimer les UUID, temps, hasard et compteurs
  React utilisés pour des identités durables ;
- `P05-T06` — déplacer le contrat graphique de dialogue dans
  `editor/ui/dialog/` et faire traduire les résultats métier par les
  adaptateurs UI.

Critères de passage :

- aucun hook React ne construit directement un tableau de commandes pour une
  intention durable ;
- les hooks concernés ne génèrent plus d'identité métier ou de transaction ;
- une fonction d'intention peut être appelée sans monter React ;
- la demande de confirmation reste une préoccupation UI et le résultat confirmé
  produit une transaction unique ;
- les opérations DOM de drag, focus et pointer capture restent dans
  l'adaptateur approprié.

### P06 — Regrouper et simplifier le flux audio

**But.** Créer un propriétaire unique du plan de lecture jusqu'au worklet et
réduire `useAudioPlayback` à un adaptateur React.

Tâches :

- `P06-T01` — déplacer source et compilation du plan dans `src/audio/` ; garder
  un modèle projet lisible avant la projection transférable ;
- `P06-T02` — déplacer transport navigateur, synchroniseur, protocole, worklet
  et DSP sans changer leurs algorithmes ni allocations ;
- `P06-T03` — créer `PlaybackController` pour source, playhead, seek,
  enchaînement, audition et publication des previews ;
- `P06-T04` — isoler `BrowserAudioEngine` et sa fabrique paresseuse ; injecter
  cette fabrique depuis `app` ;
- `P06-T05` — remplacer `useAudioPlayback` par un hook d'abonnement/actions sous
  `editor/transport`; garder composants et styles dans l'éditeur ;
- `P06-T06` — supprimer `audio/time-math.ts` si son absence d'usage produit est
  toujours confirmée, sinon lui donner un consommateur et un propriétaire réels.

Critères de passage :

- un seul contrôleur possède le playhead et le choix de la source ;
- React ne possède ni horloge audio ni logique d'auto-enchaînement ;
- `src/audio/` ne contient aucun React, JSX, DOM, composant ou CSS ;
- tempo, boucle et instrument gardent des previews indépendantes et versionnées ;
- le chemin `process()` du worklet ne reçoit aucune allocation ou abstraction
  nouvelle ;
- `app` choisit l'adaptateur Web Audio concret ;
- aucun fichier audio produit n'est référencé uniquement par un test sans que
  ce statut soit explicite.

### P07 — Regrouper le cycle de vie dans `project-io`

**But.** Rendre visibles les flux complets de création, ouverture, autosave,
import, export et récupération.

Tâches :

- `P07-T01` — déplacer interfaces de repository, autosave, codecs et
  implémentations mémoire/IndexedDB/Worker sous `project-io/local/` ;
- `P07-T02` — déplacer le routeur de versions, lecteurs JSON partagés et erreur
  d'enveloppe générique sous `project-io/versioning/` ;
- `P07-T03` — réunir codec portable, schéma, parseurs et migrations sous
  `project-io/pianola/`, sans changer format ni version ;
- `P07-T04` — réunir codec SMF, analyse, collisions d'import, construction de
  projet et export sous `project-io/midi/` ; créer une façade
  `importMidiProject` qui ne construit pas de session d'éditeur ;
- `P07-T05` — rendre les hooks de fichiers minces et les déplacer avec le menu
  et l'accueil sous `editor`; ils consomment les opérations headless de
  `project-io` ;
- `P07-T06` — faire posséder à `project-io` le wire DTO des réglages et à
  `editor` sa conversion vers `EditorProjectSettings`, sans import inverse ;
- `P07-T07` — déplacer le codec direct réservé aux contrats vers le support de
  test, ou tester directement le codec synchrone réel ;
- `P07-T08` — centraliser la génération d'identifiants de documents via
  l'implémentation injectée par `app`.

Critères de passage :

- chaque action de cycle de vie possède une façade identifiable ;
- les codecs traitent toujours l'entrée comme inconnue, routent les versions et
  valident le modèle courant strictement ;
- la construction métier issue de MIDI n'est plus présentée comme un codec ou
  un adaptateur d'infrastructure ;
- aucune constante navigateur ne vit avec les constantes de format ;
- `ProjectPersistenceError` n'est plus le vocabulaire d'une erreur générique de
  fichier/version ;
- `src/project-io/` ne contient aucun React, JSX, DOM, composant, CSS ou import
  depuis `editor` ;
- la création du téléchargement DOM appartient à `editor/project-menu`, tandis
  que `project-io` retourne contenu, nom et type MIME.

### P08 — Finaliser l'assemblage et le shell de l'éditeur

**But.** Reconnecter les capacités à une composition unique et supprimer les
indirections visuelles sans valeur.

Tâches :

- `P08-T01` — déplacer l'entrée Vite vers `src/main.tsx`; limiter `src/app/` à
  `App.tsx` et `create-app-runtime.ts`; confirmer que page d'accueil, shell et
  diagnostics visibles sont sous `src/editor/` ;
- `P08-T02` — faire construire à `app-runtime.ts` repositories, codecs,
  scheduler, générateurs et fabrique audio ; exposer aux écrans des contrôleurs
  déjà assemblés ;
- `P08-T03` — remplacer la grande interface runtime plate par des sous-objets
  nommés (`project`, `editor`, `playback`, `projectIo`) ;
- `P08-T04` — composer accueil, header, transport et menu projet dans
  `editor/Editor.tsx` et son shell ; supprimer les trois composants d'en-tête
  qui ne font que relayer leurs props ;
- `P08-T05` — déplacer les primitives visuelles partagées entre surfaces dans
  `editor/ui` et laisser chaque contrôle spécialisé chez sa surface ;
- `P08-T06` — colocaliser tous les CSS sous `editor` et y établir un ordre
  d'import unique préservant tokens, reset, surfaces et responsive.

Critères de passage :

- aucune capacité autre qu'`app` ne choisit une implémentation IndexedDB,
  Worker, scheduler, Web Audio ou service worker ;
- `app` ne contient aucun écran, workflow utilisateur ou CSS ;
- `audio` et `project-io` ne dépendent pas d'`editor`; l'éditeur consomme leurs
  API headless ;
- la runtime n'est plus un sac plat de signaux sans propriétaire ;
- les composants passe-plats identifiés ont disparu ;
- `editor/ui` ne contient que des primitives utilisées par plusieurs surfaces
  de l'éditeur ;
- l'ordre de cascade CSS est écrit et lisible en un point.

### P09 — Nettoyage structurel et documentation courante

**But.** Retirer toutes les béquilles de chantier et faire de la cible la seule
architecture décrite.

Tâches :

- `P09-T01` — supprimer les anciennes racines devenues vides, alias, tolérances
  temporaires et chemins de compatibilité ;
- `P09-T02` — rechercher imports morts, fichiers produit utilisés seulement par
  les tests, composants passe-plats et duplications créées par les déplacements ;
- `P09-T03` — mettre à jour `README.md`, `docs/README.md`, `docs/code-map.md`,
  `docs/architecture.md`, `docs/state-ownership.md`, guides et README de module ;
- `P09-T04` — remplacer dans les scripts de structure/frontières la tolérance
  transitoire par une liste fermée des modules et du graphe cibles ;
- `P09-T05` — mettre à jour tsconfig, Vite, imports Worker/Worklet, chemins CSS
  et tests sans conserver les anciens chemins ;
- `P09-T06` — relire le diff complet et attribuer chaque changement soit au
  chantier, soit à une modification utilisateur préexistante laissée intacte.

Critères de passage :

- `src/domain`, `src/application`, `src/editor-core`, `src/infrastructure`,
  `src/presentation` et `src/bootstrap` n'existent plus ;
- une recherche des anciens préfixes d'import ne retourne rien dans code,
  scripts et documentation courante ;
- la carte du code part exclusivement des capacités cibles ;
- les règles de frontières décrivent le graphe cible sans exception nominative
  héritée ;
- la liste de changements préexistants est toujours présente dans le journal ;
- aucune suppression de l'archive `docs/migration/` n'a été effectuée.

### P10 — Convergence et validation finale

**But.** Rétablir l'intégrité globale une seule fois, puis démontrer la parité
fonctionnelle.

Tâches :

- `P10-T01` — résoudre toutes les erreurs de TypeScript, imports, build Vite et
  chargement Worker/Worklet sans réintroduire d'ancienne frontière ;
- `P10-T02` — exécuter `npm run verify`, corriger jusqu'à un résultat vert et
  enregistrer commande, date, environnement et résultat ;
- `P10-T03` — exécuter la recette manuelle définie dans
  [Points d'attention](points-attention.md), comparer à la baseline et joindre
  les anomalies/résolutions ;
- `P10-T04` — confirmer la lecture de toutes les versions persistées supportées,
  les round-trips actuels et l'absence de changement de schéma implicite ;
- `P10-T05` — mettre `MIGRATION_STATE.md` à `COMPLETE`, vider les champs de
  travail en cours et inscrire le dernier checkpoint vérifié.

Critères de clôture :

- `npm run verify` est vert dans son intégralité ;
- la recette navigateur, tactile/Canvas, responsive et Web Audio est signée ;
- les formats et récupérations sont compatibles avec la baseline ;
- aucun TODO de migration, tolérance temporaire ou tâche `BLOCKED` ne subsiste ;
- la documentation décrit le code livré, pas la transition ;
- les changements préexistants ont été préservés ou traités sur instruction
  explicite de leur propriétaire.

## 4. Règle de changement d'ordre

Un agent peut subdiviser une tâche, jamais réordonner silencieusement deux lots.
Pour changer l'ordre :

1. consigner la dépendance découverte dans le journal ;
2. vérifier qu'elle ne crée ni double autorité d'état ni cycle de module ;
3. ajouter la décision dans `MIGRATION_STATE.md` avec les tâches affectées ;
4. mettre à jour ce document si le nouvel ordre devient la trajectoire commune ;
5. définir une nouvelle `next_action` exécutable avant de céder la main.
