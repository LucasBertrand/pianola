# Feuille de route de maintenance

Cette feuille de route transforme l’audit du dépôt en travaux ordonnés. Son
objectif prioritaire est de rendre le code plus modulaire, les dépendances plus
lisibles et la navigation plus prévisible, sans changer le comportement musical
ni lancer une réécriture globale.

Date de référence : 13 août 2026.

Vocabulaire produit retenu pour les trois niveaux de construction :

```text
Pattern → Clip → Scene
```

Un pattern est une brique musicale réutilisable, un clip assemble et rend
jouable du matériau musical, et une scene organise des clips à haut niveau. Le
code emploie ces termes anglais de façon canonique dans les types, les API et
la documentation technique.

## Mode de pilotage

Les niveaux P0 à P5 expriment un ordre de dépendance, pas des lots à livrer en
une seule fois. Chaque sous-partie est un epic à découper en changements petits,
réversibles et validables. Une seule migration structurelle touchant une même
zone d’imports reste active à la fois ; les tests, mesures et corrections de
documentation peuvent l’accompagner.

Pour démarrer un changement, consigner dans sa PR ou son issue :

- le résultat observable attendu et le propriétaire de la zone ;
- les fichiers ou frontières concernés, ainsi que ce qui reste hors périmètre ;
- le témoin de comportement ou la mesure avant changement ;
- le critère de sortie repris de cette feuille de route ;
- le prochain changement débloqué.

Les jalons de décision sont les suivants :

| Jalon | Résultat livrable | Condition de passage |
| --- | --- | --- |
| M0 — Baseline fiable | tests isolables, témoins critiques, mesures et règles d’import | P0 terminé, `npm run verify` vert et baseline reproductible |
| M1 — Frontières lisibles | propriétaires d’état, carte de code et conventions appliqués | aucun nouveau couplage interdit ; migrations P1 prioritaires terminées |
| M2 — Noyau découpé | commandes, validation et I/O modulaires | format v1 déterministe, suites de contrats vertes et monolithes P2 réduits |
| M3 — Éditeur modulaire | contrôleurs, gestes, rendu et UI séparés | P3 terminé sur les parcours critiques sans régression mesurée |
| M4 — Qualité produit automatisée | navigateur, accessibilité, bundle et budgets suivis | parcours critiques automatisés et dépassements expliqués ou corrigés |
| M5 — Extensions produit | instruments, launcher, patterns, transformations et scenes | P5 commence seulement après validation explicite de M4 |

M4 se prépare dès M0 : un smoke test ou une mesure peut être ajouté avant la
fin de P3. En revanche, aucune extension P5 ne doit être engagée pour justifier
une abstraction encore sans consommateur.

## État après P2

Le socle est déjà robuste : TypeScript strict, modèle immuable, mutations par
transactions, rendu haute fréquence hors React, codec MIDI borné et moteur audio
séparé en snapshot, scheduler, moteur et renderer.

Après P0, P1 et P2, les coûts de maintenance principaux sont :

- les anciens monolithes du domaine, du format natif et de l’import MIDI sont
  remplacés par des familles de modules testables ;
- `useViewportControls.ts`, `usePianoRollEvents.ts` et
  `PianoRollLayers.tsx` dépassent chacun 1 000 lignes ;
- `App.tsx` reste une racine de composition lourde, notamment pour les modales
  de collision et d’instrument ;
- les frontières sont matérialisées sous `use-cases`, `editor`, `project-io`
  et les capacités de `ui`, mais les grands fichiers d’éditeur restent à découper ;
- `activeClipId` appartient désormais à `WorkspaceState` et à la section
  éditeur du format natif, hors de `ProjectDocument` et de son historique ;
- les 95 tests exécutables sont désormais pilotés par Vitest avec des fixtures
  partagées ; les deux anciens scripts monolithiques ont été supprimés en P0 ;
- les interactions DOM, Canvas, le responsive et Web Audio réel ne sont pas
  couverts automatiquement ;
- le bundle JavaScript principal dépasse actuellement le seuil d’avertissement
  Vite de 500 kB avant gzip.

Le point de référence est vert : `npm run verify` passe avec le contrôle des
frontières, trois configurations TypeScript, le build et 95 scénarios Vitest.

### Décision sur les sauvegardes pendant cette feuille de route

La prochaine refonte du format `.pianola` est considérée comme sa **version 1**.
La compatibilité avec les sauvegardes produites avant cette refonte est reportée
à un chantier ultérieur. Pendant la migration structurelle :

- le nouveau parseur accepte uniquement le nouveau format v1 ;
- les tests vérifient son round-trip et ses erreurs, pas l’ouverture des anciens
  fichiers ;
- aucune ancienne clé n’est conservée si elle dégrade le nouveau modèle ;
- le format reste versionné afin que la première évolution future puisse ajouter
  une migration pure `v1 → v2` sans modifier le domaine.

## Principes de décision

Chaque chantier doit respecter ces règles :

1. préserver le comportement avant d’améliorer la forme ;
2. déplacer ou extraire un sous-domaine à la fois ;
3. garder une seule source de vérité pour chaque état ;
4. empêcher les dépendances vers React, le DOM ou Web Audio depuis le noyau ;
5. préférer des modules nommés par responsabilité à des dossiers `utils`,
   `common` ou `helpers` ;
6. ajouter un test ou conserver une preuve équivalente avant chaque extraction ;
7. terminer chaque pull request par `npm run verify` et une mise à jour des
   liens documentaires concernés ;
8. mesurer avant de remplacer une technologie : une bibliothèque ou une
   architecture candidate reste une hypothèse tant qu’un prototype et une ADR
   n’en démontrent pas le bénéfice sur les parcours Pianola ;
9. comparer les refactorings au comportement observable et aux plans audio,
   jamais à la forme interne de l’ancienne implémentation. La compatibilité avec
   les sauvegardes antérieures est explicitement hors périmètre de cette phase.

## Priorités

| Priorité | Chantier | Bénéfice principal | Risque | Dépend de |
| --- | --- | --- | --- | --- |
| P0 | garde-fous, tests et conventions | refactorings sûrs et règles visibles | faible | rien |
| P1 | frontières et arborescence | emplacement prévisible de chaque responsabilité | moyen | P0 |
| P2 | découpage du domaine et des formats | réduction des fichiers monolithiques les plus risqués | moyen | P0–P1 |
| P3 | découpage de l’éditeur et de l’UI | meilleure navigation et isolation des chemins haute fréquence | moyen à élevé | P1–P2 |
| P4 | automatisation navigateur et performance | prévention des régressions tactiles, Canvas et bundle | moyen | P0–P3 partiel |
| P5 | extensions produit après migration | instruments, patterns, lecture de clips et scenes sur un socle commun | variable | P1–P4 |

P0 et P1 sont les travaux les plus urgents. P2 doit commencer par les commandes
et le format natif, car ces modules concentrent le plus de règles persistantes.

## P0 — Installer les garde-fous

### P0.1 Adopter un vrai runner de tests

Le mini-runner des scripts a été remplacé par Vitest, cohérent avec la toolchain
Vite. Les 71 scénarios existants ont été conservés puis rejoints par 10 témoins
et garde-fous ciblés.

Arborescence proposée :

```text
tests/
├── integration/
│   ├── audio-scheduler.test.ts
│   ├── midi-round-trip.test.ts
│   └── native-project-round-trip.test.ts
└── support/
    ├── project-fixtures.ts
    ├── fake-audio-engine.ts
    └── test-builders.ts

src/**/__tests__/*.test.ts  tests unitaires proches du module
```

Les calculs purs, reducer et store, persistance, MIDI, scheduler et moteur sont
maintenant enregistrés directement auprès de Vitest. Les fixtures communes sont
centralisées sous `tests/support`.

Critères de sortie :

- un test isolé peut être lancé par fichier ou par nom ;
- les fixtures ne sont plus dupliquées entre les suites ;
- `npm test` exécute uniquement Vitest ;
- le nombre de scénarios ne diminue pas.

### P0.2 Automatiser les frontières

Ajouter un contrôle d’imports dans la CI. Une règle simple suffit au départ :

- `domain`, `music` et `editor` n’importent jamais `app`, `ui`, React ou une
  API navigateur ;
- `use-cases` n’importe pas `app` ou `ui` ;
- `audio` et `project-io` n’importent pas `app` ou un composant React ;
- seul `app` assemble les implémentations concrètes.

Le contrôle peut être un petit script TypeScript versionné ou un outil de graphe
de dépendances. Il doit afficher le fichier source, l’import interdit et la règle
violée.

Critère de sortie : une violation volontaire fait échouer la CI avec un message
actionnable.

### P0.3 Fixer les conventions de nommage

Appliquer les conventions de `architecture.md` aux nouveaux fichiers, puis
renommer progressivement l’existant :

- `scene` → `runtime` dans `App.tsx` ;
- réserver `voice` aux occurrences audio, utiliser `instrument` ailleurs ;
- renommer `PianoRollEventController`, qui expose surtout la sélection et
  l’annulation, vers un nom reflétant réellement ce port ;
- distinguer explicitement `projectInstrument`, `instrumentConfig` et
  `clipInstrumentState` ;
- conserver les suffixes d’unité (`Ticks`, `Seconds`, `Hz`, `CssPixels`) ;
- ne pas introduire de nouvelles abréviations hors MIDI, BPM, PPQN, DOM et UI.

Les renommages internes ne doivent pas conserver artificiellement les anciennes
clés du format `.pianola`. Le nouveau format défini pendant cette phase sera sa
version 1 et constituera le point de départ des migrations futures.

### P0.4 Capturer un témoin de comportement et une baseline

P0.4 n’est pas un chantier de compatibilité des sauvegardes. C’est un témoin
avant/après pour la réorganisation du code : choisir quelques actions
représentatives — dessiner et déplacer une note, résoudre une collision, lancer
la lecture, changer de clip — puis enregistrer leur résultat observable. Après
chaque extraction, ces mêmes scénarios doivent encore produire le même état et
le même plan audio, sauf changement produit volontairement documenté.

Les projets de test sont générés par des builders correspondant au nouveau
modèle ou sauvegardés directement dans le nouveau format v1. Aucun ancien
fichier `.pianola` n’a à être accepté. Le corpus MIDI reste utile comme donnée
d’entrée indépendante du format natif.

Enregistrer également une baseline reproductible sur un matériel et des
navigateurs de référence : taille des bundles, temps de frame pendant pan/zoom,
latence de feedback des gestes, ouverture/import de grosses fixtures et mémoire
de l’historique. Les seuils dépendants du matériel doivent provenir de ces
mesures, pas de valeurs arbitraires.

Toute proposition de remplacement du renderer, du moteur audio, de l’historique
ou du codec MIDI passe par un prototype jetable et une ADR qui consigne mesures,
décision, solution de repli et condition de réexamen. Ces explorations ne
bloquent pas les extractions qui conservent les ports actuels.

Critères de sortie :

- les parcours critiques ont un builder, un résultat attendu ou une procédure
  reproductible ;
- la baseline indique date, navigateur, matériel, scène et commande de mesure ;
- une évolution structurelle peut être acceptée ou rejetée sur des résultats
  observables ;
- aucun test n’exige l’ouverture d’une sauvegarde antérieure au nouveau format
  v1 ;
- aucune bibliothèque de production n’est adoptée sur la seule base d’une
  préférence de stack.

## P1 — Clarifier les frontières et l’arborescence

**État au 13 août 2026 : terminé sur `migration/p1-boundaries`.** Les
déplacements P1.1 à P1.7, la configuration propriétaire, les gardes de structure,
`PlaybackSource`, la projection MIDI neutre et la passe de nettoyage finale sont
implémentés. Les anciens dossiers sont supprimés et les scripts de vérification
référencent uniquement l’arborescence actuelle. Le détail des chemins et des
compatibilités est consigné dans
[`p1-migration.md`](p1-migration.md) et la propriété des états dans
[`state-ownership.md`](state-ownership.md). Le miroir `activeClipId` du format
natif v1 est conservé jusqu’à une migration de schéma versionnée.

### P1.1 Rendre les types d’éditeur indépendants de l’UI

Déplacer `GridSettings`, `GridSubdivision`, `NoteColorMode` et les contrats
persistés associés vers un module neutre, par exemple `src/editor/model`. La
persistance pourra alors dépendre d’un modèle d’éditeur sans importer
`src/ui/rendering`.

Déplacer de la même façon le port de dialogue hors du composant
`ApplicationDialogOverlay`. L’application définit la demande ; l’UI choisit son
affichage.

Critères de sortie :

- aucun import de `src/persistence` vers `src/ui` ;
- aucun type applicatif défini dans un fichier de composant React ;
- round-trip du nouveau format natif v1 couvert.

### P1.2 Réserver `app` à la composition

`src/app` doit finir par contenir seulement :

```text
src/app/
├── App.tsx
├── create-app-runtime.ts
├── demo-project.ts
└── bootstrap.tsx          si main.tsx doit être allégé
```

Les hooks React de `app/workflows` se déplacent vers des dossiers fonctionnels
de l’UI. Leur logique pure est d’abord extraite vers le futur `use-cases` afin
que le déplacement ne se contente pas de déplacer un gros hook. `use-cases`
remplace à terme le nom abstrait `application` et contient uniquement
l’orchestration indépendante de React.

Correspondances recommandées :

| Actuel | Cible |
| --- | --- |
| `app/workflows/useSelectionWorkflow.ts` | cas d’usage dans `use-cases/notes`, hook dans `ui/piano-roll` |
| `app/workflows/useClipWorkflow.ts` | cas d’usage dans `use-cases/clips`, hook dans `ui/inspector/clips` |
| `app/workflows/useProjectInstrumentWorkflow.ts` | cas d’usage dans `use-cases/instruments`, hook dans `ui/inspector/instruments` |
| `app/workflows/useProjectFileWorkflow.ts` | orchestration dans `use-cases/project-files`, adaptateur dans `ui/project-files` |
| `app/workflows/useMidiFileWorkflow.ts` | orchestration dans `use-cases/project-files`, adaptateur dans `ui/project-files` |
| `app/workflows/useViewportControls.ts` | contrôleur pur dans `editor/viewport`, binding React dans `ui/piano-roll` |

Critère de sortie : `App.tsx` câble des contrôleurs déjà construits et ne porte
plus de protocole métier complet.

### P1.3 Regrouper les interactions sous `editor/interactions`

Le sous-dossier `core` n’apporte plus de frontière claire puisque tout
`src/interaction` est déjà indépendant du navigateur et sert le moteur
d’édition. Déplacer ses modules sous des sous-domaines explicites :

```text
src/editor/interactions/
├── gestures/
│   ├── gesture-state-machine.ts
│   ├── note-gesture-math.ts
│   ├── pinch-viewport-gesture.ts
│   └── two-pointer-double-tap.ts
├── pointer/
│   ├── pointer-sample.ts
│   └── pointer-interaction-strategy.ts
├── editing-note-mask.ts
├── piano-roll-interaction-session.ts
└── piano-roll-controller-port.ts
```

L’adaptation de `PointerEvent` reste sous `ui/piano-roll/interactions`. La
dépendance directe de la session vers `EditorSelection` doit disparaître lors
du déplacement de la sélection vers `editor/selection`, ou être remplacée par
un port étroit si les durées de vie diffèrent.

### P1.4 Séparer les constantes par propriétaire

Remplacer progressivement `program-constants.ts` par des fichiers cohésifs :

```text
src/config/
├── product-config.ts
├── domain-limits.ts
├── audio-config.ts
├── editor-config.ts
├── interaction-config.ts
├── rendering-config.ts
├── native-file-config.ts
└── midi-config.ts
```

Les bornes utilisées par `domain/validation/` ne doivent pas venir d’un groupe
nommé `EDITOR_CONSTANTS`. Les couleurs de projets créés par l’import MIDI ne
doivent pas obliger le convertisseur MIDI à dépendre d’une configuration de
rendu ; fournir une palette de création ou injecter une fabrique d’instruments.

Critère de sortie : chaque fichier de configuration a un propriétaire clair et
aucun module pur n’importe une configuration d’UI par commodité.

### P1.5 Rendre explicites les propriétaires d’état

Documenter puis faire apparaître progressivement quatre catégories d’état, sans
imposer un nouveau store :

| État | Contenu | Persisté | Undo/Redo | Fréquence |
| --- | --- | --- | --- | --- |
| document de projet | musique partageable, clips, instruments, notes, tempo et mixage | oui | oui | par transaction |
| espace de travail | clip actif, grille, snap, viewport et préférences visuelles | section éditeur si utile | non | faible à moyenne |
| session d’édition | sélection, geste, draft et pointeurs capturés | non | non | élevée |
| temps réel | caches de rendu, playhead, événements programmés et voix audio | non | non | par frame ou quantum audio |

Le document reste sérialisable et ne contient ni référence DOM, ni objet de
bibliothèque, ni cache dérivé. Les coordonnées successives de `pointermove`, le
playhead et les buffers graphiques restent dans des runtimes impératifs et ne
déclenchent pas de mutation du document à chaque frame.

Critère de sortie : pour chaque état mutable, la documentation nomme un seul
propriétaire, sa durée de vie, sa politique de persistance et sa relation à
l’historique.

### P1.6 Adopter une carte de code orientée capacités

L’arborescence cible reste un monolithe modulaire dans `src`. Elle évite à la
fois le dossier plat actuel et un workspace prématuré. Au premier niveau, chaque
dossier répond à une question simple :

| Dossier | Question à laquelle il répond | Ne contient jamais |
| --- | --- | --- |
| `app` | comment l’application est-elle démarrée et assemblée ? | règle métier ou hook de fonctionnalité |
| `domain` | quelles sont les données persistantes et leurs invariants ? | React, DOM, Canvas ou Web Audio |
| `use-cases` | quelle intention utilisateur orchestre le domaine ? | JSX ou API navigateur |
| `editor` | comment l’édition, la géométrie et les gestes sont-ils calculés ? | composant React ou persistance de fichier |
| `audio` | comment un projet devient-il un plan puis un son ? | état d’interface |
| `project-io` | comment lire, migrer et écrire `.pianola` ou MIDI ? | dialogue, téléchargement ou store global |
| `music` | quels calculs de théorie musicale sont réutilisables ? | état applicatif |
| `ui` | comment React et le navigateur présentent-ils une capacité ? | invariant métier |
| `config` | quelles valeurs de configuration ont un propriétaire explicite ? | logique ou état mutable |

Structure cible de référence :

```text
src/
├── main.tsx
├── app/
│   ├── App.tsx
│   ├── create-app-runtime.ts
│   └── demo-project.ts
├── domain/
│   ├── project/
│   ├── clips/
│   ├── instruments/
│   ├── patterns/
│   ├── scenes/
│   ├── timeline/
│   ├── notes/
│   ├── transport/
│   └── history/
├── use-cases/
│   ├── clips/
│   ├── instruments/
│   ├── patterns/
│   ├── scenes/
│   ├── notes/
│   ├── project-files/
│   ├── playback/
│   └── transport/
├── editor/
│   ├── model/
│   ├── geometry/
│   ├── interactions/
│   ├── selection/
│   └── viewport/
├── audio/
│   ├── playback/
│   ├── clip-launcher/
│   ├── scheduling/
│   ├── engine/
│   └── instruments/
├── project-io/
│   ├── native/
│   └── midi/
├── music/
├── ui/
│   ├── dialogs/
│   ├── editor-toolbar/
│   ├── inspector/
│   │   ├── clips/
│   │   └── instruments/
│   ├── piano-roll/
│   │   ├── interactions/
│   │   └── rendering/
│   ├── patterns/
│   ├── scenes/
│   ├── project-files/
│   └── transport/
└── config/
```

Cette arborescence est une carte, pas une obligation de créer tous les dossiers
vides. Un dossier n’apparaît qu’au déplacement de son premier module. La
profondeur normale est limitée à trois dossiers sous `src`; une profondeur
supplémentaire exige une responsabilité réellement distincte.

Correspondance de migration :

| Emplacement actuel | Destination | Règle de tri |
| --- | --- | --- |
| `application/*` | `use-cases/<capacité>` ou `editor/selection` | orchestration dans `use-cases`, état d’édition dans `editor` |
| `app/workflows/*` | logique dans `use-cases`, hook dans `ui/<capacité>` | séparer le pur de React avant le déplacement |
| `geometry/*` | `editor/geometry` | ces calculs servent actuellement le piano roll |
| `interaction/*` et `interaction/core/*` | `editor/interactions` | supprimer le niveau sans signification `core` |
| `midi/*` | `project-io/midi` | conserver codec et mapping dans des sous-modules nommés |
| `persistence/*` | `project-io/native` | réserver `native` au format `.pianola` |
| `ui/components/*` | `ui/<capacité>` | composant voisin de son hook et de son style |
| `ui/hooks/*` | `ui/<capacité>` | aucun dossier global de hooks |
| `ui/interactions/*` | `ui/piano-roll/interactions` | adaptation DOM seulement |
| `ui/rendering/*` | `editor/model` ou `ui/piano-roll/rendering` | contrat neutre dans `editor`, peinture dans `ui` |
| `ui/browser/*` | `ui/project-files` | adaptateurs téléchargement et sélection de fichier |
| `config/program-constants.ts` | fichiers propriétaires sous `config` | aucune constante fourre-tout |

Règle de décision pour un nouveau fichier :

1. identifier la capacité fonctionnelle (`notes`, `clips`, `transport`, fichier
   projet, etc.) ;
2. identifier sa nature : invariant (`domain`), orchestration (`use-cases`),
   calcul d’édition (`editor`), format (`project-io`) ou adaptation React/DOM
   (`ui`) ;
3. le placer auprès des fichiers qui changeraient pour la même raison ;
4. si deux destinations semblent possibles, définir d’abord le port chez le
   consommateur puis placer l’adaptateur technologique à l’extérieur.

Critères de sortie :

- trouver une fonctionnalité ne nécessite pas de parcourir `app`, un dossier
  global `hooks` et un dossier global `components` ;
- `app`, `core`, `components`, `hooks`, `contracts`, `types` et `state` ne sont
  jamais utilisés seuls comme catégories fonctionnelles ;
- la carte ci-dessus et l’arborescence réelle ne divergent pas durablement ;
- chaque déplacement supprime l’ancien chemin dans la même pull request.

### P1.7 Normaliser le nommage des fichiers et des API

Conserver trois exceptions visibles, puis appliquer `kebab-case` partout
ailleurs : composants React en `PascalCase.tsx`, hooks en `useCamelCase.ts` et
tests avec le suffixe `.test.ts[x]`. Un nom de fichier doit rester compréhensible
dans un résultat de recherche sans dépendre du dossier parent.

Préférer un nom qui expose le rôle :

| Nom trop générique | Forme attendue |
| --- | --- |
| `types.ts` | `midi-event.ts`, `project-file-schema.ts` |
| `contracts.ts` | `audio-engine-port.ts`, `instrument-renderer-port.ts` |
| `state.ts` | `gesture-session-state.ts` |
| `input.ts` | `pointer-sample.ts` |
| `errors.ts` | `midi-import-error.ts`, sauf famille cohésive d’erreurs |
| `helpers.ts` | nom de la capacité, par exemple `project-file-metadata.ts` |

Utiliser les suffixes suivants de façon stable :

- `*-port.ts` pour le contrat possédé par son consommateur ;
- un nom technologique explicite pour un adaptateur, par exemple
  `web-audio-engine.ts` ou `browser-file-downloader.ts` ;
- `create-*` pour une fabrique, `parse-*` et `serialize-*` pour une frontière de
  données, `plan-*` pour un calcul pur préparant une transaction ;
- `*-controller.ts` seulement si l’objet reçoit des entrées et pilote un cycle
  de vie ; `*-service.ts` seulement pour une façade sans état métier propre ;
- `*-model.ts` seulement lorsque plusieurs types forment réellement un modèle
  cohésif, jamais comme nouveau fichier fourre-tout.

Les `index.ts` sont réservés aux frontières publiques utiles ; ils ne doivent ni
réexporter toute l’application, ni masquer l’origine d’un symbole. Les fichiers
ne sont pas préfixés mécaniquement par tout leur chemin, mais deux fichiers de
responsabilités différentes ne doivent pas porter le même nom vague.

Critères de sortie :

- aucun nouveau fichier nommé seulement `types`, `contracts`, `state`, `input`,
  `helpers`, `utils` ou `common` ;
- les ports et adaptateurs sont reconnaissables dans les résultats de recherche ;
- les déplacements de code sont séparés de la définition du nouveau schéma
  `.pianola` v1 ;
- `rg --files src` suffit à comprendre les grandes capacités du produit.

### P1.8 Préparer les frontières des prochaines fonctionnalités

La migration ne doit pas implémenter prématurément patterns, scenes ou
drumkit. Elle doit en revanche éviter les choix qui les rendraient coûteux :

1. sortir `activeClipId`, la sélection et les panneaux ouverts du document de
   projet vers l’espace de travail ;
2. faire de `InstrumentConfig` une union discriminée extensible et enregistrer
   les renderers audio par `kind`, sans branche centrale limitée au synthé
   soustractif ;
3. compiler l’audio depuis une entrée explicite de type `PlaybackSource`, et non
   en lisant implicitement le clip actif dans `ProjectState` ;
4. séparer l’horloge de lecture globale — tempo, PPQN et position — de la
   métrique locale d’un clip ; plusieurs clips simultanés doivent partager une
   seule horloge ;
5. donner des identifiants stables aux notes, patterns, clips, marqueurs et
   scenes, et stocker les relations par référence plutôt que par copie ;
6. distinguer une définition persistante (`Pattern`, `Clip`, `Scene`) de
   ses occurrences de lecture temporaires ;
7. faire dépendre l’export MIDI d’une projection musicale neutre, pas du store,
   de l’écran actif ou directement de la structure interne d’un clip.

Ces frontières doivent être couvertes par des ports étroits. Elles ne nécessitent
ni classe de base commune, ni framework de plugin, ni entités vides ajoutées au
modèle avant leur première fonctionnalité.

Critère de sortie : le compilateur de playback peut recevoir explicitement une
source sans consulter `activeClipId`, et l’ajout d’un second `kind`
d’instrument ne demande pas de modifier le scheduler générique.

## P2 — Découper les monolithes métier et fichiers

**État au 13 août 2026 : terminé.** P2.1 à P2.5 sont implémentés et couverts
par 95 scénarios Vitest. Les monolithes `commands.ts`, `validation.ts`,
`native-project-file.ts` et `midi-importer.ts` ont été remplacés par des modules
propriétaires. P2.5 livre la séparation `ProjectDocument`/`WorkspaceState`,
`ProjectClock`, `ClipTimeline`/`MeterMap`, le ciblage explicite des commandes et
collisions, `PlaybackSource`/`PlaybackPlan`, `MidiExportPlan`, le port de preview
et les transformations ciblées pures. Le détail
des modules, contrats et décisions est consigné dans
[`p2-migration.md`](p2-migration.md).

### P2.1 Scinder les commandes du domaine

Créer `src/domain/commands/` en conservant un reducer public stable :

```text
commands/
├── command-types.ts
├── transaction.ts
├── project-commands.ts
├── clip-commands.ts
├── instrument-commands.ts
├── note-commands.ts
├── transport-commands.ts
├── reducer.ts
└── command-errors.ts
```

Commencer par extraire les types, puis un groupe de handlers par pull request.
Les helpers temporels partagés doivent rejoindre un module nommé, pas un fichier
`utils.ts`.

Critères de sortie :

- aucun fichier de ce dossier ne dépasse approximativement 500 à 700 lignes
  sans justification ;
- les imports historiques sont migrés explicitement ;
- chaque famille possède des tests de succès, rejet et Undo/Redo ;
- les invariants inter-commandes restent vérifiés dans le reducer racine.

Le découpage doit aussi converger vers des intentions sémantiques et atomiques :
une fin de geste validée planifie une transaction métier, le reducer l’applique
et l’historique reçoit exactement une entrée. Navigation, sélection, dialogue,
lecture et viewport restent hors de l’historique musical. Éviter les setters
génériques qui obligent l’UI à connaître les invariants du domaine.

### P2.2 Scinder la validation

Aligner la validation sur le modèle : notes/pistes, instruments/presets,
transport, clips/projet et descripteurs. Conserver un type d’erreur et un format
de chemin communs.

Le but n’est pas de dupliquer les bornes entre parser, validation et reducer.
Chaque règle possède un propriétaire et les couches externes l’appellent.

### P2.3 Modulariser le format natif

Structure cible :

```text
src/project-io/native/
├── native-project-schema.ts
├── native-project-metadata.ts
├── serialize-native-project.ts
├── parse-native-project.ts
├── native-project-error.ts
├── parsing/
│   ├── json-readers.ts
│   ├── parse-project.ts
│   ├── parse-editor-state.ts
│   ├── parse-instruments.ts
│   └── parse-clips.ts
└── version.ts
```

Le format produit par cette migration est déclaré **format v1 de référence**.
La lecture des sauvegardes antérieures n’est pas demandée et aucun adaptateur de
compatibilité ne doit alourdir le domaine. Prévenir simplement que les anciennes
sauvegardes ne seront pas reprises pendant cette phase. Avant de distribuer une
version qui écrit ce format, afficher l’incompatibilité à l’utilisateur, la
documenter dans les notes de version et vérifier qu’un export de secours reste
possible. Cette communication est un verrou de livraison, pas un chantier de
migration des anciens fichiers.

Le schéma stocké doit rester distinct du modèle interne. Le pipeline cible est :

```text
JSON inconnu → schéma stocké v1 → validation métier
             → document de projet + espace de travail
```

Préparer seulement le futur point d’entrée `version.ts` et garder le parseur
séparé du domaine. Lorsqu’un format v2 sera réellement créé, une migration pure
`v1 → v2` pourra être insérée entre parsing et validation. Les erreurs exposent
un chemin et un code stables, et la sérialisation conserve un ordre déterministe
pour rendre les fixtures et les diffs lisibles.

Critères de sortie :

- parser et sérialiseur sont testés séparément ;
- les primitives JSON sont indépendantes du domaine ;
- le round-trip du nouveau format v1 est déterministe ;
- aucune compatibilité avec le format antérieur n’est requise ;
- le point d’insertion d’une future migration v1 vers v2 est documenté, sans
  implémentation anticipée ;
- le format stocké peut évoluer sans devenir la forme imposée du store.

### P2.4 Modulariser l’import MIDI

Séparer :

- l’analyse des événements et paires note-on/note-off ;
- la conversion PPQN et le choix tempo/métrique ;
- le regroupement en instruments ;
- la résolution des collisions importées ;
- la fabrique de `ProjectState` ;
- la génération des avertissements.

Étudier ensuite la réutilisation des algorithmes de collision du domaine. Ne pas
forcer cette fusion si les sémantiques diffèrent ; documenter alors la raison.

Critère de sortie : `analyzeMidiImport` et `createProjectFromMidiImport` restent
les deux points d’entrée lisibles, composés de modules testables.

### P2.5 Faire évoluer le modèle sans implémenter les fonctionnalités futures

Le nouveau modèle v1 et les ports issus de la migration doivent fournir les
fondations suivantes :

| Fondation livrée pendant la migration | Fonctionnalités débloquées |
| --- | --- |
| `ProjectDocument` séparé de `WorkspaceState` | launcher indépendant du clip affiché, plusieurs vues |
| `ProjectClock` avec tempo, PPQN et grille de lancement globaux | clips simultanés et départ quantifié |
| `ClipTimeline` avec durée et première `MeterMap` à un segment | changements de métrique et ruler |
| union `InstrumentConfig` + registre de renderer | drumkit et futurs instruments |
| `PlaybackSource` et `PlaybackPlan` purs | clip seul, launcher, scene et export |
| projections de notes portant leur origine | futurs patterns sans copie de notes |
| port de preview d’instrument | réglages audibles avant validation |
| moteur pur de transformations ciblées | symétries, transposition, diminution et augmentation sur pattern ou clip |
| `MidiExportPlan` séparé de l’encodeur SMF | export configurable de plusieurs sources |

Il n’est pas nécessaire de créer dès maintenant des collections `patternsById`
ou `scenesById` vides. En revanche, le modèle ne doit plus supposer que
toute note jouée appartient directement au clip actif, que toute lecture ne
concerne qu’un clip ou qu’une métrique est constante sur toute sa durée.

Critères de sortie :

- les anciennes fonctions dépendant implicitement du clip actif reçoivent un
  `clipId` ou une `PlaybackSource` explicite ;
- le temps audio d’exécution (`anchorAudioTimeSeconds`) ne fait pas partie du
  document persistant ;
- une métrique constante est représentée comme le premier segment d’une carte,
  sans encore fournir l’UI de changement ;
- les projections et plans conservent l’identifiant de leur source pour permettre
  invalidation, sélection, diagnostic et export futurs.

## P3 — Modulariser l’éditeur et l’interface

### P3.1 Extraire les peintres Canvas

`PianoRollLayers.tsx` doit seulement monter les couches et abonner les signaux.
Déplacer les fonctions de peinture vers :

```text
ui/piano-roll/rendering/
├── grid-painter.ts
├── note-painter.ts
├── note-label-cache.ts
├── locked-note-pattern.ts
└── canvas-layer.tsx
```

Faire de même pour les ticks du ruler dans `Timeline.tsx`. Les peintres reçoivent
un contexte et un snapshot explicites ; ils ne lisent pas de state React.

Formaliser à cette occasion un petit port de rendu indépendant du backend. Il
reçoit une projection déjà calculée de la scène, du draft et du playhead ; il ne
décide ni du snap, ni des collisions, ni de la sélection et ne lit pas le store
global. Le hit-testing reste dans geometry/interaction. Les notes sont limitées
au rectangle visible et les labels ne sont produits qu’au niveau de zoom utile.

Conserver un overlay DOM pour le focus, les menus et les informations qui doivent
rester accessibles, même si les notes sont peintes sur Canvas.

### P3.2 Réduire `usePianoRollEvents`

Séparer trois rôles aujourd’hui réunis :

1. construction de la stratégie de gestes ;
2. adaptation des résultats vers `NoteGestureWorkflow` ;
3. exposition du contrôleur impératif de sélection.

Les calculs de hit-test restent dans geometry/interaction. Le hook final ne doit
gérer que le montage, les références et les callbacks React.

### P3.3 Réduire `useViewportControls`

Extraire un `ViewportController` testable qui possède bornage, publication,
suivi de lecture et batching. Le hook React conserve seulement les références
DOM, `ResizeObserver`, `requestAnimationFrame` et les listeners.

### P3.4 Organiser les composants par fonctionnalité

Remplacer le dossier plat `ui/components` par des groupes faciles à parcourir :

```text
src/ui/
├── dialogs/
├── editor-toolbar/
├── inspector/
│   ├── clips/
│   └── instruments/
├── piano-roll/
├── project-files/
└── transport/
```

Chaque groupe contient son composant, ses petits contrôles, son hook d’adaptation
et ses tests. Éviter un `index.ts` global qui réexporte toute l’UI.

### P3.5 Découper les styles

Scinder `styles.css` par surface fonctionnelle tout en conservant une entrée
globale ordonnée : tokens et reset, shell, header/transport, piano roll,
inspecteur, dialogues et responsive. Garder les media queries proches du module
qu’elles modifient ou dans un fichier responsive clairement indexé.

Critère de sortie : rechercher une classe depuis un composant mène directement
au fichier de style propriétaire.

## P4 — Automatiser le navigateur et surveiller les performances

### P4.1 Tests navigateur ciblés

Introduire Playwright avec un petit nombre de parcours à forte valeur :

- dessiner, déplacer, redimensionner et supprimer une note ;
- long press et transition un doigt/deux doigts ;
- Undo/Redo après collision ;
- changement et duplication de clip ;
- Save/Load avec téléchargement et fichier fixture ;
- import/export MIDI ;
- layout portrait et paysage ;
- Canvas présent avec dimensions non nulles et DPR simulé ;
- navigation clavier, focus des dialogues et contrôle d’accessibilité des vues
  standard.

Web Audio réel doit être couvert par quelques smoke tests compatibles navigateur,
pas par une reproduction exhaustive du scheduler déjà testé avec un faux moteur.
Les scénarios pinch et pan à deux doigts utilisent un helper Pointer Events
multi-pointeurs et restent complétés par une recette sur tablette réelle.

### P4.2 Tests de propriétés et benchmark geometry

Mettre en œuvre `geometry/__tests__/TEST_PLAN.md` avec des tests de propriétés
pour le convertisseur et une référence linéaire pour `SpatialIndex`. Conserver
le benchmark 10 000 notes hors du chemin CI bloquant tant qu’une baseline stable
n’existe pas.

Étendre progressivement ces propriétés aux normalisations, aux collisions, aux
round-trips de formats et à l’équivalence ticks/secondes. Lorsque deux
adaptateurs implémentent le même port, réutiliser une suite de contrat commune
contre le fake et l’implémentation réelle.

### P4.3 Budget bundle et chargement différé

Mesurer avant d’optimiser. Les premières candidates au chargement différé sont
les modales d’édition d’instrument et les workflows de fichiers/MIDI, absents du
chemin d’édition principal. Ajouter un budget documenté et suivre les tailles
minifiées et gzip dans la CI.

Critère de sortie : plus d’avertissement de chunk non expliqué, ou seuil ajusté
avec une justification et une mesure enregistrée.

### P4.4 Budgets d’interaction, d’I/O et d’accessibilité

Transformer la baseline P0.4 en budgets suivis. Au minimum : aucune régression
significative du temps de frame pendant pan, zoom et déplacement groupé ; aucun
événement audio manqué dans les scénarios déterministes ; aucune opération de
fichier lourde qui monopolise la surface d’édition ; et aucune violation
d’accessibilité automatique sur les vues standard.

Si les mesures montrent que parsing ou export créent des longues
tâches, les déplacer derrière un port vers un Worker. Transférer les
`ArrayBuffer` lorsque possible et imposer taille maximale, délai, annulation et
validation du résultat avant son entrée dans le store. Le choix du protocole ou
d’une bibliothèque de Worker reste soumis à mesure.

Critère de sortie : chaque budget possède une scène, un environnement, une
commande de mesure, un seuil justifié et une procédure explicite en cas de
dépassement.

## P5 — Construire les prochaines fonctionnalités

P5 commence après la migration structurelle et l’établissement du nouveau
format natif v1. Les fonctionnalités suivantes partagent le même document, la
même horloge, le même compilateur musical et le même moteur audio. Leur ordre
évite de créer un lecteur séparé pour les clips, les patterns et les scenes.
Le passage de M4 à P5 fait l’objet d’une décision explicite : les frontières
P1–P3 sont en place, les budgets critiques sont connus et aucun contournement
temporaire n’est introduit pour accélérer une fonctionnalité.

### P5.1 Généraliser les instruments et leur preview

Faire de `InstrumentConfig` et du snapshot de playback des unions discriminées
par `kind`. Le scheduler manipule des événements musicaux génériques ; un
registre de `InstrumentRenderer` associe chaque `kind` à son implémentation
audio. Ajouter un instrument ne doit pas ajouter une branche dans le scheduler,
le store ou le piano roll.

L’éditeur d’instrument travaille avec un `InstrumentDraft` hors du document et
hors Undo/Redo :

```text
configuration persistée
  → ouvrir l’éditeur
  → InstrumentDraft
  → previewAudioSession.applyDraft(draft)
  → audition en temps réel
  ├── valider  → une transaction UpdateInstrument
  └── annuler  → restaurer la configuration persistée
```

La session de preview possède ses propres voix et garantit leur arrêt à la
fermeture, au changement d’instrument ou au remplacement du projet. Le moteur
peut prévisualiser une configuration complète, pas uniquement le gain. Les
modifications rapides sont regroupées pour éviter de reconstruire inutilement
le graphe audio à chaque mouvement de slider.

Le premier nouveau `kind` est `drum-kit`. Sa configuration contient des pads
adressés par hauteur MIDI et des voix de percussion explicites. Si des samples
sont introduits, leurs références et leur cycle de chargement restent derrière
un port d’assets audio ; ni le domaine ni les sauvegardes ne contiennent de
`AudioBuffer` ou de nœud Web Audio.

Critères de sortie :

- synthé soustractif et drumkit passent la même suite de contrat de renderer ;
- modifier un draft est audible sans créer une entrée Undo à chaque variation ;
- valider produit une seule transaction, annuler ne modifie pas le document ;
- toute voix et toute ressource de preview sont libérées déterministement.

### P5.2 Introduire un moteur de lecture multi-clips

Remplacer l’hypothèse « le clip actif est la source de lecture » par une entrée
explicite. Un `PlaybackSourceCompiler` produit un plan d’occurrences à partir
d’un clip seul, d’un ensemble de clips lancés ou, plus tard, d’une scene.
Le plan contient les événements musicaux, leur origine, leur position sur
l’horloge et leur routage d’instrument ; il ne contient aucun objet Web Audio.

Extraire du clip le tempo, le PPQN et la position de lecture qui appartiennent à
l’horloge globale du projet. Cette horloge possède aussi une grille de lancement
commune, distincte des métriques locales. Un clip conserve sa durée, sa boucle
éventuelle et sa carte de métrique. Tous les clips simultanés partagent ainsi la
même horloge et les mêmes frontières de lancement, même si leurs mesures locales
diffèrent.

Le `ClipLauncher` est un état de session non persisté dans un premier temps. Il
reçoit des intentions `queue`, `launch`, `stop` et `replace`, calcule une
frontière de quantification (`none`, temps, mesure ou nombre de mesures), puis
crée ou termine des `ClipPlaybackOccurrence`. Plusieurs occurrences peuvent être
actives simultanément sans changer `activeClipId`, qui reste une navigation de
l’éditeur dans l’espace de travail.

Critères de sortie :

- lancement successif, remplacement et superposition sont testés avec une
  horloge factice ;
- la quantification est définie en ticks musicaux, sans dépendre de
  `setTimeout` ;
- l’édition d’un clip invalide seulement ses événements futurs et ne coupe pas
  arbitrairement les voix déjà actives ;
- aucun état de session du launcher n’entre dans Undo/Redo.

### P5.3 Ajouter les patterns comme source musicale réutilisable

Un `Pattern` est une définition canonique de notes relatives. Un clip contient
des `PatternInstance` qui référencent `patternId` avec au minimum une position
de départ. Les transpositions, répétitions ou variations éventuelles appartiennent
à l’instance et ne dupliquent pas les notes sources.

```text
Pattern ── référencé par ──► PatternInstance dans Clip A
    │                  └───► PatternInstance dans Clip B
    └── modification
          → invalidation des projections de A et B
          → rendu, collisions, playback et export recalculés
```

Le piano roll et l’audio consomment une projection résolue qui combine notes
locales et occurrences de patterns. Cette projection conserve l’origine de chaque
note (`patternId`, `patternNoteId`, `instanceId`) afin de sélectionner la bonne
source, produire des identifiants dérivés stables et éviter de modifier une
copie. Avant l’implémentation, une ADR tranche le routage d’instrument d’un
pattern et la politique de collision entre pattern, autres patterns et notes
locales.

Critères de sortie :

- changer une note du pattern met à jour tous les clips référents dans une seule
  transaction ;
- supprimer un pattern encore référencé est refusé ou passe par une résolution
  explicite ;
- aucune note générée par une instance n’est persistée comme duplication ;
- le renderer, le playback et l’export utilisent la même projection résolue.

### P5.4 Généraliser les transformations de patterns et de clips

Extraire les transformations actuelles de sélection vers un moteur pur commun,
sans l’attacher au piano roll ni à une structure de stockage. Une requête nomme
toujours sa cible et son contexte :

```ts
type MusicalTransformTarget =
  | { kind: "pattern"; patternId: PatternId }
  | { kind: "clip"; clipId: ClipId };
```

Le vocabulaire des opérations est stable :

| Opération | Effet musical | Paramètres explicites |
| --- | --- | --- |
| symétrie horizontale | rétrograde temporel des départs dans une étendue | pivot ou étendue en ticks |
| symétrie verticale | inversion des hauteurs | axe MIDI, avec politique de bornage |
| transposition | déplacement des hauteurs | nombre signé de demi-tons |
| augmentation | dilatation des départs et durées | facteur rationnel supérieur à 1 |
| diminution | contraction des départs et durées | facteur rationnel entre 0 et 1 |

Dans un contexte `pattern`, l’opération modifie la définition canonique : toutes
les `PatternInstance` qui la référencent sont donc actualisées. Dans un contexte
`clip`, elle ne modifie jamais les définitions de patterns partagées. Elle
transforme les notes locales et les paramètres des instances ciblées
— position, transposition et échelle temporelle — puis recalcule la projection
du clip.

Chaque transformation suit le pipeline `preview → plan → validation → une
transaction`. Le plan décrit les notes ou instances affectées, les changements
de durée et les collisions attendues. L’UI peut donc afficher le résultat avant
validation sans muter le document. Une ADR fixe la politique de dépassement des
hauteurs MIDI, de fractions de ticks, de notes hors durée et de collisions ; ces
cas ne doivent pas être arrondis ou tronqués silencieusement.

Critères de sortie :

- les cinq transformations utilisent le même moteur pour `Pattern` et `Clip` ;
- transformer un pattern met à jour tous ses usages sans dupliquer ses notes ;
- transformer un clip ne modifie aucun pattern partagé ;
- augmentation et diminution traitent ensemble départs, durées, instances et
  durée résultante du conteneur selon une politique documentée ;
- Undo/Redo restaure atomiquement la cible et ses projections ;
- les propriétés identité, double symétrie et aller-retour
  augmentation/diminution sont testées lorsque les arrondis le permettent.

### P5.5 Unifier marqueurs, mesures et changements de métrique

Créer sous `domain/timeline` deux concepts voisins mais distincts :

- `SectionMarker` annote une position du ruler avec identifiant, libellé et
  éventuellement couleur ; il sert à délimiter des sections sans modifier le
  calcul du temps ;
- `TimeSignatureChange` modifie la métrique à partir d’un tick et alimente une
  `MeterMap` ordonnée.

Dans l’interface, les deux apparaissent comme des marqueurs sur le bar ruler,
mais leur distinction dans le domaine empêche un simple libellé de modifier le
timing par accident.

Le premier événement de métrique commence au tick 0. Les changements suivants
sont triés, uniques et placés sur une frontière de mesure valide selon le segment
précédent. Un service pur fournit conversions mesure/temps/tick, graduations du
ruler et bornes de quantification. Le ruler, le snap, le redimensionnement du
clip, le launcher, le playback et l’export MIDI utilisent tous ce service au lieu
de recalculer localement `measureCount × ticksPerMeasure`.

Critères de sortie :

- ajouter, déplacer, renommer et supprimer un marqueur est transactionnel ;
- plusieurs changements de métrique produisent des numéros de mesures et une
  grille déterministes ;
- boucle, snap, ruler, quantification et MIDI partagent la même `MeterMap` ;
- les marqueurs purement visuels n’altèrent jamais le timing audio.

### P5.6 Construire les scenes avec des références de clips

Une `Scene` est une structure persistante de haut niveau. Elle contient
des pistes ou lanes d’arrangement et des `ClipPlacement` référençant un `clipId`,
une position de départ et, si nécessaire, répétition, durée ou offset. Elle ne
copie pas le contenu des clips. Modifier un clip met donc à jour toutes ses
occurrences dans la scene.

La compilation d’une scene produit le même plan d’occurrences que le
`ClipLauncher`. Le scheduler et le moteur audio ignorent si une occurrence vient
d’un lancement live ou de l’arrangement. Les marqueurs de scene peuvent
délimiter intro, couplet ou refrain sans être confondus avec les marqueurs locaux
d’un clip.

Critères de sortie :

- déplacer ou répéter un placement ne modifie pas le clip source ;
- la suppression d’un clip référencé exige une résolution explicite ;
- les clips superposés suivent les mêmes règles de mixage que le launcher ;
- lecture depuis une position, boucle de région et modification d’un clip en
  cours de lecture sont déterministes.

### P5.7 Reconcevoir l’export MIDI comme pipeline

Séparer le choix de ce qui est exporté de l’encodage SMF :

```text
pattern | clip | scene | session de clips
  → MidiExportSource
  → projection musicale résolue
  → MidiExportPlan
  → encodeur SMF
```

`MidiExportOptions` porte explicitement format 0/1, PPQN, affectation
pistes/canaux, inclusion des marqueurs, tempo/métriques, noms, notes désactivées
et politique de résolution des répétitions. Une étape de prévisualisation expose
les pistes, durées, avertissements et pertes éventuelles avant téléchargement.
L’encodeur reste un codec binaire déterministe et ne connaît ni `ProjectState`,
ni `activeClipId`, ni React.

Critères de sortie :

- le même contenu résolu produit le même MIDI quelle que soit la vue ouverte ;
- tempo, changements de métrique, marqueurs et noms sont exportés lorsque le
  format le permet ;
- les collisions de canaux et capacités MIDI non représentables produisent des
  avertissements actionnables ;
- pattern, clip et scene partagent le pipeline et ses tests de round-trip.

### P5.8 Extensions ultérieures compatibles avec ce socle

Après ces fonctionnalités : auto-save IndexedDB derrière un port de stockage,
plusieurs projets/onglets chacun propriétaire de son runtime, effets et règles
génératives derrière des ports exécutables, et vélocité de playback configurable
sans réécrire les notes sources.

Le sampler décrit dans `sampler.txt` et les futurs instruments réutilisent notes,
clips, patterns, plan de playback, scheduler et historique existants. Ils ne créent
ni seconde grille, ni second moteur de séquence.

## Séquence de livraison recommandée

Pour conserver des pull requests petites et réversibles :

1. ajouter Vitest et migrer les tests des calculs purs ;
2. capturer les témoins de comportement et la baseline ;
3. ajouter le contrôle des frontières d’imports ;
4. documenter les propriétaires d’état et appliquer les règles de nommage ;
5. extraire les types d’éditeur hors de `ui` et supprimer la dépendance
   `persistence → ui` ;
6. séparer les fichiers de configuration ;
7. créer la carte cible au fil des déplacements : `application` vers
   `use-cases`, puis `geometry` et `interaction` vers `editor` ;
8. extraire la logique pure de `app/workflows`, déplacer ses hooks vers leur
   fonctionnalité UI et réserver `app` à la composition ;
9. scinder les types de commandes puis les handlers par famille ;
10. scinder la validation ;
11. modulariser le format natif sous `project-io/native`, définir son nouveau
    schéma v1 et ajouter ses tests de round-trip ;
12. modulariser le MIDI sous `project-io/midi` ;
13. livrer les fondations P2.5 par tranches avec leur premier consommateur :
    document/espace de travail avec le format v1, puis horloge et première
    `MeterMap`, puis `PlaybackSource`/`PlaybackPlan`, registre d’instruments et
    enfin `MidiExportPlan` ; ne pas les réunir dans une migration unique ;
14. extraire le contrôleur de viewport ;
15. extraire la stratégie de gestes hors du hook React ;
16. extraire les peintres Canvas, le ruler et le port de rendu ;
17. réorganiser les composants et les styles par fonctionnalité ;
18. compléter les smoke tests navigateur amorcés dès M0, ajouter les parcours
    Playwright et faire respecter les budgets mesurés ;
19. généraliser les instruments et ajouter la session de preview ;
20. livrer le drumkit sur le registre de renderers ;
21. construire le launcher de clips quantifié sur l’horloge et le compilateur
    existants ;
22. ajouter les patterns et leur projection résolue dans les clips ;
23. généraliser symétries, transposition, diminution et augmentation aux cibles
    `Pattern` et `Clip` ;
24. introduire les marqueurs et l’édition de la carte de métrique ;
25. construire les scenes sur le même plan d’occurrences ;
26. étendre l’export MIDI aux patterns, clips et scenes.

Ne pas commencer deux déplacements structurels qui touchent les mêmes imports en
parallèle. Les étapes 9 à 12 peuvent avancer indépendamment une fois les étapes
1 à 8 fusionnées.

## Définition de terminé

Une étape de cette feuille de route est terminée lorsque :

- le comportement utilisateur est inchangé ou le changement est explicitement
  documenté ;
- les témoins de comportement et budgets concernés ne régressent pas ;
- les nouveaux modules ont un propriétaire et une responsabilité décrits ;
- leur emplacement et leur nom respectent la carte de code, ou l’écart est
  expliqué par une mise à jour de cette carte ;
- aucun import interdit ni cycle nouveau n’est introduit ;
- les tests concernés sont localisables et passent isolément ;
- `npm run verify` et `git diff --check` passent ;
- README, architecture et feuille de route ne contredisent pas le code ;
- l’ancienne localisation a été supprimée, sans couche de transition devenue
  permanente.

## Indicateurs de progrès

Suivre ces indicateurs à chaque fin de priorité, sans en faire des objectifs
aveugles :

- nombre de violations de frontières : cible 0 ;
- fichiers TypeScript de plus de 800 lignes : diminution continue ;
- tests exécutables individuellement : cible 100 % ;
- dépendances de `domain` vers React/DOM/Web Audio : cible 0 ;
- dépendances de `persistence` vers `ui` : cible 0 ;
- hooks et composants dans des dossiers globaux sans capacité propriétaire :
  cible 0 ;
- nouveaux fichiers portant un nom générique interdit : cible 0 ;
- parcours critiques navigateur automatisés : cible minimale 8 ;
- nouveau format persistant v1 documenté et couvert en round-trip : cible 100 % ;
- états mutables avec propriétaire, durée de vie et politique Undo documentés :
  cible 100 % ;
- longues tâches dues aux opérations de fichiers sur la surface d’édition :
  cible 0 sur les fixtures de référence ;
- violations d’accessibilité automatiques sur les vues standard : cible 0 ;
- avertissements de build non justifiés : cible 0.
