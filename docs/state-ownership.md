# Propriété et durée de vie des états

> **État courant.** Ce document décrit les propriétaires matérialisés par la
> migration achevée. Les décisions et preuves historiques sont sous
> [`migration/`](migration/README.md).

Ce document fixe le propriétaire canonique de chaque famille d’état. Il sert de
référence avant toute nouvelle persistance, commande Undo/Redo ou mise à jour à
haute fréquence.

Dernière mise à jour : 29 août 2026.

| Catégorie | Données principales | Propriétaire | Durée de vie | Persistée | Undo/Redo | Fréquence |
| --- | --- | --- | --- | --- | --- | --- |
| document projet | horloge globale (PPQN), clips, bypass par clip et par groupe, hiérarchie de groupes et ordre de lecture dérivé, timelines (marqueurs de tempo/métrique/gamme/section, durée), boucles locales, enchaînement global, auto-scroll du playhead, pistes, notes, instruments, presets et mixage | `ProjectDocument` historisé par `application/history/ProjectStore` | ouverture du projet | oui, dans `StoredProject` et la section `document` du nouveau `.pianola` | oui, par transaction métier | faible à moyenne |
| session d'éditeur minimale | document ouvert et clip actif canonique | `EditorSessionState`, dont `ActiveClipSelection` | ouverture du projet | clip actif projeté dans le contexte persistant | seul le `ProjectDocument` est historisé | moyenne |
| contexte d'éditeur persistant | clip et instrument actifs, grille et snap tonal par clip | `PersistedEditorWorkspace`, avec un `PersistedClipEditorState` par clip, projeté par `application/editor-session/workspace-persistence.ts` dans `EditorRuntime` | durée de vie du projet | oui, atomiquement avec le document et dans une section portable distincte | non | moyenne |
| préférences utilisateur | mode de sélection, couleur des notes, préécoute du pitch, presets personnels et raccourcis par action | `UserSettingsRepository`, projeté temporairement par `usePianoRollUserPreferences` | installation et utilisateur local | oui, document IndexedDB séparé ; jamais exporté | non | faible |
| session d’édition | sélection de notes, presse-papier, draft de geste, lasso, dialogue ou import en attente | `EditorSelection`, `PianoRollInteractionSession` et hooks de capacité | geste, montage du piano roll ou action utilisateur | non | snapshots d’identifiants avant/après pour la sélection ; les autres états restent hors historique | élevée |
| prévisualisation audio | réglages d’instrument en cours d’édition | brouillon du dialogue projeté par message dans le worklet | ouverture du dialogue d’instrument | non | non ; la validation seule crée une transaction | élevée pendant l’interaction |
| temps réel | playhead unique `{ clipId, tick }`, statut de lecture, tick à l’échantillon, voix DSP et buffers Canvas | `application/editor-session/EditorRuntime.playheadPosition`, `useAudioPlayback` et `WorkletTimelineEngine` | session ou frame courante | non | non | audio-rate ou frame |

## Règles

- Une donnée n’a qu’un propriétaire canonique. Une copie destinée au rendu est
  un snapshot dérivé, pas une seconde source de vérité.
- Les projections React de `ProjectStore` passent par
  `useProjectStoreSelector`. Une projection inchangée conserve sa référence et
  ne reçoit aucune notification. Les signaux de viewport, playhead, survol et
  preview continuent d'invalider directement le DOM ou le Canvas.
- `EditorSessionState` agrège le document et son `ActiveClipSelection` au
  runtime. Seul le
  document musical entre dans l'historique persistant ; un panneau ouvert, un
  pointeur capturé ou une sélection ne deviennent jamais des commandes métier.
  `application/history/EditorCommandService` associe cependant à chaque transaction un snapshot
  runtime des identifiants sélectionnés avant et après l'action afin de rendre
  Undo/Redo cohérent, sans sérialiser cette information.
- La pile de `ProjectStore` contient des snapshots de `ProjectDocument`, jamais
  de `EditorSessionState` complet. Elle couvre donc le titre, l'horloge, les clips et
  leur contenu, la hiérarchie, les instruments, les presets, le mixage et les
  réglages de lecture durables. `revision` progresse à chaque Undo ou Redo au
  lieu de reprendre la valeur du snapshot restauré.
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
`capturePersistedEditorWorkspace` projette les signaux du runtime en coordonnées
musicales indépendantes de l'écran.

`StoredProject` associe document et workspace pour une écriture atomique, sans
faire entrer le workspace dans l'historique. `UserSettings` est écrit par un
repository distinct ; importer un projet ne peut donc pas remplacer les
préférences du destinataire. Ces contrats appartiennent à
`src/application/ports/`; leurs adaptateurs de stockage appartiennent à
`src/infrastructure/persistence/`.

Le modèle courant de workspace ne conserve ni viewport ni playhead. Le codec
refuse les champs qui ne font pas partie de la baseline courante au lieu de les
convertir ou de les abandonner silencieusement. Les seules données par clip
persistées sont `pitchSnapSettings` et `gridSettings`.

Pour le classement détaillé ayant guidé le lot 1, consulter
[`migration/STATE-HISTORY-INVENTORY.md`](migration/STATE-HISTORY-INVENTORY.md).

Le snapshot local accepte uniquement la baseline 1. IndexedDB utilise le layout
2 et réinitialise toute base dont la version est plus ancienne ou plus récente,
sans conversion silencieuse. Les réglages incompatibles sont conservés comme
diagnostic puis remplacés par les valeurs par défaut.
