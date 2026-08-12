# Feuille de route de maintenance

Cette feuille de route transforme l’audit du dépôt en travaux ordonnés. Son
objectif prioritaire est de rendre le code plus modulaire, les dépendances plus
lisibles et la navigation plus prévisible, sans changer le comportement musical
ni lancer une réécriture globale.

Date de référence : 13 août 2026.

## Point de départ

Le socle est déjà robuste : TypeScript strict, modèle immuable, mutations par
transactions, rendu haute fréquence hors React, codec MIDI borné et moteur audio
séparé en snapshot, scheduler, moteur et renderer.

L’audit relève toutefois plusieurs coûts de maintenance :

- 99 fichiers TypeScript pour environ 33 000 lignes, mais plusieurs fichiers
  dépassent 800 lignes ;
- `domain/commands.ts` approche 2 800 lignes et réunit types, dispatch et tous
  les handlers métier ;
- `native-project-file.ts` dépasse 2 000 lignes et réunit schéma, sérialisation,
  parsing du projet, parsing de l’éditeur et primitives JSON ;
- `midi-importer.ts` dépasse 1 500 lignes et combine analyse, regroupement,
  conversion, résolution de collisions, création du projet et avertissements ;
- `useViewportControls.ts`, `usePianoRollEvents.ts` et
  `PianoRollLayers.tsx` dépassent chacun 1 000 lignes ;
- `App.tsx` reste une racine de composition lourde, notamment pour les modales
  de collision et d’instrument ;
- `app`, `application`, `interaction/core` et `ui` ont des frontières difficiles
  à deviner sans lire les imports ;
- la persistance dépend encore de types situés sous `ui/rendering` ;
- les 71 tests exécutables sont concentrés dans deux scripts de plus de 4 500
  lignes au total, ce qui ralentit la localisation et l’ajout d’un scénario ;
- les interactions DOM, Canvas, le responsive et Web Audio réel ne sont pas
  couverts automatiquement ;
- le bundle JavaScript principal dépasse actuellement le seuil d’avertissement
  Vite de 500 kB avant gzip.

Le point de référence est vert : `npm run verify` passe avec 62 scénarios
domaine/application/audio/persistance et 9 scénarios MIDI.

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
   liens documentaires concernés.

## Priorités

| Priorité | Chantier | Bénéfice principal | Risque | Dépend de |
| --- | --- | --- | --- | --- |
| P0 | garde-fous, tests et conventions | refactorings sûrs et règles visibles | faible | rien |
| P1 | frontières et arborescence | emplacement prévisible de chaque responsabilité | moyen | P0 |
| P2 | découpage du domaine et des formats | réduction des fichiers monolithiques les plus risqués | moyen | P0–P1 |
| P3 | découpage de l’éditeur et de l’UI | meilleure navigation et isolation des chemins haute fréquence | moyen à élevé | P1–P2 |
| P4 | automatisation navigateur et performance | prévention des régressions tactiles, Canvas et bundle | moyen | P0–P3 partiel |
| P5 | préparation des futures fonctionnalités | extensions audio et persistance sans nouveau couplage | variable | P1–P4 |

P0 et P1 sont les travaux les plus urgents. P2 doit commencer par les commandes
et le format natif, car ces modules concentrent le plus de règles persistantes.

## P0 — Installer les garde-fous

### P0.1 Adopter un vrai runner de tests

Remplacer progressivement le mini-runner des scripts par Vitest, déjà cohérent
avec la toolchain Vite. Ne pas convertir les 71 scénarios dans une seule pull
request.

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

Ordre de migration : calculs purs, reducer et store, persistance, MIDI, puis
scheduler et moteur. Les scripts existants restent exécutés tant qu’un groupe
n’a pas été migré.

Critères de sortie :

- un test isolé peut être lancé par fichier ou par nom ;
- les fixtures ne sont plus dupliquées entre les suites ;
- `npm test` exécute ancien et nouveau runner pendant la transition ;
- le nombre de scénarios ne diminue pas.

### P0.2 Automatiser les frontières

Ajouter un contrôle d’imports dans la CI. Une règle simple suffit au départ :

- `domain`, `music` et `geometry` n’importent jamais `app`, `ui`, React ou une
  API navigateur ;
- `application` n’importe pas `app` ou `ui` ;
- `audio`, `midi` et `persistence` n’importent pas `app` ou un composant React ;
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

Les renommages qui touchent le format `.pianola` nécessitent une migration de
schéma ; ils ne doivent pas être mêlés à un simple déplacement de fichiers.

## P1 — Clarifier les frontières et l’arborescence

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
- round-trip natif inchangé.

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
de l’UI. Leur logique pure est d’abord extraite vers `application` afin que le
déplacement ne se contente pas de déplacer un gros hook.

Correspondances recommandées :

| Actuel | Cible |
| --- | --- |
| `app/workflows/useSelectionWorkflow.ts` | cas d’usage dans `application/selection`, hook dans `ui/editor` |
| `app/workflows/useClipWorkflow.ts` | cas d’usage dans `application/clips`, hook dans `ui/inspector` |
| `app/workflows/useProjectInstrumentWorkflow.ts` | cas d’usage dans `application/instruments`, hook dans `ui/inspector` |
| `app/workflows/useProjectFileWorkflow.ts` | orchestration dans `application/project-files`, adaptateur dans `ui/project-files` |
| `app/workflows/useMidiFileWorkflow.ts` | orchestration dans `application/midi`, adaptateur dans `ui/midi` |
| `app/workflows/useViewportControls.ts` | contrôleur pur dans `editor/viewport`, binding React dans `ui/piano-roll` |

Critère de sortie : `App.tsx` câble des contrôleurs déjà construits et ne porte
plus de protocole métier complet.

### P1.3 Unifier `interaction` et `interaction/core`

Le sous-dossier `core` n’apporte plus de frontière claire puisque tout
`src/interaction` est déjà indépendant du navigateur. Déplacer ses modules sous
des sous-domaines explicites :

```text
src/interaction/
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

L’adaptation de `PointerEvent` reste sous `ui`. La dépendance directe de la
session vers `EditorSelection` doit être remplacée par un port étroit ou être
assumée en déplaçant la session dans un module d’éditeur explicitement
applicatif.

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

Les bornes utilisées par `domain/validation.ts` ne doivent pas venir d’un groupe
nommé `EDITOR_CONSTANTS`. Les couleurs de projets créés par l’import MIDI ne
doivent pas obliger le convertisseur MIDI à dépendre d’une configuration de
rendu ; fournir une palette de création ou injecter une fabrique d’instruments.

Critère de sortie : chaque fichier de configuration a un propriétaire clair et
aucun module pur n’importe une configuration d’UI par commodité.

## P2 — Découper les monolithes métier et fichiers

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

### P2.2 Scinder la validation

Aligner la validation sur le modèle : notes/pistes, instruments/presets,
transport, clips/projet et descripteurs. Conserver un type d’erreur et un format
de chemin communs.

Le but n’est pas de dupliquer les bornes entre parser, validation et reducer.
Chaque règle possède un propriétaire et les couches externes l’appellent.

### P2.3 Modulariser le format natif

Structure cible :

```text
src/persistence/native-project/
├── schema.ts
├── metadata.ts
├── serializer.ts
├── parser.ts
├── errors.ts
├── parsing/
│   ├── json-readers.ts
│   ├── parse-project.ts
│   ├── parse-editor-state.ts
│   ├── parse-instruments.ts
│   └── parse-clips.ts
└── migrations/
```

Ajouter des fixtures de compatibilité versionnées avant le premier changement de
schéma. La version actuelle ne dispose d’aucune migration : ce point doit être
résolu avant une évolution structurelle du modèle persistant.

Critères de sortie :

- parser et sérialiseur sont testés séparément ;
- les primitives JSON sont indépendantes du domaine ;
- un fichier de la version courante reste chargeable après chaque extraction ;
- une stratégie explicite existe pour toute future version 2.

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
- Canvas présent avec dimensions non nulles et DPR simulé.

Web Audio réel doit être couvert par quelques smoke tests compatibles navigateur,
pas par une reproduction exhaustive du scheduler déjà testé avec un faux moteur.

### P4.2 Tests de propriétés et benchmark geometry

Mettre en œuvre `geometry/__tests__/TEST_PLAN.md` avec des tests de propriétés
pour le convertisseur et une référence linéaire pour `SpatialIndex`. Conserver
le benchmark 10 000 notes hors du chemin CI bloquant tant qu’une baseline stable
n’existe pas.

### P4.3 Budget bundle et chargement différé

Mesurer avant d’optimiser. Les premières candidates au chargement différé sont
les modales d’édition d’instrument et les workflows de fichiers/MIDI, absents du
chemin d’édition principal. Ajouter un budget documenté et suivre les tailles
minifiées et gzip dans la CI.

Critère de sortie : plus d’avertissement de chunk non expliqué, ou seuil ajusté
avec une justification et une mesure enregistrée.

## P5 — Préparer les extensions produit

Ces travaux ne doivent commencer qu’après stabilisation des frontières :

- migration explicite du format natif ;
- auto-save IndexedDB derrière un port de stockage ;
- plusieurs projets/onglets, chacun propriétaire de son `EditorRuntime` ;
- nouveaux instruments via la variante discriminée et `InstrumentRenderer` ;
- effets et règles génératives derrière des ports exécutables ;
- vélocité de playback configurable sans modifier les notes existantes.

Le sampler décrit dans `sampler.txt` doit réutiliser clips, notes, scheduler et
historique existants. Il ne doit pas créer une seconde grille ou un second moteur
de séquence.

## Séquence de livraison recommandée

Pour conserver des pull requests petites et réversibles :

1. ajouter Vitest et migrer les tests des calculs purs ;
2. ajouter le contrôle des frontières d’imports ;
3. extraire les types d’éditeur hors de `ui` et supprimer la dépendance
   `persistence → ui` ;
4. normaliser les noms sans modifier le schéma natif ;
5. unifier l’arborescence `interaction` ;
6. séparer les fichiers de configuration ;
7. scinder les types de commandes puis les handlers par famille ;
8. scinder la validation ;
9. modulariser le format natif et ajouter les fixtures de compatibilité ;
10. modulariser l’import MIDI ;
11. extraire le contrôleur de viewport ;
12. extraire la stratégie de gestes hors du hook React ;
13. extraire les peintres Canvas et le ruler ;
14. réorganiser les composants et les styles par fonctionnalité ;
15. ajouter les parcours Playwright et le budget bundle.

Ne pas commencer deux déplacements structurels qui touchent les mêmes imports en
parallèle. Les étapes 7 à 10 peuvent avancer indépendamment une fois les étapes
1 à 6 fusionnées.

## Définition de terminé

Une étape de cette feuille de route est terminée lorsque :

- le comportement utilisateur est inchangé ou le changement est explicitement
  documenté ;
- les nouveaux modules ont un propriétaire et une responsabilité décrits ;
- aucun import interdit ni cycle nouveau n’est introduit ;
- les tests concernés sont localisables et passent isolément ;
- `npm run verify` et `git diff --check` passent ;
- README, architecture et feuille de route ne contredisent pas le code ;
- l’ancienne localisation a été supprimée, sans couche de compatibilité devenue
  permanente.

## Indicateurs de progrès

Suivre ces indicateurs à chaque fin de priorité, sans en faire des objectifs
aveugles :

- nombre de violations de frontières : cible 0 ;
- fichiers TypeScript de plus de 800 lignes : diminution continue ;
- tests exécutables individuellement : cible 100 % ;
- dépendances de `domain` vers React/DOM/Web Audio : cible 0 ;
- dépendances de `persistence` vers `ui` : cible 0 ;
- parcours critiques navigateur automatisés : cible minimale 8 ;
- documentation de chaque format persistant et de sa migration : cible 100 % ;
- avertissements de build non justifiés : cible 0.
