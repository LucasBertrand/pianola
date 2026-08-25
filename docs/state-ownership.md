# Propriété et durée de vie des états

Ce document fixe le propriétaire canonique de chaque famille d’état. Il sert de
référence avant toute nouvelle persistance, commande Undo/Redo ou mise à jour à
haute fréquence.

Dernière mise à jour : 23 août 2026.

| Catégorie | Données principales | Propriétaire | Durée de vie | Persistée | Undo/Redo | Fréquence |
| --- | --- | --- | --- | --- | --- | --- |
| document projet | horloge globale (PPQN), clips, hiérarchie de groupes et ordre de lecture dérivé, timelines (marqueurs de tempo/métrique, durée), boucles locales, enchaînement global, pistes, notes, instruments, presets et mixage | `ProjectDocument` historisé par `ProjectStore` | ouverture du projet | oui, dans `StoredProject` et la section `document` du nouveau `.pianola` | oui, par transaction métier | faible à moyenne |
| workspace projet | clip et instrument actifs, tick/pitch visibles, zoom, grille et snap tonal par clip | `ProjectWorkspaceState`, projeté dans `EditorRuntime` | durée de vie du projet | oui, atomiquement avec le document et dans une section portable distincte | non | moyenne |
| préférences utilisateur | mode de sélection, couleur des notes, préécoute du pitch et raccourcis par action | `UserSettingsRepository` | installation et utilisateur local | oui, document IndexedDB séparé ; jamais exporté | non | faible |
| session d’édition | sélection de notes, presse-papier, draft de geste, lasso, dialogue ou import en attente | `EditorSelection`, `PianoRollInteractionSession` et hooks de capacité | geste, montage du piano roll ou action utilisateur | non | snapshots d’identifiants avant/après pour la sélection ; les autres états restent hors historique | élevée |
| prévisualisation audio | réglages d’instrument en cours d’édition | brouillon du dialogue projeté par message dans le worklet | ouverture du dialogue d’instrument | non | non ; la validation seule crée une transaction | élevée pendant l’interaction |
| temps réel | playhead unique `{ clipId, tick }`, statut de lecture, tick à l’échantillon, voix DSP et buffers Canvas | `EditorRuntime.playheadPosition`, `useAudioPlayback` et `WorkletTimelineEngine` | session ou frame courante | non | non | audio-rate ou frame |

## Règles

- Une donnée n’a qu’un propriétaire canonique. Une copie destinée au rendu est
  un snapshot dérivé, pas une seconde source de vérité.
- `ProjectState` agrège le document et le clip actif au runtime. Seul le
  document musical entre dans l’historique persistant ; un panneau ouvert, un
  pointeur capturé ou une sélection ne deviennent jamais des commandes métier.
  `EditorCommandService` associe cependant à chaque transaction un snapshot
  runtime des identifiants sélectionnés avant et après l’action afin de rendre
  Undo/Redo cohérent, sans sérialiser cette information.
- Une intention validée produit au plus une transaction Undo/Redo. Les mouvements
  intermédiaires restent dans la session d’interaction.
- Pendant l’édition d’un instrument, le brouillon est envoyé directement au
  worklet comme paramètre transitoire. Il ne recompile pas la timeline, ne mute
  pas le document et n’entre pas dans Undo/Redo.
- Le compilateur audio reçoit un `PlaybackSource` explicite. Il ne choisit pas le
  clip à partir de l’écran actif.
- Le playhead est une entité unique située dans exactement un clip. Le clip
  actif du workspace reste une sélection d’édition indépendante : le changer
  ne déplace pas le playhead. En revanche, repositionner le playhead dans le
  clip affiché déplace immédiatement la source du transport vers ce clip.
- L’export MIDI reçoit un `MidiExportPlan` neutre. Le codec ne connaît ni
  le store, ni React, ni le clip affiché.

## Agrégat persistant

`activeClipId` reste physiquement absent de `ProjectDocument`. Sa modification
passe par `ProjectStore.selectClip`, ne change ni la révision musicale ni
Undo/Redo et ne supprime pas la pile Redo. Lors d'une sauvegarde,
`captureProjectWorkspace` projette les signaux du runtime en coordonnées
musicales indépendantes de l'écran.

`StoredProject` associe document et workspace pour une écriture atomique, sans
faire entrer le workspace dans l'historique. `UserSettings` est écrit par un
repository distinct ; importer un projet ne peut donc pas remplacer les
préférences du destinataire. Les règles de version et de récupération sont dans
[`persistence-strategy.md`](persistence-strategy.md).

Les lecteurs v2 acceptent les anciens `anchorTick` et `playheadTick` v1 afin de
charger les projets existants, puis les ignorent. Aucun codec courant ne les
réécrit : une nouvelle session commence avec le playhead au début du clip actif.
