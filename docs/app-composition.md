# Inventaire de la composition applicative

`src/app/App.tsx` montre la création du runtime et la surface principale sans
héberger les protocoles détaillés.

## États et propriétaires

| Intention | État | Propriétaire actuel | Justification |
| --- | --- | --- | --- |
| runtime | services et signaux | `App.tsx` via une ref stable | durée de vie de l’onglet et assemblage racine |
| projet/clip | snapshot React, instrument sélectionné, sélection disponible | `usePianoRollProjectState` | synchronise le store et annule l’interaction au changement de clip |
| inspecteur | ouvert, section portrait, hôte toolbar | `PianoRollWorkspace` | état de disposition de la surface |
| sélection | mode et presse-papier | workflow sélection + `usePianoRollClipboard` | état transitoire du piano roll |
| rendu | mode couleur et pitch preview | `PianoRollWorkspace` + signaux runtime | préférence visible non musicale |
| snap | réglages actifs | runtime, reflété dans le workspace | partagé par contrôles et gestes |
| dialogues métier | alerte, confirmation ou choix alternatif | `useApplicationDialogs` | protocole alert/confirm du workspace |
| diagnostics navigateur | erreurs console, JavaScript, promesses et rendu React | `BrowserErrorReporter`, `BrowserErrorBoundary` et `BrowserErrorDialog` | file globale dédupliquée qui reste visible si le piano roll ne peut plus être rendu |
| instrument | nom, couleur, preset et synthé en brouillon | `useInstrumentDialogWorkflow` | validation complète avant transaction |
| collisions | choix merge/slice et séquence | `useNoteCollisionDialogWorkflow` | transforme une décision utilisateur en transaction |
| marqueurs tempo/métrique | brouillon de la modale et gestes du ruler | `useTimeMapMarkerWorkflow` | une intention validée produit au plus une transaction |
| fichiers | inputs, sauvegarde, chargement | `useProjectFileWorkflow` | propriétaire UI de la capacité native |
| MIDI | input et analyse en attente | `useMidiFileWorkflow` | préparation/confirmation avant remplacement |
| transport | statut et commandes | `useAudioPlayback` + `useTransportWorkflow` | pont explicite vers l’audio et le domaine |
| viewport | refs DOM et interactions de scroll/zoom | `useViewportControls` | synchronisation DOM/signaux à haute fréquence |

## État React restant dans le workspace

Les états restants sont uniquement de composition visible : panneau inspecteur,
hôte du portal, mode de sélection, mode de couleur, pitch preview et reflet du
snap. Aucun ne contient un protocole de validation, une collision, un import ou
un brouillon métier complet.

## Surface racine

`src/app/App.tsx` a moins de 350 lignes et 20 imports. Le contrôle structurel
rend ces deux limites exécutables. La création du runtime reste volontairement
dans cette couche ; `src/ui/piano-roll/PianoRollWorkspace.tsx` possède
l’assemblage de l’espace de travail. La frontière d’erreur et la modale de
diagnostic entourent cette surface afin de rester disponibles après une erreur
de rendu React.
