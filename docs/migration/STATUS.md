# État de la migration

Ce fichier est le journal mutable et le point de reprise. Il doit refléter le
workspace réel, pas seulement l'intention.

## État global

- Statut : EN ATTENTE
- Lot actif : Aucun
- Dernier lot terminé : 3 — Ports et adaptateurs de persistance
- Prochaine action : après revue du lot 3, ouvrir le lot 4 en vérifiant sa
  condition d'entrée ; ne pas déplacer le runtime ou corriger le cycle spatial
  avant cette ouverture
- Dernière mise à jour : 2026-08-28

## Baseline connue

- arborescence source actuelle : `app`, `application`, `audio`, `config`,
  `domain`, `editor`, `infrastructure`, `music`, `project-io`, `pwa`, `styles`,
  `ui`, `use-cases` ;
- un cycle d'import typé a été détecté entre `spatial-index.ts` et
  `spatial-index-search.ts` ;
- `PianoRollWorkspace.tsx` est le principal point de concentration ;
- `time-map.ts` et `clip-commands.ts` dépassent désormais 1 000 lignes ;
- le format `.pianola` est sous `infrastructure/project-files/pianola` et la
  persistance locale sous `infrastructure/persistence` ;
- les contrôles analysent séparément 268 fichiers produit et 66 modules de
  test ; tout nouveau cycle est interdit ;
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
| 4 | À FAIRE | Cœur d'édition |
| 5 | À FAIRE | `PianoRollWorkspace` |
| 6 | À FAIRE | Configurations et horizontales |
| 7 | À FAIRE | Renommage physique des couches |
| 8 | À FAIRE | Nettoyage final |

## Compatibilités temporaires

Aucun alias ni aucune compatibilité de code ou de données ne subsiste des lots
0 et 1. Les alias de renommage créés pendant les sous-étapes du lot 1 ont été
supprimés avant sa sortie. Le profiler opt-in `renderBaseline=1` est un
diagnostic conservé jusqu'à la comparaison du lot 5, pas une façade de
compatibilité. Le lot 3 n'ajoute aucun alias : les anciens chemins de
persistance ont été supprimés et les anciennes données locales sont
réinitialisées, pas converties.

## Écarts et découvertes

- l'instrumentation V8 fausse les seuils des benchmarks audio ; la couverture
  reste ciblée et la validation complète s'exécute sans instrumentation ;
- les trois composants React concentrés ont une couverture directe nulle et
  restent interdits de découpage avant leurs tests de caractérisation ;
- le cycle typé `spatial-index` reste accepté nominativement jusqu'au lot 4 ;
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
  et n'ont pas été déplacés par le lot 3.

## Journal

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
