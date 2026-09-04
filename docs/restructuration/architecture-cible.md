# Architecture cible

## 1. Forme générale

La cible est une organisation par capacité avec des îlots purs locaux. Les
suffixes de couche ne dictent plus l'emplacement d'un fichier. La question
première devient « avec quoi ce code change-t-il ? ».

```text
src/
├── main.tsx
├── app/
│   ├── App.tsx
│   ├── app-runtime.ts
│   ├── home/
│   ├── shell/
│   ├── diagnostics/
│   └── styles/
├── project/
│   ├── project.ts
│   ├── identifiers.ts
│   ├── project-store.ts
│   ├── project-history.ts
│   ├── transaction.ts
│   ├── clips/
│   ├── notes/
│   ├── instruments/
│   ├── timeline/
│   └── music-theory/
├── editor/
│   ├── editor-session.ts
│   ├── editor-history-controller.ts
│   ├── project-editor-settings.ts
│   ├── piano-roll/
│   │   ├── PianoRollScreen.tsx
│   │   ├── interactions/
│   │   ├── selection/
│   │   ├── viewport/
│   │   └── canvas/
│   ├── inspector/
│   ├── dialogs/
│   ├── toolbar/
│   ├── radial-menu/
│   ├── preferences/
│   └── styles/
├── audio/
│   ├── playback-controller.ts
│   ├── playback-plan.ts
│   ├── browser/
│   ├── worklet/
│   ├── synth/
│   ├── ui/
│   └── styles/
├── project-io/
│   ├── project-lifecycle.ts
│   ├── local/
│   ├── versioning/
│   ├── pianola/
│   ├── midi/
│   ├── ui/
│   └── styles/
└── ui/
    ├── dialog/
    ├── slider/
    ├── command-icon/
    └── theme/
```

Cette arborescence est une carte, pas une obligation de créer tous les dossiers
dès le départ. Un dossier n'existe que lorsqu'il contient une responsabilité
identifiable. Les fichiers cités sont des points d'entrée souhaités ; les noms
internes exacts peuvent être ajustés dans le lot propriétaire si la décision
est consignée.

## 2. Responsabilités

### `app`

`app` connaît les implémentations concrètes et assemble les autres modules. Il
possède l'entrée React, les pages de premier niveau, le shell, l'installation du
service worker et le raccordement des diagnostics navigateur.

`app-runtime.ts` est le seul endroit qui choisit une implémentation IndexedDB,
un Worker, un scheduler navigateur ou une fabrique Web Audio. Une initialisation
retardée par le geste utilisateur reste possible via une fabrique injectée ;
elle n'impose pas que le hook React choisisse la classe concrète.

### `project`

`project` possède le document musical durable et les intentions qui le
modifient. Types de commandes et logique de réduction sont colocalisés par
concept, par exemple `notes/note-commands.ts` ou
`timeline/timeline-commands.ts`. `transaction.ts` réunit seulement l'union des
commandes et le contrat atomique commun.

`ProjectStore` ne stocke et n'historise que `ProjectDocument`. Les opérations de
clips, instruments, notes et timeline acceptent des données explicites et
retournent une transaction ou un résultat métier ; elles ne connaissent ni
React, ni une modale, ni IndexedDB.

La restauration de sélection autour d'Undo/Redo reste une responsabilité de
session éditoriale. Un `EditorHistoryController` sous `editor` enveloppe le
store, capture les identifiants sélectionnés et crée les métadonnées de
transaction avec le générateur et l'horloge injectés. Le store musical ne
connaît donc ni sélection, ni clip actif, ni fausse transaction de navigation.

La façade locale `timeline/time-map.ts` peut être conservée. Elle nomme un vrai
concept et évite aux consommateurs de connaître l'organisation interne. Ce plan
n'interdit que les barrels globaux sans propriétaire.

### `editor`

`editor` réunit la session d'édition, le piano roll visible, l'inspecteur et
leurs mécanismes purs. L'ancien `editor-core` est distribué dans les
sous-capacités qu'il sert : géométrie et recognizers avec les interactions,
sélection avec le workflow de sélection, viewport avec ses contrôles, signaux
de rendu avec Canvas.

La pureté est une propriété de module, pas un dossier racine. Un fichier pur
sous `editor/piano-roll/interactions/` n'importe toujours ni React, ni DOM, ni
Canvas. Les adaptateurs DOM voisins portent un préfixe explicite (`dom-`) et
transforment les événements natifs en échantillons neutres.

`PianoRollScreen.tsx` remplace le sens ambigu de « workspace » pour la surface
React. `PianoRollSession` désigne l'état transitoire d'interaction.

### `audio`

`audio` contient le flux complet de lecture : projection d'un projet, contrôle
de session, adaptateur Web Audio, protocole worklet, moteur temps réel, synthé
et contrôles visibles. La contrainte temps réel justifie les sous-dossiers
techniques `worklet` et `synth` ; ils ne sont pas aplatis artificiellement.

Le point d'entrée UI ne porte plus six protocoles dans un hook. Un
`PlaybackController` non React possède source, playhead, enchaînement et
synchronisation. Un hook mince s'abonne à son snapshot et expose les actions
aux composants. L'adaptateur navigateur reste séparé du moteur pur.

### `project-io`

`project-io` possède les frontières d'entrée/sortie du projet : bibliothèque
locale, autosave, quarantaine, formats portables et MIDI. Le regroupement est
volontaire : pour un développeur, importer, ouvrir, sauvegarder, récupérer et
exporter appartiennent au même cycle de vie du projet.

Les codecs restent séparés par format. `versioning` fournit le routeur commun
des enveloppes versionnées et des erreurs génériques correctement nommées. Les
parseurs `.pianola`, les repositories IndexedDB et le lecteur SMF ne se
confondent pas, même s'ils vivent sous le même propriétaire de capacité.

Chaque action utilisateur possède une façade : ouvrir/créer un projet local,
importer/exporter `.pianola`, importer/exporter MIDI. La façade orchestre ; les
codecs décodent ou encodent. La création du projet à partir d'une analyse MIDI
n'est donc plus cachée dans un dossier d'infrastructure.

### `ui`

`ui` reste petit. Il accueille uniquement les primitives employées par au moins
deux capacités indépendantes : mécanique de dialogue, slider, icône de commande
et thème partagé. Une primitive propre au piano roll ou à l'audio reste dans
son module. `ui` n'est jamais une destination par défaut pour les fichiers
« communs ».

## 3. Graphe de dépendances

```text
project ──→ audio ──→ editor ──→ project-io
   ├────────────────→ editor
   └────────────────────────────→ project-io

ui ──────→ audio/ui + editor + project-io/ui
app ─────→ project + editor + audio + project-io + ui
```

Une flèche va du module importé vers le module consommateur. La dépendance
`editor → project-io` affichée ici signifie seulement que `project-io` peut
consommer un snapshot étroit défini par l'éditeur ; l'import inverse est
interdit.

Règles minimales :

- `project` ne dépend d'aucun autre module produit ; sa dépendance pure à Tonal
  reste autorisée ;
- `audio` dépend du projet, jamais de React ni de l'éditeur ; seul `audio/ui`
  dépend de React et de `ui` ;
- `editor` dépend du projet, de l'API publique d'audio et de `ui`, jamais de
  `project-io` ;
- `project-io` dépend du projet et, pour la projection du contexte éditorial,
  de types étroits de session ; son noyau codec ne dépend pas de React ;
- `app` est la seule racine qui connaît toutes les capacités et choisit leurs
  implémentations concrètes ;
- aucun cycle d'import n'est admis.

Pour empêcher un cycle `editor` ↔ `project-io`, les contrôles de fichiers et la
page d'accueil sont composés par `app`. `project-io` peut lire ou restaurer un
snapshot éditorial via un contrat étroit ; l'éditeur ne déclenche pas lui-même
les codecs ou repositories.

## 4. Propriété des états cible

| État | Autorité cible | Persisté | Undo/Redo |
| --- | --- | --- | --- |
| document musical | `project/ProjectStore` sur `ProjectDocument` | oui | oui, une transaction maximum par intention |
| réglages d'édition du projet | `editor/ProjectEditorSettings` | oui, avec le projet | non |
| session ouverte | `editor/EditorSession` qui compose le store et les réglages sans fusionner leurs données | non en tant qu'agrégat | non |
| préférences utilisateur | `editor/preferences/EditorPreferences` | oui, séparément | non |
| sélection, clipboard, draft, lasso | `editor/piano-roll/PianoRollSession` | non | sélection restaurée autour d'une transaction, données non historisées |
| previews marqueurs et boucle | sessions de geste locales au piano roll | non | non ; seul le commit est historisé |
| lecture et playhead | `audio/PlaybackController` | non | non |
| timeline et voix temps réel | moteur sous `audio/worklet` | non | non |
| représentations sérialisées | DTO des codecs sous `project-io` | oui | aucune autorité runtime |

`ProjectDocument` ne contient plus `activeClipId` ni `autoScrollEnabled`.
`autoScrollEnabled` rejoint les réglages d'édition persistés hors historique.
Le format externe courant peut néanmoins conserver physiquement ce champ à son
ancienne place : un mapper de codec traduit explicitement le wire model vers le
modèle runtime. Ce découplage évite un changement de schéma dans un chantier
strictement structurel.

`autoAdvanceEnabled` reste dans le projet tant que sa sémantique est celle d'un
ordre de lecture propre au projet. Le déplacer vers une préférence utilisateur
serait une décision produit distincte.

## 5. Règles de regroupement et de nommage

- L'anglais reste la langue des identifiants et chemins source ; les fichiers
  TypeScript restent en `kebab-case`, les composants en `PascalCase` et les
  hooks React en `useCamelCase`.
- `use*` est réservé à un vrai hook. Une intention durable est un verbe métier
  (`splitClip`, `duplicateClipGroup`, `importMidiProject`) et reçoit ses
  dépendances en arguments.
- Le suffixe `Port` est réservé à un contrat de frontière possédant ou pouvant
  posséder plusieurs adaptateurs. Un handle React devient `Handle`, une vue
  réduite devient `Snapshot` ou `Actions`.
- `Controller` désigne un objet stateful qui coordonne une session ; `Codec`
  transforme une représentation ; `Repository` persiste ; `Policy` prend une
  décision pure. Ces noms ne sont pas interchangeables.
- « Workspace » disparaît du vocabulaire technique surchargé. Utiliser
  `PianoRollScreen`, `EditorSession`, `ProjectEditorSettings` ou
  `PianoRollSession` selon la durée de vie réelle.
- Types, valeurs par défaut et validation d'un petit concept peuvent vivre dans
  le même fichier. Un gros catalogue de données ou un algorithme autonome reste
  séparé s'il se lit et se modifie indépendamment.
- La taille ne déclenche pas de découpage automatique. Le signal de découpage
  est la présence de plusieurs raisons de changer ou de consommateurs sans
  rapport.
- Les constantes sont colocalisées : bornes d'une note avec la note, limite
  d'historique avec l'historique, dimensions Canvas avec le renderer, délai de
  téléchargement avec l'adaptateur navigateur. Il n'existe plus d'objet global
  `PROJECT_CONSTANTS` ou `EDITOR_CONSTANTS`.
- Les CSS de capacité sont placés près de leur surface. Un fichier racine de
  styles ne fait qu'établir l'ordre d'import des tokens et des capacités.
- Les imports visent le module propriétaire précis. Une façade locale est
  autorisée lorsqu'elle représente un concept stable ; aucun `index.ts` global
  n'agrège le dépôt.

## 6. Niveau de consolidation attendu

Quelques regroupements illustrent le niveau visé :

| Zone | Regroupement cible |
| --- | --- |
| instrument | `instrument.ts` pour modèle/défauts/validation, `synth.ts` pour configuration/enveloppes/validation, `instrument-presets.ts` pour la bibliothèque ; le gros catalogue intégré peut rester séparé |
| commandes | type et réduction colocalisés par concept ; union et transaction communes au niveau `project` |
| time map | façade locale conservée, opérations structurelles ou de marqueurs séparées seulement si elles forment un algorithme autonome |
| sélection | `clipboard`, `selection-transform` et `instrument-transfer` plutôt qu'un fichier par fonction ou un fichier unique à vingt exports sans parcours clair |
| Canvas | peintres et caches cohésifs conservés, adaptateur React clairement séparé par son nom |
| DSP | oscillateur, enveloppe, filtre, voix et allocation restent des unités autonomes à cause de leurs contraintes temps réel |

Il ne s'agit pas d'atteindre un nombre cible de fichiers. Il s'agit de rendre le
chemin de lecture prévisible et de garder ensemble types, règles et valeurs qui
évoluent ensemble.
