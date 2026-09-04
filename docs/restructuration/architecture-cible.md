# Architecture cible

## 1. Forme générale

La cible est une organisation par capacité avec cinq racines. L'éditeur est le
produit visible tout entier : il n'existe donc ni racine `presentation`, ni
sous-arborescence redondante `editor/piano-roll`.

```text
src/
├── main.tsx
├── app/
│   ├── App.tsx
│   ├── create-app-runtime.ts
│   └── register-service-worker.ts
├── project/
│   ├── project.ts
│   ├── identifiers.ts
│   ├── project-store.ts
│   ├── project-history.ts
│   ├── transaction.ts
│   ├── clips/
│   ├── notes/
│   ├── instruments/
│   └── timeline/
├── editor/
│   ├── Editor.tsx
│   ├── editor-session.ts
│   ├── editor-history-controller.ts
│   ├── editor-project-settings.ts
│   ├── home/
│   ├── project-menu/
│   ├── interactions/
│   ├── selection/
│   ├── viewport/
│   ├── canvas/
│   ├── pitch/
│   ├── inspector/
│   ├── header/
│   ├── toolbar/
│   ├── dialogs/
│   ├── transport/
│   ├── preferences/
│   ├── diagnostics/
│   ├── ui/
│   └── styles/
├── audio/
│   ├── playback-controller.ts
│   ├── playback-plan.ts
│   ├── browser/
│   ├── worklet/
│   └── synth/
└── project-io/
    ├── project-lifecycle.ts
    ├── local/
    ├── versioning/
    ├── pianola/
    └── midi/
```

Cette arborescence est une carte, pas une obligation de créer tous les dossiers
dès le départ. Un dossier n'existe que lorsqu'il contient une responsabilité
identifiable. La taille d'un fichier ou l'envie de reproduire une couche ne
justifient jamais seules un niveau supplémentaire.

## 2. Frontières conceptuelles

### `app` — assemblage uniquement

`app` démarre l'application, choisit les implémentations concrètes et les
injecte dans l'éditeur. Il peut installer le service worker ou créer une
fabrique Web Audio parce que ces opérations appartiennent au démarrage, mais il
ne possède ni écran, ni CSS, ni workflow utilisateur.

`App.tsx` ne fait que monter `Editor` avec une runtime déjà composée.
`create-app-runtime.ts` est le seul endroit qui choisit IndexedDB, Worker,
scheduler navigateur, générateurs d'identités ou moteur audio. Une création
Web Audio retardée par le geste utilisateur est représentée par une fabrique
injectée, pas par une instanciation cachée dans un hook.

### `project` — artefact musical durable

`project` possède `ProjectDocument`, ses invariants, ses commandes et son
historique. Il répond à « qu'est-ce qu'un projet musical valide et comment une
intention confirmée le transforme-t-elle ? ».

Types de commandes et logique de réduction sont colocalisés par concept, par
exemple `notes/note-commands.ts` ou `timeline/timeline-commands.ts`.
`transaction.ts` réunit seulement l'union des commandes et le contrat atomique
commun.

`ProjectStore` ne stocke et n'historise que `ProjectDocument`. Les opérations de
clips, instruments, notes et timeline acceptent des données explicites et
retournent une transaction ou un résultat métier ; elles ne connaissent ni
React, ni modale, ni Web Audio, ni stockage.

La restauration de sélection autour d'Undo/Redo appartient à l'éditeur. Un
`EditorHistoryController` enveloppe le store, capture les identifiants
sélectionnés et crée les métadonnées de transaction avec le générateur et
l'horloge injectés. Le store musical ne connaît donc ni sélection, ni clip
actif, ni fausse transaction de navigation.

### `editor` — toute l'expérience visible et interactive

Dans Pianola, l'éditeur est le piano roll. `editor` possède donc l'ensemble des
écrans et interactions : accueil, menu projet, shell, header, transport
visible, piano roll, inspecteur, dialogues, diagnostics visuels, primitives UI
et styles.

Il possède aussi les états qui n'appartiennent pas au document musical : clip
actif, réglages d'édition persistés, sélection, clipboard, viewport, drafts,
lasso et previews. Les mécanismes purs de l'ancien `editor-core` sont placés
directement dans la sous-capacité qu'ils servent.

La pureté est une propriété de fichier, pas une couche. Un recognizer sous
`editor/interactions/` reste sans React, DOM, Canvas ou Web Audio. Les
adaptateurs DOM voisins portent un nom explicite (`dom-*`) et convertissent les
événements natifs en échantillons neutres.

`Editor.tsx` choisit l'accueil ou la session de projet ouverte. `EditorSession`
compose le store musical, `EditorProjectSettings` et l'état d'interaction sans
fusionner leurs données dans un même objet persistant.

### `audio` — lecture sonore headless

`audio` contient projection du projet, contrôle de lecture, adaptateur Web
Audio, protocole worklet, moteur temps réel et synthé. Il ne contient aucun
React, JSX, DOM, composant ou CSS.

Un `PlaybackController` non React possède source, playhead, seek,
enchaînement, audition et synchronisation. L'éditeur s'abonne à son snapshot et
expose ses actions via `editor/transport/`. L'adaptateur navigateur reste
séparé du moteur pur et les contraintes temps réel justifient les dossiers
techniques `worklet` et `synth`.

### `project-io` — entrée, sortie et persistance headless

`project-io` possède bibliothèque locale, autosave, quarantaine, formats
portables, MIDI et versionnement. Il ne contient aucun React, JSX, DOM,
composant ou CSS.

Les codecs restent séparés par format. `versioning` fournit le routeur commun
des enveloppes et une erreur générique correctement nommée. Chaque opération
utilisateur possède une fonction non visuelle : ouvrir/créer un projet local,
importer/exporter `.pianola`, analyser/finaliser un import MIDI et exporter
MIDI.

Ces fonctions retournent données, avertissements ou erreurs typés. L'éditeur
les traduit en dialogues et déclenche le téléchargement DOM. `project-io`
fournit seulement le contenu, le nom et le type MIME.

Pour éviter une dépendance inverse vers l'éditeur, les codecs possèdent leur
wire model de réglages éditoriaux. Un adaptateur sous `editor` convertit ce DTO
vers `EditorProjectSettings` et inversement. Le DTO sérialisé n'est jamais une
autorité runtime et `app` reste étranger à cette traduction.

## 3. Répartition de l'actuel `music-theory`

L'inventaire montre que cette zone ne forme pas un propriétaire autonome : elle
mélange vocabulaire persistant, outils d'édition et formatage visuel.

| Contenu actuel | Nature réelle | Destination |
| --- | --- | --- |
| `PitchPatternType`, `PitchPatternId`, valeurs autorisées et validation | vocabulaire des marqueurs persistés | `project/timeline/pitch-pattern.ts` |
| `PitchSnapSettings`, defaults et snap | réglage et comportement d'édition | `editor/pitch/pitch-snap.ts` |
| degrés de couleur, labels, altérations et orthographe tonale | rendu | `editor/pitch/pitch-labels.ts` |
| groupes et labels du sélecteur | modèle de vue | `editor/pitch/pitch-pattern-options.ts` |
| reconnaissance d'accords de la sélection | résumé éditorial | `editor/pitch/chord-recognition.ts` |

La liste canonique des motifs persistables ne doit pas être dupliquée dans
l'éditeur. Le projet expose des identifiants ou catégories neutres ; l'éditeur
leur associe des groupes et labels. Tonal reste une dépendance pure autorisée
dans les modules qui réalisent effectivement ces calculs.

## 4. `time-map.ts` devient un vrai module

Le fichier actuel est une façade pure de 70 lignes qui réexporte environ 53
symboles issus de sept modules et ne contient aucune implémentation. Il
disparaît sous cette forme.

La cible conserve le nom pour le concept canonique, pas pour agréger les
exports :

```text
project/timeline/
├── time-map.ts                    modèle, constructeurs et invariants de base
├── timeline-navigation.ts         mesures, ticks, grilles et secondes
├── marker-operations.ts           insertion, déplacement et suppression
├── timeline-normalization.ts      normalisation explicite
└── timeline-structural-edits.ts   insertion et suppression de temps
```

`time-map-model.ts` est absorbé dans `time-map.ts`. Les consommateurs importent
ensuite directement le module propriétaire de l'opération utilisée. Il n'existe
plus de façade d'agrégation exceptionnelle.

## 5. Graphe de dépendances

Une flèche va du module fourni vers son consommateur :

```text
project ─────────→ audio
   ├─────────────→ project-io
   └─────────────→ editor

audio ───────────→ editor
project-io ──────→ editor

project + audio + project-io + editor ──→ app
```

Règles :

- `project` ne dépend d'aucun autre module produit ;
- `audio` dépend du projet, jamais de l'éditeur ou de React ;
- `project-io` dépend du projet, jamais de l'éditeur ou de React ;
- `editor` peut dépendre des API publiques de `project`, `audio` et
  `project-io` ; aucun de ces modules ne dépend de l'éditeur ;
- `app` connaît les quatre capacités uniquement pour les construire et les
  raccorder ;
- aucun cycle d'import n'est admis.

## 6. Propriété des états cible

| État | Autorité cible | Persisté | Undo/Redo |
| --- | --- | --- | --- |
| document musical | `project/ProjectStore` sur `ProjectDocument` | oui | oui, une transaction maximum par intention |
| réglages d'édition du projet | `editor/EditorProjectSettings` | oui, avec le projet | non |
| session ouverte | `editor/EditorSession`, qui compose les autorités sans fusionner leurs données | non comme agrégat | non |
| préférences utilisateur | `editor/preferences/EditorPreferences` | oui, séparément | non |
| sélection, clipboard, draft, lasso | état de session sous `editor` | non | sélection restaurée autour d'une transaction, données non historisées |
| previews marqueurs et boucle | sessions de geste sous `editor/interactions` | non | non ; seul le commit est historisé |
| lecture et playhead | `audio/PlaybackController` | non | non |
| timeline et voix temps réel | moteur sous `audio/worklet` | non | non |
| représentations sérialisées | DTO des codecs sous `project-io` | oui | aucune autorité runtime |

`ProjectDocument` ne contient plus `activeClipId` ni `autoScrollEnabled`.
`autoScrollEnabled` rejoint `EditorProjectSettings`. Le wire model courant peut
néanmoins conserver physiquement ce champ à son ancienne place : l'adaptateur
de frontière de l'éditeur le traduit explicitement sans changement de schéma
silencieux.

`autoAdvanceEnabled` reste dans le projet tant que sa sémantique est celle d'un
ordre de lecture propre au projet. Le déplacer vers une préférence serait une
décision produit distincte.

## 7. Règles de regroupement et de nommage

- L'anglais reste la langue des identifiants et chemins source ; les fichiers
  TypeScript restent en `kebab-case`, les composants en `PascalCase` et les
  hooks React en `useCamelCase`.
- `use*` est réservé à un vrai hook. Une intention durable porte un verbe métier
  (`splitClip`, `duplicateClipGroup`, `importMidiProject`).
- `Port` est réservé à un contrat possédant plusieurs adaptateurs. Un handle
  React devient `Handle`, une projection `Snapshot` et un ensemble de commandes
  `Actions`.
- `Controller` désigne un objet stateful de session ; `Codec` transforme une
  représentation ; `Repository` persiste ; `Policy` prend une décision pure.
- « Workspace » disparaît du vocabulaire technique surchargé. Employer
  `Editor`, `EditorSession`, `EditorProjectSettings` ou `EditorInteractionState`.
- Types, defaults et validation d'un petit concept peuvent vivre dans le même
  fichier. Un catalogue ou algorithme autonome reste séparé s'il évolue seul.
- La taille ne déclenche pas de découpage automatique. Le signal est la présence
  de plusieurs raisons de changer ou de consommateurs sans rapport.
- Les constantes sont colocalisées : bornes de note avec la note, limite
  d'historique avec l'historique, dimensions Canvas avec le renderer et délai
  de téléchargement avec l'adaptateur DOM de l'éditeur.
- Les CSS vivent exclusivement sous `editor/styles` ou avec une primitive
  visuelle de `editor/ui`. `audio`, `project-io` et `project` n'en contiennent
  aucun.
- Les imports visent le propriétaire précis. Aucun fichier global ne réexporte
  les surfaces du dépôt.

## 8. Niveau de consolidation attendu

| Zone | Regroupement cible |
| --- | --- |
| instrument | `instrument.ts` pour modèle/defaults/validation, `synth.ts` pour configuration/enveloppes/validation, `instrument-presets.ts` pour la bibliothèque ; le gros catalogue intégré peut rester séparé |
| commandes | type et réduction colocalisés par concept ; union et transaction communes au niveau `project` |
| time map | vrai `time-map.ts` pour le modèle ; imports directs vers navigation, marqueurs et éditions structurelles |
| pitch | vocabulaire persistant dans `project`, outils et rendu dans `editor/pitch` |
| sélection | `clipboard`, `selection-transform` et `instrument-transfer`, sans fichier par fonction ni module à vingt exports sans parcours clair |
| Canvas | peintres et caches cohésifs conservés, adaptateur React clairement identifié |
| DSP | oscillateur, enveloppe, filtre, voix et allocation restent autonomes à cause de leurs contraintes temps réel |

Il ne s'agit pas d'atteindre un nombre cible de fichiers. Il s'agit de rendre le
chemin de lecture prévisible et de garder ensemble types, règles et valeurs qui
évoluent ensemble.
