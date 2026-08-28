# État de la migration

Ce fichier est le journal mutable et le point de reprise. Il doit refléter le
workspace réel, pas seulement l'intention.

## État global

- Statut : EN ATTENTE
- Lot actif : Aucun
- Dernier lot terminé : 5 — Décomposition de `PianoRollWorkspace`
- Prochaine action : après revue du lot 5, vérifier la condition d'entrée du
  lot 6 et commencer uniquement sa première sous-étape ; ne déplacer aucune
  configuration ou horizontale avant cette ouverture
- Dernière mise à jour : 2026-08-28

## Politique de rollback en vigueur

Depuis le 2026-08-28, aucun fichier patch de rollback ne doit être créé pour
les prochains lots ou sous-étapes. Les points de rollback consignent le SHA de
départ, le périmètre exact et les validations vertes ; un commit dédié déjà
existant peut être annulé avec `git revert`. Les références à des patches dans
le journal ci-dessous décrivent uniquement l'exécution historique des lots 0 à
3 et ne doivent pas être reproduites.

## Baseline connue

- arborescence source actuelle : `app`, `application`, `audio`, `config`,
  `domain`, `editor`, `infrastructure`, `music`, `project-io`, `pwa`, `styles`,
  `ui`, `use-cases` ;
- aucun cycle d'import produit ou test n'est accepté ;
- `PianoRollWorkspace.tsx` est ramené à 766 lignes et coordonne des contrats
  extraits ; `InstrumentPresetDialog.tsx` et `ClipInspector.tsx` restent les
  principaux points de concentration UI ;
- `time-map.ts` et `clip-commands.ts` dépassent désormais 1 000 lignes ;
- le format `.pianola` est sous `infrastructure/project-files/pianola` et la
  persistance locale sous `infrastructure/persistence` ;
- les contrôles analysent séparément 269 fichiers produit et 66 modules de
  test ; tout cycle est interdit ;
- la couverture ciblée et les trois mesures de rendu sont consignées dans
  `LOT-0-BASELINES.md`.

Cette baseline doit être revérifiée au début du lot 0 : elle peut devenir
obsolète si le projet évolue.

## Changements préexistants observés le 2026-08-26

Au moment de créer ce dossier :

```text
M  .gitignore
D  docs/persistence-strategy.md
D  docs/storage-strategies.md
```


## Suivi des lots

| Lot | Statut | Notes |
| ---: | --- | --- |
| 0 | TERMINÉ | Baseline, couverture et scénario de rendu connus ; garde-fous verts |
| 1 | TERMINÉ | Cinq types explicites adoptés ; alias supprimés ; garde-fous et suite complète verts |
| 2 | TERMINÉ | Format `.pianola` |
| 3 | TERMINÉ | Ports applicatifs, adaptateurs infrastructure et reset local validés |
| 4 | TERMINÉ | Historique et session sous `application`, cœur découplé, cycle supprimé |
| 5 | TERMINÉ | Six jalons caractérisés et validés ; rendu sans régression |
| 6 | À FAIRE | Configurations et horizontales |
| 7 | À FAIRE | Renommage physique des couches |
| 8 | À FAIRE | Nettoyage final |

## Compatibilités temporaires

Aucun alias ni aucune compatibilité de code ou de données ne subsiste des lots
0 et 1. Les alias de renommage créés pendant les sous-étapes du lot 1 ont été
supprimés avant sa sortie. Le profiler opt-in `renderBaseline=1` reste un
diagnostic reproductible après la comparaison du lot 5, pas une façade de
compatibilité. Le lot 3 n'ajoute aucun alias : les anciens chemins de
persistance ont été supprimés et les anciennes données locales sont
réinitialisées, pas converties. Le lot 4 n'ajoute aucun alias : les anciens
chemins du store, du service de commandes, du runtime et de la projection du
workspace sont supprimés. Le lot 5 n'ajoute aucun alias ni compatibilité : ses
contrats de présentation remplacent directement les blocs extraits.

## Écarts et découvertes

- l'instrumentation V8 fausse les seuils des benchmarks audio ; la couverture
  reste ciblée et la validation complète s'exécute sans instrumentation ;
- `PianoRollWorkspace` possède désormais les caractérisations par jalon, les
  tests de modèles/abonnements et le smoke navigateur requis ;
  `ClipInspector.tsx` et `InstrumentPresetDialog.tsx` gardent une couverture
  directe nulle et restent interdits de découpage avant leurs propres tests de
  caractérisation ;
- le chunk JavaScript principal supérieur à 500 kB reste un avertissement de
  build non bloquant et préexistant ;
- le premier passage du scénario de rendu est un outlier à froid ; la médiane
  de trois passages constitue la comparaison reproductible du lot 5.
- les occurrences textuelles restantes de « Track » appartiennent au
  vocabulaire du format MIDI (`End of Track`, numéro de piste) ; aucun
  identifiant TypeScript produit n'utilise encore le type générique `Track` ;
- les types renommés restent physiquement chez leurs propriétaires courants ;
  leur déplacement de couche n'est pas anticipé et demeure réservé aux lots
  prévus par la feuille de route.
- les deux fichiers préexistants sous `src/ui/shared` restent réservés au lot 6
  et n'ont pas été déplacés par les lots 3 ou 4.

## Journal

### 2026-08-28 — Lot 5, démarrage

- objectif : décomposer `PianoRollWorkspace` dans les six jalons et dans
  l'ordre imposés par `ROADMAP.md`, sans changement fonctionnel, sans source de
  vérité concurrente, sans rerendu global causé par une valeur à fréquence
  frame et sans commencer le lot 6 ;
- condition d'entrée vérifiée dans `STATUS.md` avant toute modification du
  lot : les lots 1 et 4 sont `TERMINÉ`, leurs validations complètes sont
  vertes, le lot 5 est le premier lot `À FAIRE`, et aucun jalon du lot 6 n'est
  commencé ;
- condition d'entrée vérifiée dans le code : le document et le clip actif sont
  possédés par `application/history/ProjectStore`, le workspace persistant est
  projeté par `application/editor-session/workspace-persistence.ts`, la session
  d'interaction reste dans `EditorSelection`, les hooks de capacité et les refs
  locales, et les valeurs temps réel restent dans les signaux d'`EditorRuntime`;
  `ProjectStorePort.subscribe` et les contrats `ReadonlyRenderSignal` sont
  disponibles sans dépendre de `PianoRollWorkspace` ;
- garde-fou de couverture préalable : la baseline du lot 0 mesure toujours
  `PianoRollWorkspace.tsx` à 0 % et interdit son découpage sans
  caractérisation. Chaque jalon commencera donc par les témoins du comportement
  concerné ; aucun jalon suivant ne démarrera avant validation séparée du
  précédent ;
- commit de sauvegarde demandé avant le lot : `a602a32` (`chore: checkpoint
  before migration lot 5`) fige les changements préexistants correspondant au
  lot 4 ; le worktree est propre après ce commit ;
- SHA de départ et point de rollback initial :
  `a602a322b81955a0087caf6b7c6f4f56f171511e` ; le lot 5 n'a pas encore de
  commit dédié, donc un retour éventuel doit être préparé par jalon à partir du
  diff et des listes de fichiers consignées, sans patch préventif et sans
  annuler un jalon déjà validé ;
- validation de référence avant modification : `npm run verify` réussi —
  33 fichiers Markdown, 321 fichiers source, frontières vertes sur 269 fichiers
  produit et 66 modules de test, typecheck et build Vite réussis, smoke
  AudioWorklet réussi, 62 fichiers de test et 405 tests réussis ; seul
  l'avertissement préexistant de chunk supérieur à 500 kB subsiste ;
- audit préalable de `PianoRollWorkspace.tsx` : 1 427 lignes ; préférences et
  presets personnels aux lignes 278-317, 498-661 et 874-936 ; cycle de vie
  projet aux lignes 254-255, 353-364, 388-394 et 937-1004 ; modèle du menu
  radial aux lignes 417-423 et 790-873 ; dialogues et workflows de capacité
  aux lignes 471-789 et 1251-1369 ; layout et portal aux lignes 1005-1250 ;
  transport et viewport aux lignes 323-470 et 718-761 ;
- périmètre prévu : `src/ui/piano-roll/PianoRollWorkspace.tsx`, nouveaux
  composants/hooks/modèles fonctionnels colocalisés sous `src/ui/piano-roll/`
  ou chez les surfaces déjà propriétaires (`ui/project-files`,
  `ui/transport`, `ui/dialogs`, `ui/inspector`), adaptateur sélecteur étroit
  pour `ProjectStorePort`, tests colocalisés de chaque extraction, scénario de
  rendu du lot 0, puis documentation courante directement affectée ;
- exclusions explicites : aucun déplacement de `src/config`, `src/music` ou
  `src/ui/shared`, aucun découpage des commandes ou de `time-map.ts`, aucun
  renommage physique de couche, aucun changement de schéma persistant, aucune
  adoption de store UI externe et aucune action des lots 6 à 8 ;
- stratégie de validation : après chacun des six jalons, exécuter
  `npm run typecheck`, `npm run check:boundaries` et les tests ciblés du
  propriétaire ; consigner le périmètre exact et le résultat avant de passer au
  suivant. À la sortie, exécuter les recherches obligatoires, la validation
  complète et trois passages du scénario reproductible de rendu comparés à la
  baseline du lot 0.
- jalon 1 — préférences et presets personnels : les états temporaires de mode
  de sélection, couleur des notes et préécoute du pitch, ainsi que leur écriture
  dans `UserSettingsRepository`, sont possédés par
  `usePianoRollUserPreferences`. Les mutations de la bibliothèque personnelle
  sont caractérisées par un modèle pur colocalisé avec l'inspecteur
  d'instruments ; le projet continue de recevoir uniquement les snapshots de
  presets déjà utilisés, sans modifier le format ni le repository ;
- tests de caractérisation du jalon 1 : création avec normalisation du nom,
  mise à jour et renommage sans changement d'identité, rejet des noms vides ou
  doublons, suppression des deux index et rejet d'un preset disparu ; les tests
  métier de fusion et les contrats des repositories de réglages restent verts ;
- point de rollback du jalon 1 : SHA de départ `a602a32`, fichiers
  `src/ui/piano-roll/PianoRollWorkspace.tsx`,
  `src/ui/inspector/instruments/usePianoRollUserPreferences.ts`,
  `src/ui/inspector/instruments/personal-instrument-preset-settings.ts` et son
  test colocalisé ; revenir uniquement sur ces fichiers après comparaison du
  diff, sans toucher au journal ni aux jalons validés ultérieurement ;
- validations du jalon 1 : `npm run typecheck` et
  `npm run check:boundaries` réussis — 271 fichiers produit et 67 modules de
  test ; 3 fichiers et 12 tests ciblés réussis pour les presets personnels et
  la persistance des réglages. `PianoRollWorkspace.tsx` passe de 1 427 à
  1 159 lignes ; statut du jalon : vert.
- jalon 2 — cycle de vie projet : `usePianoRollProjectLifecycle` possède
  désormais l'autosave, la fermeture avec flush, l'export `.pianola`, le
  remplacement du projet actif et les imports/exports MIDI. La ref d'analyse
  MIDI en attente et son nettoyage ne résident plus dans le composant racine ;
  celui-ci injecte seulement les effets visuels de réinitialisation et de
  restauration du workspace ;
- caractérisation du jalon 2 : création initiale, ouverture et contrat des
  repositories, clone, capture/flush d'autosave, codecs et aller-retour du
  format `.pianola`, régressions d'import/export MIDI et conservation du
  document/workspace sont couverts par les suites ciblées existantes ;
- point de rollback du jalon 2 : SHA de départ `a602a32`, fichiers du jalon 1
  déjà validés plus `src/ui/project-files/usePianoRollProjectLifecycle.ts` et
  `src/ui/piano-roll/PianoRollWorkspace.tsx`. Un retour du seul jalon 2 doit
  supprimer ce hook et rétablir uniquement son bloc d'intégration dans le
  workspace, après vérification du diff ;
- validations du jalon 2 : `npm run typecheck` et
  `npm run check:boundaries` réussis — 272 fichiers produit et 67 modules de
  test ; 7 fichiers et 80 tests ciblés réussis en deux commandes pour la
  création, l'ouverture, la persistance, le clone, l'autosave, `.pianola`, MIDI
  et la régression audio/domaine. `PianoRollWorkspace.tsx` passe de 1 159 à
  1 102 lignes ; statut du jalon : vert.
- jalon 3 — menu radial : un modèle pur reçoit un snapshot explicite de la
  sélection et du presse-papier et dérive disponibilité, libellé, icône et
  tonalité des six commandes ; `usePianoRollRadialMenuCommands` lie ensuite ce
  modèle aux callbacks injectés et à la commande centrale play/pause. Aucun de
  ces modules ne lit implicitement le store, le runtime ou l'état interne de
  `PianoRollWorkspace` ;
- point de rollback du jalon 3 : SHA de départ `a602a32`, nouveaux fichiers
  `piano-roll-radial-command-model.ts`,
  `usePianoRollRadialMenuCommands.ts` et test colocalisé sous
  `src/ui/piano-roll/context-menu/`, plus le seul bloc d'intégration modifié
  dans `PianoRollWorkspace.tsx` ;
- validations du jalon 3 : `npm run typecheck` et
  `npm run check:boundaries` réussis — 274 fichiers produit et 68 modules de
  test ; les 7 tests des modèles de commandes et de géométrie du menu sont
  verts. `PianoRollWorkspace.tsx` passe de 1 102 à 1 046 lignes ; statut du
  jalon : vert.
- jalon 4 — dialogues et workflows de capacité :
  `usePianoRollDialogState` possède les seules identités d'ouverture qui
  restaient dans le workspace (mesures et cible de découpe). Les brouillons
  d'application, de clip, d'instrument et de time map restent chacun possédés
  par leur workflow existant ; `PianoRollWorkspaceDialogs` ne fait que rendre
  ces contrats et ne copie aucun état canonique ;
- caractérisation du jalon 4 : ajout des témoins insertion/suppression de
  mesures, maintien des tests de brouillon de marqueur, sélection de marqueur,
  mesures adjacentes et presets personnels. Les validations confirment que les
  formulaires n'écrivent le document qu'à leur confirmation ;
- point de rollback du jalon 4 : SHA de départ `a602a32`, nouveaux fichiers
  `src/ui/dialogs/PianoRollWorkspaceDialogs.tsx`,
  `piano-roll-dialog-model.ts`, `usePianoRollDialogState.ts` et test colocalisé,
  plus les blocs dialogue/mesures extraits de `PianoRollWorkspace.tsx` ;
- validations du jalon 4 : `npm run typecheck` et
  `npm run check:boundaries` réussis — 277 fichiers produit et 69 modules de
  test ; 5 fichiers et 31 tests ciblés réussis. Le composant de dialogues fait
  224 lignes et `PianoRollWorkspace.tsx` passe de 1 046 à 900 lignes ; statut
  du jalon : vert.
- jalon 5 — layout et portals : `PianoRollWorkspaceLayout` possède maintenant
  le shell, la hiérarchie DOM workspace/editor/frame/stage/canvas, la place de
  l'inspecteur et le portal de sa toolbar. Il reçoit exclusivement des nœuds et
  fonctions de rendu injectés ; aucune logique métier, de persistance ou de
  cycle de vie n'a été déplacée avec la structure ;
- smoke de layout : `scripts/measure-render-baseline.mjs` vérifie désormais la
  présence et l'imbrication du shell, du workspace, de l'éditeur, de la frame,
  du stage, du canvas, de l'inspecteur et de la toolbar portalée avant
  d'exécuter son scénario. Le test pur des classes couvre inspecteur fermé,
  instruments ouvert et clips ouvert ;
- point de rollback du jalon 5 : SHA de départ `a602a32`, nouveaux fichiers
  `PianoRollWorkspaceLayout.tsx` et son test colocalisé, structure extraite de
  `PianoRollWorkspace.tsx`, et assertion de smoke ajoutée au script de mesure ;
- validations du jalon 5 : `npm run typecheck` et
  `npm run check:boundaries` réussis — 278 fichiers produit et 70 modules de
  test ; 2 fichiers et 7 tests ciblés réussis. Le smoke Edge 151 passe sur les
  trois exécutions : 11 commits du workspace, 10 pour chacune des quatre
  surfaces suivies, longues tâches 1/1/0 et aucune notification de sélecteur
  inchangé. Le layout fait 100 lignes et `PianoRollWorkspace.tsx` 885 lignes ;
  statut du jalon : vert. Ces mesures sont intermédiaires ; la comparaison de
  sortie reste réservée au jalon 6.
- jalon 6 — transport/viewport et abonnements :
  `usePianoRollTransportViewport` possède l'audio, les commandes de transport,
  l'auto-fit, le retour au début et les refs/contrôles de viewport ;
  `usePlaybackFollowSelection` possède la politique de sélection du clip joué.
  Le playhead, le viewport, les survols et les previews restent sur leurs
  signaux et invalidations DOM/Canvas directes ;
- `useProjectStoreSelector`, fondé sur `useSyncExternalStore`, lit le
  propriétaire canonique sans recopier le store. Son adaptateur met en cache la
  projection, conserve sa référence lorsqu'elle est égale et ne notifie pas
  React pour une mutation sans rapport. `useRenderSignalValue` remplace les
  copies manuelles des réglages de snap et de résolution visibles dans le JSX ;
- tests d'abonnement du jalon 6 : même référence après modification d'un autre
  champ, zéro notification lorsque `activeClipId` ne change pas, exactement une
  notification et le nouveau snapshot lorsque la projection change ; les
  politiques de suivi, l'état des contrôles transport, les bornes du viewport
  et le comportement critique restent verts ;
- point de rollback du jalon 6 : SHA de départ `a602a32`, nouveaux modules
  `project-store-selector.ts`, `useProjectStoreSelector.ts`,
  `useRenderSignalValue.ts`, `usePianoRollTransportViewport.ts` et test de
  sélecteur, plus `usePianoRollProjectState.ts`, le bloc transport/viewport de
  `PianoRollWorkspace.tsx` et l'instrumentation diagnostique affectée ;
- validations rapides du jalon 6 : `npm run typecheck` et
  `npm run check:boundaries` réussis — 282 fichiers produit et 71 modules de
  test ; 5 fichiers et 20 tests ciblés réussis pour abonnements, suivi,
  contrôles, bornes et comportement critique. `PianoRollWorkspace.tsx` passe de
  885 à 766 lignes ; statut du jalon : vert ;
- scénario de rendu final : même commande, machine, Edge headless 151, viewport
  1416 × 808, DPR 1 et trois passages que la baseline du lot 0. Résultats
  11/11/11 commits pour `PianoRollWorkspace` contre 13/13/13 (médiane -15,4 %),
  10/10/10 pour chacune des quatre surfaces suivies contre 12/12/12 (médiane
  -16,7 %), longues tâches 3/1/1 contre 5/3/2 (médiane 1 contre 3, -66,7 %) et
  notifications de sélecteur inchangé 0/0/0. Aucun seuil de +10 % n'est approché ;
- documentation courante synchronisée : README racine, README de l'UI,
  `docs/architecture.md`, `docs/code-map.md`, `docs/app-composition.md` et
  `docs/state-ownership.md` décrivent les propriétaires, layout, hooks de
  cycle de vie, transport/viewport et contrats d'abonnement réellement présents ;
- recherches de sortie et contrôle du périmètre : aucun bloc résiduel de
  préférences/presets, cycle de vie projet, modèle radial, rendu de dialogues,
  portal ou orchestration transport/viewport dans `PianoRollWorkspace`; aucun
  diff sous `src/config`, `src/music`, `src/ui/shared`, `clip-commands.ts` ou
  `time-map.ts`. Les deux fichiers préexistants sous `src/ui/shared` restent
  réservés au lot 6 ; aucun dossier générique, store externe, alias ou façade
  temporaire n'a été ajouté ;
- validation complète finale : `npm run verify` réussi — 33 fichiers Markdown,
  339 fichiers source contrôlés par la structure, frontières vertes sur
  282 fichiers produit et 71 modules de test, typecheck et build Vite réussis,
  smoke AudioWorklet réussi, 67 fichiers de test et 420 tests réussis ; seul
  l'avertissement préexistant de chunk supérieur à 500 kB subsiste ;
- statut du lot : `TERMINÉ`. Les six jalons sont validés séparément, les
  abonnements ne notifient pas pour un snapshot inchangé et le scénario
  reproductible montre une amélioration des commits et longues tâches par
  rapport à la baseline du lot 0. Le lot 6 n'est pas commencé ;
- point de rollback final : SHA de départ
  `a602a322b81955a0087caf6b7c6f4f56f171511e`, commit initial de sauvegarde
  `a602a32`, aucun commit dédié au lot 5 et aucun patch créé. Le périmètre exact
  compte 29 fichiers listés ci-dessous ; un retour doit être préparé par jalon à
  partir du diff et ne doit jamais annuler un jalon validé sans viser ses seuls
  fichiers ;
- prochaine action exacte : après revue du lot 5, ouvrir le lot 6 en revérifiant
  sa condition d'entrée, puis traiter uniquement sa première sous-étape de
  redistribution. Ne pas anticiper le renommage physique du lot 7.

```text
README.md
docs/app-composition.md
docs/architecture.md
docs/code-map.md
docs/migration/STATUS.md
docs/state-ownership.md
scripts/measure-render-baseline.mjs
src/ui/README.md
src/ui/diagnostics/RenderBaselineProfiler.tsx
src/ui/dialogs/PianoRollWorkspaceDialogs.tsx
src/ui/dialogs/__tests__/piano-roll-dialog-model.test.ts
src/ui/dialogs/piano-roll-dialog-model.ts
src/ui/dialogs/usePianoRollDialogState.ts
src/ui/inspector/instruments/__tests__/personal-instrument-preset-settings.test.ts
src/ui/inspector/instruments/personal-instrument-preset-settings.ts
src/ui/inspector/instruments/usePianoRollUserPreferences.ts
src/ui/piano-roll/PianoRollWorkspace.tsx
src/ui/piano-roll/PianoRollWorkspaceLayout.tsx
src/ui/piano-roll/__tests__/piano-roll-workspace-layout.test.ts
src/ui/piano-roll/__tests__/project-store-selector.test.ts
src/ui/piano-roll/context-menu/__tests__/piano-roll-radial-command-model.test.ts
src/ui/piano-roll/context-menu/piano-roll-radial-command-model.ts
src/ui/piano-roll/context-menu/usePianoRollRadialMenuCommands.ts
src/ui/piano-roll/project-store-selector.ts
src/ui/piano-roll/usePianoRollProjectState.ts
src/ui/piano-roll/useProjectStoreSelector.ts
src/ui/piano-roll/useRenderSignalValue.ts
src/ui/project-files/usePianoRollProjectLifecycle.ts
src/ui/transport/usePianoRollTransportViewport.ts
```

### 2026-08-28 — Lot 4, démarrage

- objectif : séparer l'agrégat applicatif `EditorRuntime` des mécanismes purs
  d'édition, placer l'historique et l'orchestration des commandes sous
  `application`, conserver les orchestrations métier hors React, supprimer la
  dépendance produit `editor → use-cases` et retirer le cycle spatial, sans
  changement fonctionnel ni décomposition de `PianoRollWorkspace` ;
- condition d'entrée vérifiée avant toute modification : `STATUS.md` marque le
  lot 3 `TERMINÉ`, son journal consigne sa validation complète verte, le lot 4
  est le premier lot `À FAIRE`, et aucune action du lot 5 n'est commencée ;
- SHA de départ et point de rollback initial :
  `cd77003d234b2d7ff807c0a89f94acd3b9f88aa6` ; aucun commit dédié au lot 4
  n'existe, donc un éventuel retour devra être préparé fichier par fichier à
  partir du diff et de ce journal, sans patch préventif ;
- état initial du worktree vérifié par `git status --short` : propre ; aucun
  changement préexistant de l'utilisateur à isoler ;
- validation de référence avant modification : `npm run verify` réussi —
  33 fichiers Markdown, 320 fichiers source, frontières vertes sur 268 fichiers
  produit et 66 modules de test, typecheck et build Vite réussis, smoke
  AudioWorklet réussi, 62 fichiers de test et 404 tests réussis ; seul
  l'avertissement préexistant de chunk supérieur à 500 kB subsiste ;
- audit préalable : `src/domain/project-store.ts` possède l'historique et les
  notifications de session ;
  `src/use-cases/commands/editor-command-service.ts` orchestre transactions et
  checkpoints de sélection ; `src/editor/runtime/editor-runtime.ts` mélange
  ces services applicatifs avec sélection, index spatial et signaux purs ;
  `ViewportController` dépend de cet agrégat alors qu'un port étroit suffit ;
  le seul import produit `editor → use-cases` se trouve dans cet agrégat ; le
  seul cycle produit reste le cycle typé entre `spatial-index.ts` et
  `spatial-index-search.ts` ; les orchestrations de capacité neutres déjà sous
  `use-cases` n'importent pas React, et leurs hooks sous `ui` sont leurs
  adaptateurs actuels ;
- périmètre prévu : déplacer le store et le service de commandes sous
  `src/application/history/`, placer le contrat agrégé de session et la
  projection du workspace sous `src/application/editor-session/`, introduire
  sous `src/editor/` les seuls ports étroits nécessaires aux contrôleurs purs,
  mettre à jour leurs consommateurs sous `src/app`, `src/ui`, `src/use-cases`,
  `src/infrastructure` et `tests`, extraire le type partagé qui casse le cycle
  spatial, puis resserrer `scripts/check-import-boundaries.mjs` et son test ;
- documentation courante prévue : README racine, `docs/architecture.md`,
  `docs/code-map.md`, `docs/state-ownership.md`,
  `docs/guides/contributing.md`, `src/editor/README.md` et
  `src/use-cases/README.md`, selon les chemins effectivement modifiés ;
- exclusions explicites : aucun découpage ou changement de rendu de
  `PianoRollWorkspace`, aucun jalon du lot 5, aucune redistribution de
  configuration ou de `src/music` du lot 6, aucun renommage physique global
  des couches du lot 7, aucun changement de schéma persistant ;
- stratégie de sous-étapes : (1) historique et commandes applicatives ;
  (2) contrat de session, ports/signaux purs et projections de workspace ;
  (3) cycle spatial et garde-fous ; chaque sous-étape reçoit
  `npm run typecheck`, `npm run check:boundaries` et ses tests ciblés avant la
  suivante.
- sous-étapes historique et session, exécutées ensemble car le déplacement du
  store rend temporairement invalide l'ancien agrégat : `ProjectStore` et
  `EditorCommandService` sont sous `src/application/history/` ; le contrat
  `EditorRuntime` et la projection persistante du workspace sont sous
  `src/application/editor-session/`. Les services/signaux purs restent chez
  leurs propriétaires sous `src/editor`, et `ViewportController` dépend
  désormais d'un `ViewportRuntimePort` étroit, sans connaître l'agrégat
  applicatif ;
- séparation React/capacités vérifiée sur ce périmètre : les hooks UI restent
  des adaptateurs de leurs orchestrations neutres ; aucun import React n'a été
  introduit sous `application`, `editor` ou `use-cases`, et aucun protocole du
  lot 5 n'a été déplacé hors de `PianoRollWorkspace` ;
- fichiers de rollback de cette unité : les trois anciens modules déplacés,
  les trois nouveaux modules sous `application/history` et
  `application/editor-session`, `src/editor/viewport/viewport-controller.ts`,
  et les consommateurs d'import recensés sous `src/app`, `src/domain` (tests),
  `src/infrastructure` (tests), `src/ui`, `src/use-cases` et `tests/integration` ;
  revenir en arrière exige de vérifier ce périmètre exact dans le diff depuis
  le SHA de départ avant toute modification ;
- validations historique et session : `npm run typecheck` et
  `npm run check:boundaries` réussis ; 7 fichiers et 76 tests ciblés réussis
  pour l'historique de sélection, les contrats contrôleur, le comportement
  critique, l'audio, l'autosave, le clone et le repository. Le contrôle de
  frontières ne signale plus de dépendance `editor → application` ou
  `editor → use-cases` ; seul le cycle spatial prévu reste accepté avant la
  sous-étape suivante.
- sous-étape cycle spatial et garde-fous : `SpatialTouchEnvelope` est extrait
  dans `src/editor/geometry/spatial-touch-envelope.ts`, de sorte que
  `spatial-index-search.ts` n'importe plus `spatial-index.ts`; l'exception
  `ACCEPTED_PRODUCT_CYCLES` est vide et la matrice interdit désormais tout
  import produit de `editor` vers `use-cases` ; un test architectural dédié
  prouve ce refus ;
- fichiers de rollback cycle et garde-fous : les trois modules
  `src/editor/geometry/spatial-*`, `scripts/check-import-boundaries.mjs` et
  `tests/integration/import-boundaries.test.ts`, à comparer au SHA de départ
  avant un retour ciblé ;
- validations cycle et garde-fous : `npm run typecheck` et
  `npm run check:boundaries` réussis sans cycle accepté ; 3 fichiers et 17 tests
  ciblés réussis pour les frontières, les contrats du contrôleur et les gestes
  du piano roll ;
- documentation courante synchronisée : README racine,
  `docs/architecture.md`, `docs/code-map.md`, `docs/state-ownership.md`,
  `docs/app-composition.md`, le guide de contribution et les README locaux de
  l'éditeur et des cas d'usage décrivent les propriétaires réellement présents ;
  les liens factuels de `STATE-HISTORY-INVENTORY.md` pointent vers les nouveaux
  propriétaires ;
- validations documentaires : `npm run check:docs` et
  `npm run check:structure` réussis — 33 fichiers Markdown et 321 fichiers
  source.
- recherches de sortie : aucune occurrence des anciens chemins du store, du
  service de commandes, du runtime ou de la projection du workspace dans le
  code, les tests ou la documentation courante ; aucun import produit de
  `editor` vers `application` ou `use-cases` ; aucun cycle accepté ; la
  recherche des noms génériques ne retrouve que les deux fichiers préexistants
  de `src/ui/shared`, réservés au lot 6 ;
- contrôle du périmètre : `PianoRollWorkspace.tsx` conserve ses 1 427 lignes et
  ne reçoit que deux mises à jour d'import ; aucun jalon du lot 5 n'est commencé ;
- validation complète finale : `npm run verify` réussi — 33 fichiers Markdown,
  321 fichiers source, frontières vertes sur 269 fichiers produit et 66 modules
  de test sans cycle accepté, typecheck et build Vite réussis, smoke
  AudioWorklet réussi, 62 fichiers de test et 405 tests réussis ;
  l'avertissement de chunk supérieur à 500 kB reste inchangé et non bloquant ;
- statut du lot : `TERMINÉ`. La condition de sortie est satisfaite au stade
  transitoire autorisé : l'agrégat et les orchestrations de session sont sous
  `application`, les mécanismes purs restent sous `editor`, `editor` ne dépend
  plus des cas d'usage, et aucun cycle d'import ne subsiste. Les imports
  transitoires d'`editor` vers `config` et `music` restent réservés à la
  redistribution du lot 6, sans anticiper ce lot ;
- point de rollback final : SHA de départ
  `cd77003d234b2d7ff807c0a89f94acd3b9f88aa6`, aucun commit dédié et aucun patch
  créé. Le périmètre exact compte 73 fichiers, journal inclus, listés ci-dessous.
  Avant tout retour, vérifier chacun contre les changements utilisateur puis
  préparer un plan ciblé à partir du diff ;
- prochaine action exacte : après revue du lot 4, ouvrir le lot 5 en vérifiant
  sa condition d'entrée, puis exécuter uniquement son jalon 1. Ne pas commencer
  le jalon 2 avant validation séparée du premier.

```text
README.md
docs/app-composition.md
docs/architecture.md
docs/code-map.md
docs/guides/contributing.md
docs/migration/STATE-HISTORY-INVENTORY.md
docs/migration/STATUS.md
docs/state-ownership.md
scripts/check-import-boundaries.mjs
src/app/App.tsx
src/app/create-app-runtime.ts
src/application/editor-session/editor-runtime.ts
src/application/editor-session/workspace-persistence.ts
src/application/history/editor-command-service.ts
src/application/history/project-store.ts
src/domain/clips/__tests__/concatenate-clips.test.ts
src/domain/clips/__tests__/split-clip.test.ts
src/domain/commands/__tests__/clip-group-commands.test.ts
src/domain/commands/__tests__/command-families.test.ts
src/domain/commands/__tests__/note-flags-commands.test.ts
src/domain/commands/__tests__/time-map-commands.test.ts
src/domain/project-store.ts
src/editor/README.md
src/editor/geometry/spatial-index-search.ts
src/editor/geometry/spatial-index.ts
src/editor/geometry/spatial-touch-envelope.ts
src/editor/runtime/editor-runtime.ts
src/editor/viewport/viewport-controller.ts
src/infrastructure/persistence/__tests__/persistence-codecs.test.ts
src/infrastructure/persistence/__tests__/project-repository-contract.test.ts
src/ui/inspector/clips/useClipDialogWorkflow.ts
src/ui/inspector/clips/useClipGroupConcatenation.ts
src/ui/inspector/clips/useClipGroupDuplication.ts
src/ui/inspector/clips/useClipSplitting.ts
src/ui/inspector/clips/useClipWorkflow.ts
src/ui/inspector/instruments/useInstrumentDialogWorkflow.ts
src/ui/inspector/instruments/useProjectInstrumentWorkflow.ts
src/ui/piano-roll/PianoRollLoopOverlay.tsx
src/ui/piano-roll/PianoRollTimeMapOverlay.tsx
src/ui/piano-roll/PianoRollTimeline.tsx
src/ui/piano-roll/PianoRollWorkspace.tsx
src/ui/piano-roll/interactions/begin-piano-roll-long-press-draw.ts
src/ui/piano-roll/interactions/dom-interaction-visual-controller.ts
src/ui/piano-roll/interactions/note-gesture-workflow-adapter.ts
src/ui/piano-roll/interactions/piano-roll-gesture-strategy.ts
src/ui/piano-roll/interactions/piano-roll-selection-controller.ts
src/ui/piano-roll/interactions/useNoteCollisionDialogWorkflow.ts
src/ui/piano-roll/interactions/usePianoRollEvents.ts
src/ui/piano-roll/piano-roll-runtime-port.ts
src/ui/piano-roll/rendering/canvas-layer.tsx
src/ui/piano-roll/usePianoRollClipboard.ts
src/ui/piano-roll/usePianoRollInstrumentTransfer.ts
src/ui/piano-roll/usePianoRollLoopGesture.ts
src/ui/piano-roll/usePianoRollProjectState.ts
src/ui/piano-roll/usePianoRollSelectionCommands.ts
src/ui/piano-roll/usePianoRollSelectionWorkflow.ts
src/ui/piano-roll/useTimeMapMarkerGesture.ts
src/ui/piano-roll/useTimeMapMarkerWorkflow.ts
src/ui/piano-roll/useViewportControls.ts
src/ui/project-files/useMidiFileWorkflow.ts
src/ui/project-files/useProjectAutosave.ts
src/ui/project-files/useProjectFileWorkflow.ts
src/ui/transport/useAudioPlayback.ts
src/ui/transport/useTransportWorkflow.ts
src/use-cases/README.md
src/use-cases/commands/editor-command-service.ts
src/use-cases/persistence/__tests__/clone-stored-project.test.ts
src/use-cases/persistence/__tests__/project-autosave.test.ts
src/use-cases/persistence/project-workspace.ts
src/use-cases/piano-roll/notes/note-gesture-workflow.ts
tests/integration/audio-domain-regression.test.mjs
tests/integration/critical-behavior.test.ts
tests/integration/import-boundaries.test.ts
```

### 2026-08-28 — Lot 3, démarrage

- objectif : placer les contrats de repository et de codec sous
  `src/application/ports`, regrouper les implémentations de stockage sous
  `src/infrastructure/persistence`, puis réinitialiser explicitement et tester
  les données IndexedDB antérieures à la nouvelle baseline locale, sans
  modifier les contrats applicatifs ;
- condition d'entrée vérifiée : `STATUS.md` marque le lot 2 `TERMINÉ`, son
  journal consigne une validation complète verte, et `npm run verify` a été
  réexécuté avant toute modification du lot 3 avec succès (32 documents,
  265 fichiers produit, 65 modules de test, build et smoke AudioWorklet verts,
  61 fichiers de test et 402 tests réussis) ;
- SHA de départ et point de rollback initial :
  `cd4e8cdd9c90ec538bee6de76ab69d70baabdcbf`, commit du lot 2
  `cd4e8cd` ;
- état initial du worktree vérifié par `git status --short` : propre ; aucun
  changement préexistant de l'utilisateur à isoler au démarrage du lot 3 ;
- audit préalable : les ports `ProjectRepository`, `StoredProjectCodec` et
  `UserSettingsRepository` sont mêlés aux modèles/codecs sous
  `src/persistence`; les adaptateurs IndexedDB, Worker, scheduler et politique
  navigateur sont sous `src/pwa/persistence`; les repositories mémoire
  implémentent les mêmes contrats et servent aux tests de contrat ;
- décision sur les adaptateurs mémoire : ils restent des adaptateurs de
  référence et de test, donc appartiennent à
  `src/infrastructure/persistence/memory`, pas à l'application ;
- périmètre et fichiers prévus : création de `src/application/ports`,
  redistribution de `src/persistence`, `src/project-io/local` et
  `src/pwa/persistence` sous `src/infrastructure/persistence`, mise à jour des
  imports, des garde-fous architecturaux, des tests colocalisés et de la
  documentation courante directement affectée ;
- stratégie de sous-étapes : (1) extraire les ports et modèles de contrat,
  déplacer les codecs et adaptateurs mémoire ; (2) déplacer IndexedDB, Worker
  et politiques navigateur ; (3) définir la baseline IndexedDB et tester la
  réinitialisation ; chaque sous-étape reçoit `npm run typecheck`,
  `npm run check:boundaries`, ses tests ciblés et un patch de rollback hors du
  worktree avant la suivante ;
- aucune action du lot 4 (runtime, signaux, dépendance `editor → use-cases` ou
  cycle spatial) n'entre dans ce périmètre.
- sous-étape ports et mémoire : `ProjectRepository`, `StoredProjectCodec` et
  `UserSettingsRepository`, avec les modèles nécessaires à leurs signatures,
  sont déclarés sous `src/application/ports`; les codecs locaux et les deux
  repositories mémoire sont sous `src/infrastructure/persistence`. Les
  adaptateurs mémoire restent les doubles de référence des tests de contrat et
  ne deviennent pas des services applicatifs ;
- validations ports et mémoire : `npm run typecheck` et
  `npm run check:boundaries` réussis ; 4 fichiers et 26 tests ciblés réussis
  pour les codecs, les contrats de repositories, les réglages utilisateur et
  l'autosave ;
- rollback ports et mémoire : patch ciblé
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot3-ports-memory.patch`,
  SHA-256
  `FCE2AF4299C886A3C769845C7ADD0BF852319CF3C31090BF5426C1136DB8CE55`,
  contenant les 38 fichiers de code, tests et garde-fous de cette sous-étape,
  hors journal ; commande verte associée : la séquence de validation ci-dessus.
- sous-étape adaptateurs navigateur : IndexedDB, le codec Worker, le Worker de
  persistance, la politique de quota/persistance et le scheduler navigateur
  sont regroupés sous `src/infrastructure/persistence`; le contrat
  `AutosaveScheduler`, révélé par le déplacement, est désormais un port
  applicatif et l'infrastructure n'importe plus `use-cases` ;
- validations adaptateurs navigateur : `npm run typecheck`,
  `npm run check:boundaries` et `npm run build` réussis, y compris la production
  du chunk Worker ; 3 fichiers et 18 tests ciblés réussis pour IndexedDB,
  réglages utilisateur et autosave ;
- rollback adaptateurs navigateur : patch ciblé
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot3-browser-adapters.patch`,
  SHA-256
  `72DC8827154A48BD001EB2E45961341475B922AB2D4C98B7C041FEDB666B1AE2`,
  contenant uniquement les 15 fichiers de cette sous-étape ; commande verte
  associée : la séquence de validation ci-dessus.
- sous-étape baseline locale : le format de snapshot local repart de la
  baseline 1 (`app.pianola.stored-project.v1`), les réglages utilisent le format
  `app.pianola.user-settings.v1`, et IndexedDB passe à la version de layout 2 ;
  toute base plus ancienne est recréée pendant l'upgrade, tandis qu'une base de
  version plus récente et incompatible est supprimée puis recréée. La raison
  de réinitialisation est observable par `PianolaIndexedDb.resetReason` ;
- compatibilité locale : les fallbacks de catalogues antérieurs ont été
  supprimés ; des réglages incompatibles sont conservés en diagnostic puis
  remplacés par les valeurs par défaut. Aucun lecteur ou convertisseur de
  snapshot local antérieur n'est ajouté ;
- validations baseline locale : `npm run typecheck` et
  `npm run check:boundaries` réussis ; 4 fichiers et 26 tests ciblés réussis,
  dont deux nouveaux scénarios qui prouvent la purge d'une base IndexedDB plus
  ancienne et d'une base plus récente ;
- rollback baseline locale : patch ciblé
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot3-local-reset.patch`,
  SHA-256
  `CD15ABC1BB3101057AC8DE88C2A471169EC7151933BBFD444A1E18ABF07F1150`,
  contenant uniquement les 11 fichiers de cette sous-étape ; commande verte
  associée : la séquence de validation ci-dessus.
- documentation courante synchronisée : README racine,
  `docs/architecture.md`, `docs/code-map.md`, `docs/state-ownership.md`, les
  guides de développement et de fichiers projet, ainsi que les README locaux
  de l'UI, des cas d'usage et du MIDI décrivent les propriétaires réellement
  présents ; `src/infrastructure/persistence/README.md` documente les
  adaptateurs et la politique de reset ;
- validations documentaires : `npm run check:docs` et
  `npm run check:structure` réussis (33 fichiers Markdown et 319 fichiers
  source) ;
- rollback documentation courante : patch ciblé
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot3-current-docs.patch`,
  SHA-256
  `1ACD25F43E40A89C7F287270342A7BBFE3B0E4BBB3C9B36E1BD12572771655E8`,
  contenant uniquement les 10 documents courants affectés.
- revue de propriété finale : `ProjectPersistenceError` reste un détail des
  codecs et adaptateurs sous `infrastructure/persistence/codecs`, conformément
  au mapping ; les ports applicatifs n'exposent que leurs contrats et modèles
  d'échange. L'ancienne racine produit `src/persistence` a été retirée de la
  matrice de frontières afin d'empêcher sa réintroduction ;
- validations de cette revue : `npm run typecheck`,
  `npm run check:boundaries` et 28 tests ciblés réussis ; aucune dépendance
  produit de `application` ou `use-cases` vers IndexedDB, Worker ou
  `infrastructure` ;
- rollback revue de propriété : patch ciblé
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot3-ownership-cleanup.patch`,
  SHA-256
  `4209C9921F6C12B1D638A8D4AF2E4A3A38ECCB606C304470A0DE1F4FD778F4FF`,
  contenant uniquement les 16 fichiers de cette revue.
- recherches de sortie : aucune occurrence des anciens chemins produit
  `src/persistence`, `src/pwa/persistence` ou `src/project-io/local` hors du
  journal de migration ; aucune dépendance produit de `application` ou
  `use-cases` vers `infrastructure`, IndexedDB, Worker ou une API navigateur ;
  les seules zones génériques relevées sont les deux fichiers préexistants de
  `src/ui/shared`, dont la suppression reste planifiée au lot 6 ;
- validation complète finale : `npm run verify` réussi — 33 fichiers Markdown,
  320 fichiers source, frontières vertes sur 268 fichiers produit et 66 modules
  de test, typecheck et build Vite réussis, smoke AudioWorklet réussi,
  62 fichiers de test et 404 tests réussis ; l'avertissement de chunk supérieur
  à 500 kB reste inchangé et non bloquant ;
- statut du lot : `TERMINÉ`. La condition de sortie est satisfaite : les cas
  d'usage dépendent des ports applicatifs, les implémentations IndexedDB et
  Worker sont en infrastructure, les repositories mémoire ont un statut
  explicite d'adaptateurs de référence, et la réinitialisation des versions
  locales incompatibles est testée ;
- point de rollback final : SHA de départ
  `cd4e8cdd9c90ec538bee6de76ab69d70baabdcbf` et patch complet code/tests/docs
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot3-complete.patch`, SHA-256
  `2BA13685E7AEBEFBBBF95ABA6D15C634A72A20B3F4D2AE58DF55AB0FE792E177`,
  contenant les 53 fichiers du lot hors ce journal mutable ; appliquer son
  inverse uniquement après vérification qu'aucun de ces fichiers n'a reçu de
  changement utilisateur ;
- prochaine action exacte : après revue du lot 3, ouvrir le lot 4 et vérifier sa
  condition d'entrée avant de séparer les ports/signaux du runtime et de traiter
  le cycle spatial. Aucun travail du lot 4 n'est commencé dans ce worktree.

### 2026-08-27 — Lot 2, démarrage

- objectif : créer le format `.pianola` sous `infrastructure/project-files/pianola`, extraire les parseurs réutilisables, et supprimer toute trace de `native` et `legacy` en repartant de la version 1.
- condition d'entrée vérifiée dans ce journal : le lot 1 est `TERMINÉ` et la validation complète est au vert.
- SHA de départ et point de rollback initial :
  `0f0afca953190aa91ee30eed66ef62c991bf25bf`, commit du lot 1
  `0f0afca` ;
- état initial du worktree vérifié par `git status --short` : propre ; aucun changement utilisateur.
- périmètre et fichiers prévus : `src/infrastructure/project-files/pianola/`, `src/project-io/native`, `src/project-io/portable`, `src/config/native-file-config.ts` (vers `pianola-file-config.ts`) et la mise à jour des consommateurs pour remplacer les noms `NATIVE_*`.
- validation complète finale : `npm run verify` réussi — 61 fichiers de test et 402 tests réussis ;
- statut du lot : `TERMINÉ`. La condition de sortie est satisfaite : le format `.pianola` (version 1) est centralisé, les anciens formats ont été supprimés, et tous les tests passent avec le nouveau codec.
- point de rollback final : SHA de départ `0f0afca953190aa91ee30eed66ef62c991bf25bf` et patch complet `C:\Users\Bebou\AppData\Local\Temp\pianola-lot2-complete.patch` (SHA-256 `5A940C151B7CFBF1A3D7F2634178E7CA64F63050E5F7C82D8845D4E5D651E736`) ;
- prochaine action exacte : après revue du lot 2, ouvrir le lot 3 en vérifiant de nouveau sa condition d'entrée. Aucun travail du lot 3 n'est commencé dans ce worktree.

### 2026-08-27 — Lot 1, démarrage

- objectif : donner un sens unique aux états de document/session et de
  workspace persisté, puis remplacer le type générique `Track` par
  `InstrumentTrack`, sans modifier la persistance, Undo/Redo ni le comportement
  produit ;
- condition d'entrée vérifiée dans ce journal : le lot 0 est `TERMINÉ`, ses
  baselines structurelle, de couverture et de rendu sont connues, et
  `npm run verify` a été réexécuté avec succès juste avant son commit dédié
  (63 fichiers de test et 421 tests réussis) ;
- premier lot sélectionnable : le lot 1 est le premier et seul lot `À FAIRE`
  avant cette mise en route ; aucun travail du lot 2 n'est anticipé ;
- SHA de départ et point de rollback initial :
  `5fe7ddccb3545106b5c8e53b25f4bc7c132735eb`, commit du lot 0
  `5fe7ddc` ;
- état initial du worktree vérifié par `git status --short` : propre ; aucun
  changement préexistant de l'utilisateur à isoler au démarrage du lot 1 ;
- audit préalable : définitions dans `project-document.ts`,
  `project-persistence-model.ts` et `clip.ts` ; consommateurs recensés par
  `rg` dans le store, les commandes, les codecs local/portable/native/MIDI,
  les cas d'usage, la présentation et les supports de tests ; tests ciblés de
  persistance, historique/commandes, MIDI et régression traversante identifiés ;
- périmètre et fichiers prévus : renommage en place des trois modules de types
  ci-dessus, puis mise à jour de leurs consommateurs sous `src/domain`,
  `src/persistence`, `src/project-io`, `src/use-cases`, `src/editor`, `src/app`,
  `src/audio`, `src/ui` et `tests`, ainsi que la documentation produit qui nomme
  ces propriétaires (`README.md`, `docs/state-ownership.md`,
  `docs/code-map.md`, `docs/guides/project-files.md` et guides locaux affectés) ;
- stratégie de sous-étapes : types et codecs, application, présentation/tests,
  puis suppression des alias après recherche d'anciens symboles ; chaque
  sous-étape recevra une validation rapide et un patch ciblé hors du worktree
  avant de commencer la suivante.
- sous-étape types et codecs : `EditorSessionState`, `ActiveClipSelection`,
  `PersistedEditorWorkspace`, `PersistedClipEditorState` et `InstrumentTrack`
  sont définis chez les propriétaires courants ; le domaine, les commandes et
  les codecs local, portable, natif et MIDI emploient les nouveaux noms ; la
  structure JSON, les versions et les champs sérialisés restent inchangés ;
- validations types et codecs : `npm run typecheck` et
  `npm run check:boundaries` réussis ; 8 fichiers et 68 tests ciblés réussis
  pour les commandes, la persistance, le parseur natif et le MIDI ;
- rollback types et codecs : patch ciblé
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot1-types-codecs.patch`,
  SHA-256
  `1BF5C4C8370C7AA72A5A4403AB8B6F3DC5D3153C3359D02AAF7139C5701D5D91`,
  contenant uniquement les 23 fichiers modifiés sous `src/domain`,
  `src/persistence` et `src/project-io` ; commande verte associée : la séquence
  de validation ci-dessus.
- sous-étape application : services de commandes, sélection pure, workflows de
  notes/timeline, autosave, création/import de projet et composition utilisent
  `EditorSessionState` et `PersistedEditorWorkspace` ; les fabriques et
  projections exposent désormais des noms explicites tels que
  `createEditorSessionState`, `capturePersistedEditorWorkspace` et
  `restorePersistedEditorWorkspace` ; aucun champ sérialisé n'est renommé ;
- validations application : `npm run typecheck` et
  `npm run check:boundaries` réussis ; 5 fichiers et 13 tests ciblés réussis
  pour autosave, création de session, historique de sélection et comportement
  critique ;
- rollback application : patch ciblé
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot1-application.patch`,
  SHA-256
  `2203020D4949E0D436BB9E30ADBD1C8FC7297BD54F8F71FD14CDDDE1C4EC6AD8`,
  contenant les 20 fichiers de l'application et leurs consommateurs directs
  nécessaires à cette sous-étape ; commande verte associée : la séquence de
  validation ci-dessus.
- sous-étape présentation et tests : les props, workflows UI, fixtures et
  scénarios traversants utilisent les nouveaux types ; les helpers de
  validation et de commandes nomment explicitement les pistes d'instrument ;
  tous les alias temporaires ont ensuite été supprimés ;
- garde-fou ajouté : `npm run check:structure` refuse désormais les
  identifiants TypeScript `ProjectState`, `WorkspaceState`,
  `ProjectWorkspaceState`, `ProjectClipWorkspaceState` et `Track` dans le code
  produit, sans confondre ce dernier avec les chaînes du format MIDI ;
- documentation courante synchronisée : `README.md`, `docs/architecture.md`,
  `docs/code-map.md`, `docs/state-ownership.md` et
  `docs/guides/project-files.md` décrivent les propriétaires effectivement
  présents après le lot 1 ;
- validations présentation et suppression des alias : `npm run typecheck`,
  `npm run check:boundaries`, `npm run check:docs` et
  `npm run check:structure` réussis ; 12 fichiers et 85 tests ciblés réussis
  pour les commandes, codecs, timelines, MIDI et comportement critique ;
- recherches de sortie : aucun ancien identifiant d'état dans `src` ou
  `tests` ; les seules occurrences exactes de `Track` sont les libellés MIDI
  légitimes ; la recherche des noms génériques n'a révélé aucun nouveau dossier
  ou module générique introduit par le lot ;
- validation complète finale : `npm run verify` réussi — 32 fichiers Markdown,
  324 fichiers source, frontières vertes sur 271 fichiers produit et 67 modules
  de test, typecheck et build Vite réussis, smoke AudioWorklet réussi,
  63 fichiers de test et 421 tests réussis ; l'avertissement de chunk supérieur
  à 500 kB reste inchangé et non bloquant ;
- statut du lot : `TERMINÉ`. La condition de sortie est satisfaite : les quatre
  états ont chacun un sens documenté, `InstrumentTrack` remplace le type
  générique, et aucun consommateur produit ni alias ne conserve les anciens
  noms ;
- point de rollback final : SHA de départ
  `5fe7ddccb3545106b5c8e53b25f4bc7c132735eb` et patch complet
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot1-complete.patch`, contenant
  uniquement les 69 fichiers du lot 1 ; appliquer son inverse seulement après
  vérification qu'aucun de ces fichiers n'a reçu de changement utilisateur ;
- prochaine action exacte : après revue du lot 1, ouvrir le lot 2 en vérifiant
  de nouveau sa condition d'entrée puis créer le propriétaire du format
  `.pianola` et sa nouvelle baseline de version. Aucun travail du lot 2 n'est
  commencé dans ce worktree.

### 2026-08-27 — Lot 0, démarrage

- objectif : établir la baseline structurelle, la couverture ciblée et le
  scénario reproductible de rendu, puis rendre verts les contrôles
  architecturaux du code produit et des tests ;
- périmètre : scripts de contrôle architectural, configuration de validation,
  tests de garde-fou et documentation de la baseline ; aucun déplacement de
  couche, renommage conceptuel ou changement fonctionnel ;
- branche dédiée : `migration/lot-0-baseline` ;
- SHA de départ et point de rollback initial :
  `6a066ba6b31b6983a1e6db93b6c8cf95fe41b741` ;
- état initial du worktree vérifié par `git status --short` : propre ; les
  changements préexistants historiques consignés le 2026-08-26 ne sont plus
  présents dans le worktree au démarrage de ce lot ;
- fichiers prévus : `scripts/check-import-boundaries.mjs`, scripts ou tests
  architecturaux ciblés associés, `package.json`, `package-lock.json`, rapports
  et documentation de baseline sous `docs/`, ainsi que ce journal ; la liste
  exacte sera resserrée après l'audit initial ;
- rollback avant première sous-étape : revenir à la branche de départ `main`
  au SHA ci-dessus ; aucune modification utilisateur n'est à préserver dans le
  worktree initial.
- baseline initiale exécutée avant modification des garde-fous :
  `npm run verify` réussi (31 fichiers Markdown, 323 fichiers source,
  frontières actuelles vertes, typecheck et build Vite réussis, smoke test de
  l'AudioWorklet réussi, 63 fichiers de test et 418 tests Vitest réussis) ; seul
  avertissement non bloquant : chunk JavaScript principal supérieur à 500 kB.
- sous-étape garde-fous : les onze racines TypeScript actuelles possèdent une
  matrice d'imports explicite ; les 270 fichiers produit et 67 fichiers de test
  sont analysés séparément, les imports produit vers les tests sont interdits
  et les cycles des deux graphes sont détectés ;
- cycle produit accepté dans la baseline :
  `src/editor/geometry/spatial-index.ts` ↔
  `src/editor/geometry/spatial-index-search.ts`, suppression toujours prévue au
  lot 4 ; aucun autre cycle produit ou test détecté ;
- tests de garde-fou ajoutés : dépendance de couche interdite, cycle produit et
  cycle de tests séparé ; `npm test -- tests/integration/import-boundaries.test.ts`
  réussi (5 tests), `npm run check:boundaries` réussi et `npm run typecheck`
  réussi ;
- rollback garde-fous : patch ciblé
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot0-guardrails.patch`, SHA-256
  `7B90A982F1B469DA81B78F7B0170F6F2ADA3357EB44FCCF9B4BE630DFA4997DD`,
  contenant uniquement `scripts/check-import-boundaries.mjs` et
  `tests/integration/import-boundaries.test.ts` ; appliquer son inverse après
  vérification de ces deux fichiers pour revenir à la sous-étape précédente.
- sous-étape couverture : ajout de `@vitest/coverage-v8` 4.1.10 et de la
  commande `npm run test:coverage:hotspots`, ciblée sur les tests de commandes,
  de time map et la régression critique ; commande réussie (7 fichiers,
  73 tests) ;
- couverture V8 ciblée (lignes / branches) : `time-map.ts` 87,76 % / 80,48 %,
  `clip-commands.ts` 50 % / 47,91 %,
  `active-clip-command-helpers.ts` 39,83 % / 40,86 %,
  `PianoRollWorkspace.tsx` 0 % / 0 %, `ClipInspector.tsx` 0 % / 0 % et
  `InstrumentPresetDialog.tsx` 0 % / 0 % ; les trois composants React restent
  bloqués pour découpage jusqu'à ajout de tests de caractérisation ;
- écart d'outillage : une première exécution instrumentée de toute la suite a
  échoué sur 10 tests audio de performance ou timeout, l'instrumentation V8
  multipliant leur coût ; ces échecs ne reproduisent pas sans couverture. La
  commande ciblée exclut donc les benchmarks, tandis que `npm run verify`
  continue d'exécuter toute la suite sans instrumentation ;
- validations de la sous-étape couverture : commande ciblée ci-dessus,
  `npm run typecheck` et `npm run check:boundaries` réussis ; installation npm :
  0 vulnérabilité signalée ;
- rollback couverture : patch ciblé
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot0-coverage.patch`, SHA-256
  `03C62EF5BB7A3B2B729DFA376037B2C9565604D7B6CD02C10B5CBDD1DF25E089`,
  contenant uniquement `package.json`, `package-lock.json` et
  `vitest.config.ts`.
- inventaire depuis le commit préparatoire `92528dd` : aucun nouveau champ
  persistant ; les préférences, comportements projet et réglages de workspace
  restent possédés respectivement par `UserSettingsRepository`,
  `ProjectDocument`/`ProjectStore` et `ProjectWorkspaceState`/`EditorRuntime` ;
  deux capacités ajoutées sont confirmées chez leurs propriétaires : identité
  de note/relâchement des voix sous `audio/worklet`, et détection/orthographe
  d'accords sous `music` avec projections UI ;
- sous-étape rendu : ajout d'un profiler React opt-in activé uniquement par
  `renderBaseline=1` et du scénario reproductible
  `node scripts/measure-render-baseline.mjs` ; trois projets vierges avec
  stockage réinitialisé ont exécuté lecture, viewport, survol et preview de
  geste sous Edge headless 151 ;
- mesures de rendu : `PianoRollWorkspace` 13 commits sur chacun des trois
  passages ; `EditorHeader`, `PianoRollLayers`, `PianoRollViewportControls` et
  `ProjectInspector` 12 commits chacun ; longues tâches 5/3/2 (médiane 3) ;
  notifications de sélecteur inchangé 0/0/0, aucun sélecteur externe n'existant
  encore ; résultats et protocole complets dans `LOT-0-BASELINES.md` ;
- validations de la sous-étape rendu : scénario navigateur réussi sur trois
  passages, `npm run typecheck` et `npm run check:boundaries` réussis ; deux
  essais préalables du script ont révélé puis corrigé l'ordre d'initialisation
  CDP et l'attente du bouton de création activé ; aucun processus ou profil
  temporaire ne subsiste ;
- rollback rendu : patch ciblé
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot0-render-baseline.patch`,
  SHA-256
  `CC7153B8CCCC05264671ABBBC110A3529787B8C5A288031945D84574E8DA5135`,
  contenant uniquement `scripts/measure-render-baseline.mjs`,
  `src/ui/diagnostics/RenderBaselineProfiler.tsx`, `src/app/App.tsx` et
  `src/ui/piano-roll/PianoRollWorkspace.tsx` ;
- documentation courante affectée synchronisée : README racine,
  `docs/architecture.md` et `docs/guides/development.md`. La preuve complète du
  lot est consignée dans `docs/migration/LOT-0-BASELINES.md`.
- validation complète finale : `npm run verify` réussi — 32 fichiers Markdown,
  324 fichiers source, frontières vertes sur 271 fichiers produit et 67 modules
  de test, typecheck et build Vite réussis, smoke AudioWorklet réussi,
  63 fichiers de test et 421 tests réussis ; avertissement de chunk inchangé ;
- statut du lot : `TERMINÉ`. La condition de sortie est satisfaite : baseline
  structurelle, couverture ciblée et baseline de rendu connues, contrôles
  architecturaux verts ;
- point de rollback final : SHA de départ
  `6a066ba6b31b6983a1e6db93b6c8cf95fe41b741` et patch complet
  `C:\Users\Bebou\AppData\Local\Temp\pianola-lot0-complete.patch`. Il contient
  uniquement les 15 fichiers du lot : `README.md`, `docs/architecture.md`,
  `docs/guides/development.md`, les trois documents modifiés ou créés sous
  `docs/migration/`, `package.json`, `package-lock.json`, les deux scripts,
  `src/app/App.tsx`, le profiler de diagnostics, `PianoRollWorkspace.tsx`, le
  test de frontières et `vitest.config.ts` ; appliquer son inverse uniquement
  après vérification qu'aucun de ces fichiers n'a reçu de changement utilisateur ;
- prochaine action exacte : après revue et commit dédié du lot 0 sur
  `migration/lot-0-baseline`, ouvrir le lot 1 en revérifiant sa condition
  d'entrée, puis introduire d'abord les quatre types d'état sans modifier leur
  sémantique de persistance ou d'Undo/Redo.

### 2026-08-26 — Préparation

- création du dossier d'exécution autonome ;
