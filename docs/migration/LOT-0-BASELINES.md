# Baselines du lot 0

Ce document conserve les preuves reproductibles établies par le lot 0. Il
décrit le code courant au SHA de départ
`6a066ba6b31b6983a1e6db93b6c8cf95fe41b741` et les garde-fous ajoutés sur la
branche `migration/lot-0-baseline`.

## Baseline structurelle

La validation initiale `npm run verify` était verte avant modification :
31 fichiers Markdown, 323 fichiers TypeScript/TSX sous `src`, 63 fichiers de
test Vitest et 418 tests. Le build et le smoke test AudioWorklet passaient. Le
seul avertissement était le chunk JavaScript principal supérieur à 500 kB.

Le contrôle de frontières distingue désormais le graphe produit du graphe de
tests. Après ajout du profiler opt-in du présent lot, il analyse 271 fichiers
produit et 67 modules de test, y compris les tests d'intégration `.mjs`.

Chaque racine TypeScript courante possède une liste fermée de dépendances. Les
imports internes à une racine restent autorisés et `src/main.tsx` demeure le
point de composition.

| Source actuelle | Autres racines autorisées |
| --- | --- |
| `app` | toutes, pour la composition |
| `audio` | `config`, `domain` |
| `config` | aucune |
| `domain` | `config`, `music` |
| `editor` | `config`, `domain`, `music`, `use-cases` |
| `music` | `config`, `domain`, `use-cases` |
| `persistence` | `config`, `domain`, `editor`, `music` |
| `project-io` | `config`, `domain`, `editor`, `music`, `persistence` |
| `pwa` | `persistence`, `project-io`, `use-cases` |
| `ui` | toutes sauf `app` |
| `use-cases` | `config`, `domain`, `editor`, `music`, `persistence`, `project-io` |

Un fichier produit ne peut pas importer un test. Les cycles produit et tests
sont calculés séparément. Un seul cycle produit est accepté nominativement :

```text
src/editor/geometry/spatial-index.ts
  ↔ src/editor/geometry/spatial-index-search.ts
```

Il était connu avant le lot et reste à supprimer au lot 4. Tout autre cycle
fait échouer `npm run check:boundaries`.

## Couverture ciblée

Commande reproductible :

```powershell
npm run test:coverage:hotspots
```

Elle exécute 73 tests ciblés dans 7 fichiers avec le fournisseur V8 4.1.10. Le
rapport JSON généré localement est
`coverage/hotspots/coverage-summary.json` ; `coverage/` reste ignoré par Git.

| Point de concentration | Lignes | Branches | Fonctions |
| --- | ---: | ---: | ---: |
| `domain/transport/time-map.ts` | 87,76 % | 80,48 % | 91,25 % |
| `domain/commands/clip-commands.ts` | 50,00 % | 47,91 % | 64,70 % |
| `domain/commands/active-clip-command-helpers.ts` | 39,83 % | 40,86 % | 92,30 % |
| `ui/piano-roll/PianoRollWorkspace.tsx` | 0 % | 0 % | 0 % |
| `ui/inspector/clips/ClipInspector.tsx` | 0 % | 0 % | 0 % |
| `ui/dialogs/InstrumentPresetDialog.tsx` | 0 % | 0 % | 0 % |

Matrice de comportements :

| Module | Couvert actuellement | Lacunes à caractériser avant découpage |
| --- | --- | --- |
| `time-map.ts` | mesures et groupes de temps, conversions tick/seconde, snapping, normalisation et mutations de marqueurs, insertion/suppression de temps | branches défensives de tableaux incohérents et marqueur demandé absent |
| `clip-commands.ts` | familles principales, groupes imbriqués, déplacement, duplication, suppression et Undo/Redo | variantes et rejets de concaténation/découpe, validations de payload et branches rares de réécriture de hiérarchie |
| `active-clip-command-helpers.ts` | déplacement des bornes de boucle lors d'insertion/suppression et chemins appelés par les commandes ciblées | transformations complètes des pistes/notes, trimming, bornage de note et branches de repli du transport |
| `PianoRollWorkspace.tsx` | comportements métier voisins testés hors React seulement | les six jalons du lot 5 : préférences, cycle de vie projet, menu radial, dialogues, layout/portals, transport/viewport |
| `ClipInspector.tsx` | modèles purs voisins : playback de groupe, réordonnancement et indicateur de playhead | rendu des cartes/groupes, portals de toolbar, activation et callbacks de workflows |
| `InstrumentPresetDialog.tsx` | invariants métier des presets personnels hors composant | brouillon de formulaire, validation, preview/cancel/confirm et édition des effets/règles dans le dialogue |

Les trois composants React sont donc explicitement bloqués pour découpage tant
que leurs tests de caractérisation ne sont pas ajoutés. Les deux modules de
commandes exigent également des témoins sur les lacunes ci-dessus avant leur
découpage du lot 6.

Une exécution instrumentée de toute la suite n'est pas valide pour mesurer ces
fichiers : l'instrumentation V8 ralentit les benchmarks DSP et a provoqué dix
échecs de seuil ou timeout. La commande ciblée évite cet effet ; `npm run verify`
continue d'exécuter toute la suite sans instrumentation.

## Réglages persistants et capacités récentes

Aucun champ persistant n'a été ajouté entre le commit préparatoire
`92528dd56388f737a59ead2910aa915f9fd67999` et le SHA de départ du lot 0.
L'inventaire courant est confirmé :

| Famille | Données persistantes | Propriétaire courant | Régressions clés |
| --- | --- | --- | --- |
| préférences utilisateur | mode de sélection, mode de couleur, préécoute du pitch, presets personnels et raccourcis | `UserSettingsRepository` | codec et repository de réglages, tests de presets |
| comportement du projet | auto-advance, auto-scroll, boucles de clips, bus master, instruments et contenu musical | `ProjectDocument` / `ProjectStore` | commandes, Undo/Redo, codecs et suite centrale |
| workspace projet | clip/instrument actifs, grille et snap tonal par clip | `ProjectWorkspaceState` et `EditorRuntime` | codecs de persistance et tests d'autosave |

Deux capacités produit ont été ajoutées depuis la préparation :

| Capacité | Propriétaire courant confirmé | Régressions clés |
| --- | --- | --- |
| identité des notes et relâchement déterministe des voix du worklet | `src/audio/worklet/` | transport AudioWorklet, timeline engine, déterminisme DSP et smoke du build produit |
| détection/orthographe d'accords selon le snap tonal, affichée dans l'en-tête | calcul sous `src/music/`, projection sous `src/ui/editor-toolbar/` et rendu des labels sous `src/ui/piano-roll/rendering/` | `chord-recognition.test.ts`, suite centrale, typecheck et build UI |

La seconde capacité lit les réglages de snap tonal déjà persistés ; elle n'a pas
créé une nouvelle source de vérité.

## Baseline de rendu du lot 5

Commande reproductible sous Windows :

```powershell
node scripts/measure-render-baseline.mjs
```

Le script utilise Edge au chemin standard. `PIANOLA_EDGE_PATH` permet de fournir
un autre binaire Edge compatible Chromium. Il démarre Vite sur le port 5173,
crée un profil navigateur temporaire, puis supprime ce profil et arrête les
processus à la fin.

Chaque exécution repart d'un stockage vide et crée le même projet vierge via
`createBlankProjectState`. La fenêtre headless est fixée à 1440 × 900. Après le
montage, les compteurs sont remis à zéro, puis le scénario effectue dans l'ordre :

1. lecture du transport pendant 900 ms ;
2. quatre déplacements et zooms horizontaux du viewport ;
3. six déplacements de survol dans la grille ;
4. appui de 550 ms, déplacement de preview et relâchement ;
5. pause et stabilisation avant capture.

Mesures du 27 août 2026 avec Node 22.16.0, Edge headless 151.0.0.0,
4 processeurs logiques exposés, viewport CSS 1416 × 808 et DPR 1 :

| Mesure | Exécution 1 | Exécution 2 | Exécution 3 | Médiane |
| --- | ---: | ---: | ---: | ---: |
| commits `PianoRollWorkspace` | 13 | 13 | 13 | 13 |
| commits `EditorHeader` | 12 | 12 | 12 | 12 |
| commits `PianoRollLayers` | 12 | 12 | 12 | 12 |
| commits `PianoRollViewportControls` | 12 | 12 | 12 | 12 |
| commits `ProjectInspector` | 12 | 12 | 12 | 12 |
| durée React du workspace (ms) | 489,9 | 460,4 | 449,3 | 460,4 |
| longues tâches | 5 | 3 | 2 | 3 |
| durée totale des longues tâches (ms) | 451 | 156 | 120 | 156 |
| plus longue tâche (ms) | 240 | 56 | 67 | 67 |
| notifications de sélecteur inchangé | 0 | 0 | 0 | 0 |

La première exécution inclut le coût à froid du navigateur et constitue
l'outlier attendu. Le lot 5 réexécutera exactement cette commande sur la même
machine et comparera les médianes de trois passages. Une hausse reproductible de
plus de 10 % des commits ou du nombre de longues tâches bloque sa sortie. La
valeur zéro des notifications signifie qu'aucun adaptateur sélecteur
`useSyncExternalStore` n'existe encore ; après leur introduction, elle doit
rester zéro pour une sélection inchangée.
