# Inventaire de la composition applicative

`src/bootstrap/App.tsx` montre la création du runtime et la surface principale sans
héberger les protocoles détaillés.

## États et propriétaires

| Intention | État | Propriétaire actuel | Justification |
| --- | --- | --- | --- |
| runtime | services et signaux décrits par `application/editor-session/EditorRuntime` | `App.tsx` via une ref stable | durée de vie de l’onglet et assemblage racine |
| projet/clip | snapshot React sélectionné, instrument sélectionné, sélection disponible | `usePianoRollProjectState` via `useProjectStoreSelector` | stabilise le snapshot, supprime les notifications inchangées et annule l’interaction au changement de clip |
| inspecteur | ouvert et section portrait | `PianoRollWorkspace` ; hôte toolbar possédé par `PianoRollWorkspaceLayout` | état de disposition de la surface et portal sans logique métier |
| sélection | mode et presse-papier | workflow sélection + `usePianoRollClipboard` | état transitoire du piano roll |
| rendu | mode couleur et pitch preview | `usePianoRollUserPreferences` + signaux runtime | préférence visible non musicale, persistée sans copie canonique |
| snap | réglages actifs | runtime, lu par `useRenderSignalValue` pour le JSX | partagé par contrôles et gestes ; les invalidations Canvas restent directes |
| dialogues métier | alerte, confirmation ou choix alternatif | `useApplicationDialogs` | protocole alert/confirm du workspace |
| diagnostics navigateur | erreurs console, JavaScript, promesses et rendu React | `BrowserErrorReporter`, `BrowserErrorBoundary` et `BrowserErrorDialog` | file globale dédupliquée qui reste visible si le piano roll ne peut plus être rendu |
| instrument | nom, couleur, preset et synthé en brouillon | `useInstrumentDialogWorkflow` | validation complète avant transaction |
| collisions | choix merge/slice et séquence | `useNoteCollisionDialogWorkflow` | transforme une décision utilisateur en transaction |
| clips et groupes | dialogues et orchestration des opérations de hiérarchie | `useClipDialogWorkflow`, `useClipWorkflow` et hooks de capacité associés | prépare une intention puis publie une transaction atomique |
| marqueurs tempo/métrique/gamme/section | brouillon de la modale et gestes du ruler | `useTimeMapMarkerWorkflow` | une intention validée produit au plus une transaction |
| fichiers | inputs, autosave, export et fermeture | `usePianoRollProjectLifecycle`, composé de `useProjectFileWorkflow` et `useProjectAutosave` | cycle de vie complet hors du composant racine |
| MIDI | input et analyse en attente | `usePianoRollProjectLifecycle` via `useMidiFileWorkflow` | préparation/confirmation avant remplacement |
| transport | statut, commandes et suivi de clip | `usePianoRollTransportViewport`, composé de `useAudioPlayback` et `useTransportWorkflow` | pont explicite vers l’audio, le domaine et la politique de suivi |
| viewport | refs DOM et interactions de scroll/zoom | `usePianoRollTransportViewport` via `useViewportControls` | synchronisation DOM/signaux à haute fréquence |

## État React restant dans le workspace

Le composant racine conserve uniquement l'ouverture et la section visible de
l'inspecteur. Le layout possède l'hôte du portal ; les préférences, imports,
dialogues, transport et viewport sont possédés par leurs hooks ou composants de
surface. Aucun état à fréquence frame n'est copié dans le workspace.

## Surface racine

`src/bootstrap/App.tsx` a moins de 350 lignes et 20 imports. Le contrôle structurel
rend ces deux limites exécutables. La création du runtime reste volontairement
dans cette couche ; `src/presentation/piano-roll/PianoRollWorkspace.tsx` coordonne les
contrats, tandis que `PianoRollWorkspaceLayout.tsx` possède la structure DOM.
La frontière d’erreur et la modale de
diagnostic entourent cette surface afin de rester disponibles après une erreur
de rendu React.
