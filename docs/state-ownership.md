# Propriété et durée de vie des états

Ce document fixe le propriétaire canonique de chaque famille d’état. Il sert de
référence avant toute nouvelle persistance, commande Undo/Redo ou mise à jour à
haute fréquence.

Dernière mise à jour : 13 août 2026.

| Catégorie | Données principales | Propriétaire | Durée de vie | Persistée | Undo/Redo | Fréquence |
| --- | --- | --- | --- | --- | --- | --- |
| document projet | horloge globale, clips, timelines, pistes, notes, instruments, presets et mixage | `ProjectDocument` historisé par `ProjectStore` | ouverture du projet | oui, section `project` du format `.pianola` v1 | oui, par transaction métier | faible à moyenne |
| espace de travail | clip affiché, viewport, grille, snap tonal, mode de sélection, couleur des notes, panneaux | `WorkspaceState`, `EditorRuntime` et état React de composition | onglet d’éditeur | préférences utiles dans `NativeEditorState` | non | moyenne |
| session d’édition | sélection de notes, presse-papier, draft de geste, lasso, dialogue ou import en attente | `EditorSelection`, `PianoRollInteractionSession` et hooks de capacité | geste, montage du piano roll ou action utilisateur | non | non ; seule la transaction validée entre dans l’historique | élevée |
| temps réel | statut de lecture, horloge, événements planifiés, voix Web Audio, buffers Canvas | scheduler, moteur audio et `RenderSignal` | lecture ou frame courante | non | non | frame, pulse ou audio-rate |

## Règles

- Une donnée n’a qu’un propriétaire canonique. Une copie destinée au rendu est
  un snapshot dérivé, pas une seconde source de vérité.
- `ProjectState` agrège `ProjectDocument` et `WorkspaceState` au runtime. Seul le
  document musical entre dans l’historique ; un panneau ouvert, un pointeur
  capturé ou une sélection ne deviennent jamais des commandes métier.
- Une intention validée produit au plus une transaction Undo/Redo. Les mouvements
  intermédiaires restent dans la session d’interaction.
- Le compilateur audio reçoit un `PlaybackSource` explicite. Il ne choisit pas le
  clip à partir de l’écran actif.
- L’export MIDI reçoit un `MidiExportPlan` neutre. Le codec ne connaît ni
  le store, ni React, ni le clip affiché.

## Format natif v1

`activeClipId` est physiquement absent de `ProjectDocument`. Il est sérialisé
dans la section `editor` avec les autres préférences de `NativeEditorState`, puis
reconstruit dans `WorkspaceState` au chargement. Sa modification passe par
`ProjectStore.selectClip`, ne change ni la révision musicale ni Undo/Redo et ne
supprime pas la pile Redo.
