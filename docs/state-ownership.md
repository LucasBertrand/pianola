# Propriété et durée de vie des états

Ce document fixe le propriétaire canonique de chaque famille d’état. Il sert de
référence avant toute nouvelle persistance, commande Undo/Redo ou mise à jour à
haute fréquence.

Dernière mise à jour : 31 août 2026.

| Catégorie | Données principales | Propriétaire | Durée de vie | Persistée | Undo/Redo | Fréquence |
| --- | --- | --- | --- | --- | --- | --- |
| document projet | horloge globale (PPQN), clips, bypass par clip et par groupe, hiérarchie de groupes et ordre de lecture dérivé, timelines (marqueurs de tempo/métrique/gamme/section, durée), boucles locales, enchaînement global, auto-scroll du playhead, pistes, notes, instruments, presets et mixage | `ProjectDocument` historisé par `application/history/ProjectStore` | ouverture du projet | oui, dans `StoredProject` et la section `document` du nouveau `.pianola` | oui, par transaction métier | faible à moyenne |
| session d'éditeur minimale | document ouvert et clip actif canonique | `EditorSessionState`, dont `ActiveClipSelection` | ouverture du projet | clip actif projeté dans le contexte persistant | seul le `ProjectDocument` est historisé | moyenne |
| contexte d'éditeur persistant | clip et instrument actifs, grille et snap par motif de hauteurs par clip | `PersistedEditorWorkspace`, avec un `PersistedClipEditorState` par clip, projeté par `application/editor-session/workspace-persistence.ts` dans `EditorRuntime` | durée de vie du projet | oui, atomiquement avec le document et dans une section portable distincte | non | moyenne |
| préférences utilisateur | mode de sélection, couleur et type de label des notes, préécoute du pitch, presets personnels et raccourcis par action | `UserSettingsRepository`, projeté temporairement par `usePianoRollUserPreferences` | installation et utilisateur local | oui, document IndexedDB séparé ; jamais exporté | non | faible |
| session d’édition | sélection de notes, presse-papier, draft géométrique de note, lasso, dialogue ou import en attente | `EditorSelection`, `PianoRollInteractionSession` et hooks de capacité | geste, montage du piano roll ou action utilisateur | non | snapshots d’identifiants avant/après pour la sélection ; les autres états restent hors historique | élevée |
| projection éditoriale temporelle | `TimeMap` projetée pour un déplacement de marqueurs et région de boucle projetée | `TimeMapMarkerPreviewSession` et `LoopPreviewSession` dans `application/editor-session/` | un geste, lié au clip et à la révision sources | non | non ; le commit seul publie une transaction | élevée pendant le geste |
| état audio effectif | timeline et transport publiés, surchargés indépendamment par le tempo projeté, la boucle projetée ou les paramètres d’instrument en cours d’édition | `AudioWorkletTransport` puis `WorkletTimelineEngine` | source audio courante ou interaction | non | non ; retirer une surcharge révèle le dernier état publié | audio-rate et interaction |
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
- Un draft de note décrit la géométrie du geste. Une projection temporelle décrit
  le résultat musical complet que les consommateurs doivent lire pendant ce
  geste. Ils restent séparés : il n’existe pas d’union globale de previews.
- Chaque projection temporelle porte `clipId`, `sourceRevision` et un jeton de
  geste. Un changement de révision ou de clip l’invalide ; un ancien geste ne
  peut ni effacer la projection d’un geste plus récent, ni publier son commit.
- Canvas, ruler, clavier, snap et ghosts résolvent leur snapshot effectif à leur
  frontière de consommation. Ils ne mutent jamais la `TimeMap` ou la boucle
  publiée pendant `pointermove`.
- Une projection éditoriale peut représenter un marqueur ponctuel sur la
  frontière exacte de fin du clip. Cette position respecte les mêmes bornes
  que le plan de commit et peut donc être publiée au relâchement.
- Pendant l’édition d’un instrument, le brouillon est envoyé directement au
  worklet comme paramètre transitoire. Il ne recompile pas la timeline, ne mute
  pas le document et n’entre pas dans Undo/Redo.
- Le worklet conserve séparément l’état publié et ses surcharges effectives de
  tempo et de boucle. Ces canaux sont versionnés indépendamment ; publier une
  nouvelle révision ne consomme pas la surcharge active, et la retirer révèle
  la dernière valeur publiée plutôt qu’une copie ancienne.
- Le compilateur audio reçoit un `PlaybackSource` explicite. Il ne choisit pas le
  clip à partir de l’écran actif.
- Le playhead est une entité unique située dans exactement un clip. Le clip
  actif du workspace reste une sélection d’édition indépendante : le changer
  ne déplace pas le playhead. En revanche, repositionner le playhead dans le
  clip affiché déplace immédiatement la source du transport vers ce clip.
- L’export MIDI reçoit un `MidiExportPlan` neutre. Le codec ne connaît ni
  le store, ni React, ni le clip affiché.

## Trois lectures d’une interaction temporelle

```text
ProjectStore (publié, persistant, Undo/Redo)
  ├─→ projection éditoriale (geste, clip + révision + jeton)
  │     └─→ snapshot effectif de rendu, snap et collision
  └─→ timeline/transport publiés du worklet
        + surcharges tempo/boucle versionnées
        └─→ état audio effectif à l’échantillon
```

L’état publié reste l’autorité métier pour les notes, les marqueurs et la
boucle. La projection éditoriale répond à « que verrait le projet si le geste
était validé ? » sans écrire dans le document. L’état audio effectif répond à
« que doit entendre le moteur maintenant ? » : les événements de notes restent
ceux de la timeline publiée, tandis qu’un tempo ou une boucle projetés peuvent
modifier immédiatement leur lecture. Une gamme projetée influence donc le
snap et les ghosts des notes déplacées, mais ne réécrit ni ne rejoue les notes
du worklet avant le commit.

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

Le snapshot projet local courant est la première baseline, version 1. Les
préférences utilisateur restent également en version 1 pendant cette phase de
développement. Un futur rapport de
migration restera transitoire et n'entrera pas dans Undo/Redo. IndexedDB utilise
également son premier layout, version 1 ; un layout local supérieur incompatible
est supprimé et recréé pendant ce reset initial.
Les diagnostics de projets et les payloads de quarantaine
restent propriétaires de l'infrastructure ; les réglages incompatibles sont
eux aussi conservés comme diagnostic puis remplacés par les valeurs par défaut.
