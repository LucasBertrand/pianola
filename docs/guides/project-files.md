# Fichiers projet

## Format `.pianola`

Le point d’entrée unique du format portable est
`src/infrastructure/project-files/pianola/pianola-project-codec.ts`. Le fichier porte
`format: "app.pianola.project"`, sa propre `schemaVersion`, le document musical
et un `PersistedEditorWorkspace` séparé. Il ne contient aucune préférence
utilisateur.

Le writer courant produit la première version portable, version 1. Le lecteur
traite toujours le JSON comme inconnu, reconnaît format et version, puis valide
strictement le document et le workspace. Il n'existe encore aucune version
historique ni migration. Une version future, un champ inconnu ou une migration
absente est refusé sans réécriture du fichier source. L'import crée un nouveau
`documentId` local même si le fichier vient d'un projet déjà présent dans la
bibliothèque. Lorsqu'une future migration existera, son rapport sera affiché
une seule fois dans la modale stylisée `application-dialog`.

Le format local est différent du format portable. L'enveloppe
`app.pianola.stored-project.v1` ajoute `documentId`, révision et `updatedAt` ;
elle est sérialisée dans le Web Worker puis conservée en deux générations par
IndexedDB. Le catalogue ne contient que les résumés nécessaires à l'accueil.
Les ports sont sous `src/application/ports/` et les codecs, Worker,
repositories IndexedDB/mémoire et politiques navigateur sous
`src/infrastructure/persistence/`.

Le pipeline portable :

1. reçoit une valeur JSON inconnue ;
2. vérifie identité et version avant la validation courante ;
3. applique les migrations fermées nécessaires ;
4. valide strictement les limites et sections courantes ;
5. crée une entrée locale distincte sans modifier `UserSettings`.

La fenêtre supportée contient uniquement la première baseline : fichiers
`.pianola` 1, snapshots locaux 1 et documents musicaux de schéma 1.
Les writers n'émettent que la version 1. Toute modification future de
structure ou de vocabulaire persistant augmente la version de son enveloppe et
ajoute une migration avant/après couverte par test.

Une version future n'est jamais remplacée. Si aucune des deux générations ne
s'ouvre, les diagnostics distinguent JSON corrompu, donnée invalide,
métadonnées incohérentes, version future et migration absente. Le bouton
`Recovery` de l'accueil exporte une archive JSON contenant les payloads intacts
et un diagnostic texte ; la suppression reste soumise à confirmation.

IndexedDB utilise son premier layout, version 1. Dans ce reset initial, tout
layout local supérieur incompatible est supprimé puis la baseline 1 est
recréée. Les futurs upgrades de layout devront créer uniquement les stores
manquants via `onupgradeneeded` et préserver les enregistrements existants.

Tests ciblés :

```bash
npm test -- src/infrastructure/persistence/__tests__/persistence-codecs.test.ts
npm test -- src/infrastructure/persistence/__tests__/project-repository-contract.test.ts
npm test -- src/infrastructure/persistence/__tests__/indexed-db-reset.test.ts
```

## MIDI

`src/infrastructure/project-files/midi/smf-reader.ts` et
`src/infrastructure/project-files/midi/smf-writer.ts` possèdent le codec binaire. L’analyse
d’import, les avertissements, le timing, les collisions et la construction du
projet sont des modules séparés dans la même capacité.

Le workflow UI est `src/presentation/project-files/useMidiFileWorkflow.ts`. L’export
reçoit un `MidiExportPlan` construit par
`src/application/project-files/midi-export-plan.ts`.

Test ciblé actuel :

```bash
npm test -- tests/integration/midi-regression.test.mjs
```

L'import MIDI remplace le document de l'entrée locale active, puis l'autosave
publie cette nouvelle révision. Il ne modifie pas les préférences utilisateur.
