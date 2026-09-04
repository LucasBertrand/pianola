# Cartographie de migration

Ce document relie l'état du dépôt au 4 septembre 2026 à l'architecture cible.
Il sert à décider où déplacer un fichier avant de le modifier et à éviter que
les anciennes couches soient simplement recréées sous d'autres noms.

## 1. Carte des zones actuelles

| Source actuelle | Destination principale | Traitement |
| --- | --- | --- |
| `src/bootstrap/` | `src/app/` et `src/main.tsx` | limiter cette zone à la composition, absorber les choix concrets encore faits dans les hooks |
| `src/domain/project/`, `clips/`, `notes/`, `instruments/`, `transport/` | sous-capacités de `src/project/` | déplacer puis consolider modèles, défauts, validations et constantes par concept |
| `src/domain/music-theory/` | `src/project/timeline/pitch-pattern.ts` et `src/editor/pitch/` | garder dans le projet le vocabulaire persisté ; déplacer snap, reconnaissance et libellés dans l'éditeur |
| `src/domain/commands/` | sous-capacité concernée de `src/project/` | colocaliser types et reducers ; conserver une transaction commune |
| `src/domain/note-collision.ts`, `selection-transformations.ts` | `src/project/notes/` et `src/project/` ou `src/editor/selection/` selon l'autorité | séparer calcul métier et plan de transaction/sélection |
| `src/application/history/project-store.ts` | racine de `src/project/` | faire du store un store de `ProjectDocument` seulement |
| `src/application/history/editor-command-service.ts` | `src/editor/editor-history-controller.ts` | conserver les checkpoints de sélection autour de l'historique sans contaminer le store musical |
| `src/application/editor-session/` | `src/editor/` ; création concrète dans `src/app/` | distribuer session, réglages persistés et previews au propriétaire réel |
| `src/application/piano-roll/` | `src/editor/` ou `src/project/` | garder les intentions éditoriales près de l'éditeur ; envoyer les mutations durables dans `project` |
| `src/editor-core/` | sous-dossiers directs de `src/editor/` ; playhead vers `src/audio/` | supprimer la racine hybride, préserver fichier par fichier l'absence de dépendance navigateur |
| `src/application/audio/`, `ports/audio-transport.ts` | racine de `src/audio/` | regrouper plan, contrat de transport et contrôle de lecture |
| `src/application/dialogs/` | `src/editor/ui/dialog/` | assumer le caractère graphique de ce contrat |
| `src/application/product/` | nom visible sous `src/editor/`, slug de fichier sous `src/project-io/pianola/` | supprimer l'objet global et colocaliser ses deux valeurs |
| `src/application/project-files/` | `src/project/` pour la création initiale ; `src/project-io/` pour plans et migration | séparer création du document et frontières d'entrée/sortie |
| ports de persistance sous `src/application/ports/` | `src/project-io/local/` ou près du service consommateur | rapprocher contrat et adaptateurs, sans dossier de ports horizontal |
| `src/infrastructure/audio/` | `src/audio/browser/`, `worklet/` et `synth/` | déplacer sans réécrire les algorithmes temps réel |
| `src/presentation/transport/` | `src/editor/transport/` et contrôleur non React à la racine audio | découpler le contrôle visuel du moteur headless |
| `src/application/persistence/` et ports de persistance | `src/project-io/` | rapprocher autosave, contrats et implémentations de leur cycle de vie |
| `src/infrastructure/persistence/` et `migration/` | `src/project-io/local/` et `versioning/` | renommer le vocabulaire d'erreur générique, garder les codecs stricts |
| `src/infrastructure/project-files/` | `src/project-io/pianola/` et `midi/` | garder les codecs, déplacer l'orchestration MIDI au point d'entrée du flux |
| `src/presentation/project-files/` | `src/editor/project-menu/` | les hooks deviennent des adaptateurs visuels des opérations headless de `project-io` |
| `src/presentation/piano-roll/`, `inspector/`, `editor-toolbar/`, `radial-menu/` | `src/editor/` | déplacer par surface et supprimer les hooks de pure orchestration durable |
| `src/presentation/dialogs/` | `src/editor/dialogs/` ou `src/editor/ui/dialog/` | dialogue produit et mécanique visuelle restent dans l'éditeur |
| `src/presentation/slider/`, `command-icons/` | `src/editor/ui/` | conserver comme primitives internes à l'éditeur |
| `src/presentation/home/`, `diagnostics/`, `editor-header/` | `src/editor/home/`, `diagnostics/`, `header/` | toute surface visible appartient à l'éditeur ; supprimer les passe-plats |
| `src/infrastructure/browser/` | `src/app/register-service-worker.ts` | rattacher cet adaptateur au démarrage sans créer une nouvelle sous-couche |
| `src/presentation/styles/` | `src/editor/styles/` et primitives sous `src/editor/ui/` | aucun CSS dans `app`, `audio`, `project` ou `project-io` |

Les tests suivent leur module propriétaire. Les scénarios réellement
transversaux restent sous `tests/integration/` jusqu'au dernier lot, où leurs
imports et noms sont mis à jour en une fois.

## 2. Traitement des constats consolidés

### État de session mélangé au document

**Constat retenu.** `EditorSessionState extends ProjectDocument` oblige le
store à retirer puis réinjecter `workspace` autour de l'historique.

**Cible.** `ProjectStore<ProjectDocument>` d'un côté ; `EditorSession` compose
le store, `EditorProjectSettings` et l'état d'interaction de l'autre. Les
reducers ne reçoivent plus une session globale. Les sélecteurs UI combinent
leurs snapshots à la frontière de rendu seulement.

**Compatibilité.** Le wire model des codecs reste distinct du modèle runtime.
Le déplacement d'`autoScrollEnabled` ne change donc pas silencieusement le
format persistant courant.

### Constantes globales hétérogènes

**Constat retenu.** `PROJECT_CONSTANTS` et `EDITOR_CONSTANTS` mélangent
invariants musicaux, historique, rendu, contrôles et limites de format.

**Cible.** Déplacer chaque valeur chez son consommateur conceptuel, puis
supprimer les deux objets. Une valeur partagée par plusieurs capacités possède
un nom exporté depuis le concept métier réel, jamais depuis un fichier
`constants` générique.

### Plans de marqueurs mêlant métier et vue

**Constat retenu.** `time-map-marker-plans.ts` expose à la fois commandes,
draft de dialogue, flags et libellés.

**Cible.** Trois ensembles cohésifs :

- opérations et validation des marqueurs dans `project/timeline/` ;
- projection et commit du geste dans `editor/interactions/` ;
- draft, flags et libellés dans `editor/dialogs/` et la couche de rendu du
  ruler.

La primitive pure qui calcule projection et commit reste unique afin d'éviter
une divergence entre preview et résultat durable.

### Modèle de dialogue placé en application

**Constat retenu.** Boutons, labels et ton graphique forment un contrat de vue.

**Cible.** Déplacer le mécanisme dans `editor/ui/dialog/`. Les fonctions métier
retournent une erreur ou une alternative typée ; les hooks traduisent ce
résultat en contenu de modale. Aucun module `project` ne dépend du modèle de
dialogue.

### Création d'un projet MIDI dans l'infrastructure

**Constat retenu.** Le décodage SMF est terminé lorsque le module construit un
projet et sa sélection.

**Cible.** `project-io/midi/import-midi-project.ts` orchestre décodage, analyse,
décision fournie par l'éditeur et construction du `ProjectDocument`. Le
lecteur/écrivain SMF reste un codec pur. La session est créée ensuite par
l'éditeur à partir du document ; l'importeur MIDI ne la connaît pas.

### Transactions construites dans les hooks React

**Constat retenu.** Split, concaténation, duplication, instruments, sélection et
certains marqueurs génèrent identifiants et tableaux de commandes dans des
hooks.

**Cible.** Une fonction d'intention non React par action durable reçoit le
snapshot nécessaire et un `IdGenerator`, puis retourne une transaction ou un
résultat nécessitant une décision utilisateur. Le hook gère seulement le cycle
React, le dialogue et le dispatch final.

Le drag de hiérarchie, la capture de pointeur et les calculs dépendant du DOM
restent dans l'éditeur ; seule leur commande finale est déléguée.

### Geste de boucle isolé dans un hook

**Constat retenu.** Il porte machine d'état, seuils et géométrie alors que les
gestes comparables disposent de recognizers purs.

**Cible.** Créer une session pure de geste de boucle à côté des gestes de notes
et marqueurs. Le hook conserve pointer capture, mesure DOM, invalidation et
cycle de vie React.

### `editor-core` hybride

**Constat retenu avec nuance.** L'isolation pure est utile ; le nom et le
périmètre racine ne le sont plus.

**Cible.** Distribution explicite :

| Contenu actuel | Destination |
| --- | --- |
| `geometry/` | `editor/canvas/` si propre au rendu, sinon `editor/interactions/` si propre au ciblage |
| recognizers et échantillons neutres | `editor/interactions/` |
| `selection/` | `editor/selection/` |
| viewport | `editor/viewport/` |
| signaux de rendu et masque | `editor/canvas/` |
| styles de note et options de label/couleur | `editor/canvas/` ou `editor/preferences/` |
| `playhead-position.ts` | `audio/playback-controller.ts` ou un type voisin |

Les dépendances globales d'`EditorSelection` et `ViewportController` sont
remplacées par des paramètres étroits. Le formatage d'en-tête sort du
contrôleur de viewport.

### Hook audio transversal

**Constat retenu sans qualifier l'import actuel de violation.** Le problème est
la concentration, pas la légalité de l'import.

**Cible.** Quatre responsabilités visibles :

1. compilation pure de `PlaybackPlan` ;
2. `PlaybackController` pour source, playhead, enchaînement et actions ;
3. adaptateur `BrowserAudioEngine` pour cycle Web Audio et worklet ;
4. hook React d'abonnement et composants sous `editor/transport`.

Les previews tempo, boucle et instrument restent des canaux indépendants et
versionnés. Le refactoring ne fusionne pas ces états.

### Composition dispersée

**Constat retenu.** Transport, scheduler, codecs et repositories sont encore
choisis dans plusieurs hooks de présentation.

**Cible.** `app/create-app-runtime.ts` construit ou injecte ces implémentations,
sans posséder d'écran ou de workflow. Les capacités reçoivent des objets ou
fabriques explicites. Les besoins liés à un geste utilisateur, tel le démarrage
Web Audio, sont représentés par une fabrique paresseuse et non par une
instanciation cachée dans un hook.

### Identifiants et temps dispersés

**Constat retenu.** `crypto.randomUUID`, `Date.now`, `Math.random` et compteurs
React sont utilisés selon les flux.

**Cible.** Une implémentation navigateur unique de `IdGenerator` et `Clock` est
créée par `app`. Seuls les workflows qui créent réellement des identités ou
horodatages reçoivent ces fonctions. Il n'est pas créé de conteneur de services
global.

### Noyau de migration et erreurs mal nommés

**Constat retenu.** `ProjectPersistenceError` sert au-delà de la persistance
locale.

**Cible.** `project-io/versioning/` possède lecture JSON stricte, routeur de
migration et une erreur d'enveloppe générique. Les erreurs `.pianola`, MIDI et
IndexedDB traduisent cette erreur à leur frontière sans partager un vocabulaire
trompeur.

### `music-theory` mélange projet et éditeur

**Constat vérifié.** Les six fichiers et 503 lignes réunissent un type de
marqueur persistant, un réglage de session, le snap, des groupes de sélecteur,
des glyphes et un résumé d'accords. `chord-recognition.ts` n'a qu'un consommateur
produit, dans le header ; les fonctions de notation et d'orthographe ne servent
qu'au rendu. `pitch-snap.ts` est largement consommé parce qu'il réunit toutes
ces responsabilités.

**Cible.** `project/timeline/pitch-pattern.ts` garde types, valeurs persistables
et validation. `editor/pitch/` reçoit réglages, snap, options, labels et
reconnaissance. Il n'existe pas de racine `music-theory`.

### Façade `time-map.ts`

**Constat vérifié.** Le fichier actuel ne contient que des réexports : environ
53 symboles provenant de sept modules. Il est importé par 39 fichiers produit
et 16 fichiers de test/support. C'est la seule surface dédiée dont tout le
contenu est une agrégation de réexports.

**Cible.** Absorber `time-map-model.ts` dans un véritable
`project/timeline/time-map.ts`, puis importer navigation, opérations de
marqueurs, normalisation et éditions structurelles depuis leurs modules précis.

### Code produit réservé aux tests

**Constat retenu.** `audio/time-math.ts` et le codec direct n'appartiennent pas
au chemin produit actuel.

**Cible.** Vérifier leurs références au moment du lot de nettoyage. Supprimer
le premier s'il ne spécifie plus aucun comportement ; déplacer l'adaptateur
direct dans le support de test ou tester le codec synchrone réel sans wrapper.
Ne pas conserver un faux point d'entrée produit pour satisfaire un test.

## 3. Constats qui ne déclenchent pas de migration

Les décisions suivantes sont explicites afin qu'un agent ne « corrige » pas un
élément volontaire :

- l'usage de Tonal dans un calcul musical pur reste accepté ;
- `InstrumentPresetDialog.tsx`, `ClipInspector.tsx`, `note-collision.ts` et les
  parseurs volumineux ne sont pas découpés en fonction d'un seuil de lignes ;
- les dossiers DSP mono-concept restent séparés lorsque leurs contraintes et
  tests sont autonomes ;
- l'adaptateur DOM de téléchargement peut vivre près de l'UI qui l'utilise ;
- les noms et champs persistés spéculatifs ne sont pas supprimés dans ce
  chantier structurel ;
- le moteur audio, les règles temporelles, la stratégie de collision et les
  formats de données ne sont pas réécrits sans anomalie fonctionnelle prouvée.

## 4. Preuve de fin de cartographie

Avant de supprimer une ancienne racine, l'agent propriétaire vérifie que :

1. chaque fichier produit a une destination ou une décision de suppression
   consignée dans `MIGRATION_STATE.md` ;
2. chaque test a suivi son propriétaire ou reste explicitement transversal ;
3. chaque README et entrée de carte du code dispose d'un remplaçant cible ;
4. aucun import temporaire via un proxy ou un barrel de compatibilité ne masque
   un chemin restant ;
5. les chemins encore présents appartiennent à un lot futur identifié.
