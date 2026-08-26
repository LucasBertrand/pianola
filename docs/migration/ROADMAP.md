# Feuille de route

Chaque lot possède une condition d'entrée, des actions, une condition de sortie
et un point de rollback. Ne commencer qu'un lot à la fois.

## Lot 0 — Baseline et garde-fous

- enregistrer le résultat initial de `npm run verify` dans `STATUS.md` ;
- corriger les contrôles documentaires liés aux fichiers de migration si
  nécessaire ;
- étendre les frontières à toutes les couches actuelles ;
- ajouter une détection des cycles et séparer code produit et tests.

Sortie : baseline connue et contrôles architecturaux verts.

## Lot 1 — Vocabulaire d'état

- introduire `EditorSessionState`, `ActiveClipSelection`,
  `PersistedEditorWorkspace` et `PersistedClipEditorState` ;
- migrer d'abord les types et codecs, puis application et présentation ;
- supprimer les alias seulement après absence vérifiée de consommateurs.

Sortie : chaque variante de `workspace` possède un sens unique documenté.

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

- extraire les ports de repository et codec vers `application/ports` ;
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

Une modification d'état partagé ne rerend que les surfaces abonnées au snapshot concerné ; aucune valeur à fréquence frame ne force le rerendu de tout le workspace. 
Les adaptateurs `useSyncExternalStore` et leurs sélecteurs sont couverts par des tests vérifiant la stabilité des snapshots et l'absence de notification pour une sélection
inchangée.

## Lot 6 — Redistribution des horizontales

- déplacer les configurations vers leurs propriétaires ;
- supprimer `ui/shared` ;
- découper `active-clip-command-helpers.ts` par invariant ;
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
