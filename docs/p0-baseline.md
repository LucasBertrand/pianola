# P0 — garde-fous et baseline

Ce document clôt le périmètre P0 de la [feuille de route](roadmap.md). Il
constitue le témoin avant les migrations structurelles P1 à P3. Les valeurs de
performance sont descriptives : elles servent à comparer deux révisions sur le
même environnement, pas à définir seules des seuils produit.

Date de référence : 13 août 2026.

## Fiche du changement

| Élément | Valeur |
| --- | --- |
| Résultat observable | les tests sont isolables, les frontières échouent avec un diagnostic actionnable et les parcours critiques ont un témoin stable |
| Propriétaires | `domain` pour l’état musical, `audio` pour le plan de lecture, `app` pour la composition, `tests` et `scripts` pour les garde-fous |
| Frontières touchées | scripts npm, CI via `npm run verify`, tests de géométrie et d’intégration, noms du runtime et du port piano-roll |
| Hors périmètre | P1 et suivants, refonte du format natif v1, compatibilité des anciennes sauvegardes, automatisation navigateur exhaustive et budgets de performance |
| Critère de sortie | P0.1 à P0.4 satisfaits et `npm run verify` vert |
| Prochain chantier débloqué | P1.1, déplacement des contrats d’éditeur persistés hors de `ui/rendering` |

## Baseline fonctionnelle

Les 71 scénarios historiques ont été transférés dans deux suites Vitest. Les 10
nouveaux scénarios portent le total à 81, tous exécutables avec le même runner.
Un test peut être
lancé par fichier ou par nom, par exemple :

```bash
npm run test:vitest -- tests/integration/critical-behavior.test.ts
npx vitest run -t "launches playback"
```

Les builders, fixtures MIDI et doubles audio partagés vivent dans
`tests/support`. Les suites de régression et les nouveaux tests consomment les
mêmes fabriques de projet, note, état d’éditeur, fixture MIDI, moteur audio et
timer. Les quatre témoins critiques de
`tests/integration/critical-behavior.test.ts` fixent :

| Parcours | Résultat attendu |
| --- | --- |
| dessiner puis déplacer une note | deux transactions, note finale à 360 ticks et révision 2 |
| résoudre une collision | fusion déterministe de 0 à 180 ticks et sélection de la note proposée |
| lancer la lecture | plan audio ordonné aux hauteurs 60 puis 67, avec temps de début et de fin fixés |
| changer de clip | playhead restauré par clip et navigation absente de l’historique Undo |

Le corpus ne charge aucune sauvegarde antérieure. La bibliothèque ajoutée,
Vitest, est une dépendance de développement uniquement.

## Frontières automatisées

`npm run check:boundaries` inspecte les imports statiques, les réexports et les
imports dynamiques TypeScript/TSX. Il protège les règles P0 suivantes :

- `domain`, `music` et `geometry` ne dépendent ni de `app`, ni de `ui`, ni de
  React ou d’une API navigateur globale ;
- `application` et le futur `use-cases` ne dépendent ni de `app`, ni de `ui` ;
- `audio`, `midi`, `persistence` et leurs cibles futures ne dépendent pas de la
  composition `app` ou de composants React.

Le contrôle fait partie de `npm run verify`, donc de la CI existante. Le test
`tests/integration/import-boundaries.test.ts` injecte volontairement un import
`domain → ui` puis un accès à `document` depuis `music`. Il vérifie le code de
sortie 1 et le message contenant le fichier, la ligne, la dépendance et la règle
violée.

## Baseline reproductible

Commande de capture complète :

```bash
npm run baseline:capture
```

Elle construit la version de production, mesure un projet natif généré de
20 000 notes, remplit les 200 entrées d’historique, relève les bundles, démarre
la preview et pilote le piano-roll dans le navigateur de référence. Sous un
autre système, le navigateur Chromium peut être fourni avec
`PIANOLA_BASELINE_BROWSER`.

### Environnement de référence

| Champ | Valeur |
| --- | --- |
| Système | Windows 10.0.19045 x64 |
| Processeur | Intel Core i5-2500K à 3,30 GHz, 4 cœurs logiques |
| Mémoire | 8 532 115 456 octets |
| Node.js | v22.16.0 |
| Navigateur mesuré | Microsoft Edge 151.0.4129.78, headless |
| Viewport | 1 440 × 900 CSS pixels, DPR 1 |

### Mesures capturées

| Mesure | Scène | Résultat |
| --- | --- | --- |
| bundle JavaScript | build de production | 508 186 octets, 144 633 octets gzip |
| bundle CSS | build de production | 42 558 octets, 7 497 octets gzip |
| ouverture du format natif | 20 000 notes, JSON de 6 378 092 octets, médiane de 7 passes | 98,824 ms ; maximum 112,372 ms |
| mémoire retenue par l’historique | même projet, 200 renommages, GC explicite | 57 864 octets ; Undo disponible |
| temps de frame pan/zoom | projet de démonstration, pinch synthétique sur 59 frames | médiane 16,7 ms ; p95 16,9 ms ; maximum 17 ms |
| feedback d’un geste | projet de démonstration, événement pointeur synthétique jusqu’à la frame suivante | 10,7 ms |

Capture Node : `2026-08-13T07:51:17.966Z`. Capture navigateur :
`2026-08-13T07:51:21.909Z`.

Le mode headless et les événements synthétiques rendent la mesure déterministe,
mais ne représentent pas la latence matérielle d’un écran tactile. P4 devra
compléter ce témoin par les parcours navigateur réels, l’accessibilité et des
budgets suivis. Une extraction P1 à P3 est néanmoins comparable dès maintenant
sur le même matériel avec la commande ci-dessus.

## Conventions fixées en P0

- le service long terme d’`App.tsx` est nommé `runtime`, plus `scene` ;
- `PianoRollControllerPort` remplace le nom trompeur
  `PianoRollEventController` ;
- les variables modifiées distinguent `projectInstrument`, `instrumentConfig`
  et `clipInstrumentState` ;
- `voice` reste réservé au moteur audio ;
- les nouvelles valeurs physiques conservent leur suffixe d’unité.

Ces renommages ne modifient aucune clé persistée. La définition du nouveau
format natif v1 reste un chantier ultérieur de la roadmap.

## État de sortie

- P0.1 : le mini-runner a été supprimé ; exécution Vitest par fichier et par nom
  validée ; fixtures partagées ; 81 scénarios exécutés.
- P0.2 : contrôle de frontières branché sur `verify` et violation volontaire
  couverte.
- P0.3 : conventions ciblées appliquées sans modifier le comportement ni le
  format natif.
- P0.4 : builders, résultats observables et baseline matériel/navigateur
  reproductible enregistrés.

P0 est terminé lorsque la révision conserve `npm run verify` vert. Aucun travail
P1 n’est inclus dans cette branche.
