# Propriété et durée de vie des états

Ce document fixe le propriétaire canonique de chaque famille d’état. Il sert de
référence avant toute nouvelle persistance, commande Undo/Redo ou mise à jour à
haute fréquence.

Dernière mise à jour : 13 août 2026, chantier P1.

| Catégorie | Données principales | Propriétaire | Durée de vie | Persistée | Undo/Redo | Fréquence |
| --- | --- | --- | --- | --- | --- | --- |
| document projet | clips, pistes, notes, instruments, presets, mixage, transport musical | `ProjectStore` autour de `ProjectState` | ouverture du projet | oui, format `.pianola` v1 | oui, par transaction métier | faible à moyenne |
| espace de travail | clip affiché, viewport, grille, snap tonal, mode de sélection, couleur des notes, panneaux | `EditorRuntime` et état React de composition | onglet d’éditeur | seulement les préférences utiles dans `NativeEditorState` | non | moyenne |
| session d’édition | sélection de notes, presse-papier, draft de geste, lasso, dialogue ou import en attente | `EditorSelection`, `PianoRollInteractionSession` et hooks de capacité | geste, montage du piano roll ou action utilisateur | non | non ; seule la transaction validée entre dans l’historique | élevée |
| temps réel | statut de lecture, horloge, événements planifiés, voix Web Audio, buffers Canvas | scheduler, moteur audio et `RenderSignal` | lecture ou frame courante | non | non | frame, pulse ou audio-rate |

## Règles

- Une donnée n’a qu’un propriétaire canonique. Une copie destinée au rendu est
  un snapshot dérivé, pas une seconde source de vérité.
- `ProjectState` ne reçoit que des données musicales durables. Un panneau ouvert,
  un pointeur capturé ou une sélection ne deviennent jamais des commandes métier.
- Une intention validée produit au plus une transaction Undo/Redo. Les mouvements
  intermédiaires restent dans la session d’interaction.
- Le compilateur audio reçoit un `PlaybackSource` explicite. Il ne choisit pas le
  clip à partir de l’écran actif.
- L’export MIDI reçoit une `MidiExportProjection` neutre. Le codec ne connaît ni
  le store, ni React, ni le clip affiché.

## Compatibilité du format natif v1

Le champ `activeClipId` demeure présent dans `ProjectState` et dans le document
`.pianola` v1 pour préserver le round-trip historique. Il représente
sémantiquement une navigation d’espace de travail : son changement ne consomme
pas d’entrée Undo/Redo, et les nouvelles frontières audio/MIDI ne le lisent plus
implicitement. Sa suppression physique demande une migration versionnée du
format natif et reste donc suivie séparément de la réorganisation P1.
