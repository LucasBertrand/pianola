# Feuille de route

Chaque lot possède une condition d'entrée, des actions, une condition de sortie
et un point de rollback. Ne commencer qu'un lot à la fois.

Les dossiers cibles sont créés progressivement par les lots 1 à 6 dès que leur
propriétaire est établi. Le lot 7 ne diffère pas leur création : il déplace les
reliquats qui n'exigent plus de changement conceptuel et interdit les anciens
chemins.

## Lot 0 — Baseline et garde-fous

- enregistrer le résultat initial de `npm run verify` dans `STATUS.md` ;
- corriger les contrôles documentaires liés aux fichiers de migration si
  nécessaire ;
- étendre les frontières à toutes les couches actuelles ;
- ajouter une détection des cycles et séparer code produit et tests.
- mesurer la couverture ciblée des points de concentration de `BASELINE.md` ou
  produire une matrice de comportements couverts et manquants ;
- définir et enregistrer le scénario reproductible qui servira de baseline de
  rendu pour `PianoRollWorkspace` au lot 5.

Sortie : baseline structurelle, couverture ciblée et baseline de rendu connues,
et contrôles architecturaux verts.

## Lot 1 — Vocabulaire d'état

- introduire `EditorSessionState`, `ActiveClipSelection`,
  `PersistedEditorWorkspace` et `PersistedClipEditorState` ;
- renommer `Track` en `InstrumentTrack` par alias temporaire, puis migrer les
  commandes et codecs consommateurs ;
- migrer d'abord les types et codecs, puis application et présentation ;
- supprimer les alias seulement après absence vérifiée de consommateurs.

Sortie : chaque variante de `workspace` possède un sens unique documenté et
aucun consommateur produit n'utilise encore le nom générique `Track`.

## Lot 2 — Format `.pianola`

- créer le propriétaire `project-files/pianola` ;
- extraire le parseur de document partagé depuis `native/parsing` ;
- définir une nouvelle baseline de version pour le format `.pianola` ;
- supprimer les lecteurs, migrations et tests des anciens formats ;
- remplacer les noms `NATIVE_*` encore utilisés par le produit ;
- rejeter explicitement les fichiers d'une version non supportée.

Sortie : aucun dossier, import, symbole ou test courant ne dépend de `native`,
`legacy` ou d'une ancienne version du format. Le nouveau format effectue un
aller-retour complet et les versions antérieures sont rejetées explicitement.

## Lot 3 — Ports et adaptateurs de persistance

- extraire les ports de repository et de codec vers `application/ports` ;
- déplacer IndexedDB, Worker et politiques navigateur sous `infrastructure` ;
- décider explicitement du statut des adaptateurs mémoire ;
- implémenter et tester la réinitialisation des données locales dont la version
  ne correspond pas à la nouvelle baseline ;
- préserver les contrats de repository existants.

Sortie : l'application dépend de ports, jamais d'IndexedDB ou d'un Worker.

## Lot 4 — Cœur d'édition et session applicative

- séparer les ports/signaux purs de l'agrégat `EditorRuntime` ;
- déplacer l'orchestration store/commandes vers `application` ;
- supprimer la dépendance `editor → use-cases` ;
- supprimer le cycle entre `spatial-index` et `spatial-index-search`.

Sortie : `editor-core` ne dépend que du domaine et de lui-même.

## Lot 5 — Décomposition de `PianoRollWorkspace`

Condition d'entrée : la séparation entre état document, workspace persistant,
session d'interaction et temps réel est matérialisée par les lots 1 et 4. Les
propriétaires canoniques et leurs contrats d'abonnement sont disponibles sans
dépendre de `PianoRollWorkspace`.

Extraire dans cet ordre :

1. préférences et presets personnels ;
2. cycle de vie/import/export du projet ;
3. commandes de menu radial ;
4. dialogues ;
5. layout et portals ;
6. coordination transport/viewport.

Jalons obligatoires, à valider et consigner séparément :

1. préférences/presets : état temporaire colocalisé, persistance inchangée et
   tests ciblés des presets verts ;
2. cycle de vie projet : création, ouverture, import/export et autosave
   caractérisés, sans orchestration résiduelle dans le composant racine ;
3. menu radial : commandes injectées par contrat et tests de son modèle verts,
   sans lecture implicite de l'état interne du workspace ;
4. dialogues : état d'ouverture et de formulaire possédé par chaque dialogue,
   sans copie d'un état canonique ;
5. layout/portals : structure DOM et comportement visuel vérifiés par un smoke
   test, sans logique métier ou de cycle de vie déplacée avec eux ;
6. transport/viewport : tests d'abonnement et scénario de performance de
   `VALIDATION.md` verts par rapport à la baseline du lot 0.

Après chaque jalon : validation rapide, tests ciblés et point de rollback
distinct. Ne pas commencer le jalon suivant si le précédent n'est pas vert.

Pendant ces extractions :

- colocaliser l'état propre à chaque surface dans le composant ou le hook qui
  la possède ;
- injecter les services stables avec des contextes React étroits seulement
  lorsque le passage de props devient transversal ;
- exposer des hooks sélecteurs fondés sur `useSyncExternalStore` pour les états
  partagés qui produisent du JSX, sans recopier l'intégralité de `ProjectStore`
  ou du runtime dans un état React racine ;
- conserver les signaux et invalidations directes pour le viewport, le
  playhead, les survols et les previews de geste à haute fréquence ;
- ne pas introduire de store UI externe pendant ce lot.

Une modification d'état partagé ne rerend que les surfaces abonnées au snapshot
concerné ; aucune valeur à fréquence frame ne force le rerendu de tout le
workspace. Les adaptateurs `useSyncExternalStore` et leurs sélecteurs sont
couverts par des tests vérifiant la stabilité des snapshots et l'absence de
notification pour une sélection inchangée.

Sortie : les six jalons sont validés indépendamment, les tests de notification
et de stabilité passent, et le scénario reproductible ne montre aucune
régression de rendu par rapport à la baseline du lot 0.

## Lot 6 — Redistribution des horizontales

- déplacer les configurations vers leurs propriétaires ;
- déplacer les concepts de théorie musicale purs de `src/music/` vers
  `src/domain/music-theory/` après vérification de leurs imports ; séparer
  auparavant les responsabilités applicatives, d'interaction ou de présentation
  éventuellement mêlées à ces modules, sans changement de vocabulaire ou de
  comportement musical ;
- supprimer `ui/shared` ;
- découper `clip-commands.ts` par famille de commandes et
  `active-clip-command-helpers.ts` par invariant ;
- découper les autres modules volumineux seulement sans changement métier.

Sortie : aucune racine générique ne sert de destination par défaut.

## Lot 7 — Renommage physique des couches

Déplacer séparément :

1. `use-cases` vers `application` ;
2. `ui` vers `presentation` ;
3. `editor` vers `editor-core` ;
4. infrastructures audio, fichiers, persistance et navigateur ;
5. `app` vers `bootstrap`.

Sortie : arborescence de `TARGET.md` matérialisée et anciens chemins interdits.

## Lot 8 — Nettoyage final

- mettre à jour README, architecture, code map et guides locaux ;
- déplacer les notes/audits/assets de la racine vers `docs/` ;
- supprimer alias, façades et chemins de compatibilité temporaires ;
- exécuter la validation complète ;
- renseigner le bilan final dans `STATUS.md`.

Sortie : aucune occurrence d'ancien chemin ou nom hors migrations documentées.
