# Fichiers projet

> **État courant.** Ce guide décrit les codecs et adaptateurs présents dans le
> worktree après les lots 2 et 3. La séquence de migration reste définie dans
> [`../migration/README.md`](../migration/README.md).

## Format natif `.pianola`

Le point d’entrée unique du format portable est
`src/infrastructure/project-files/pianola/pianola-project-codec.ts`. Le fichier porte
`format: "app.pianola.project"`, sa propre `schemaVersion`, le document musical
et un `PersistedEditorWorkspace` séparé. Il ne contient aucune préférence
utilisateur.

Le lecteur traite toujours le JSON comme inconnu, reconnaît format et version,
valide le document puis le workspace. Une version future est refusée sans être
réécrite. L'import crée un nouveau `documentId` local même si le fichier vient
d'un projet déjà présent dans la bibliothèque.

Le format local est différent du format portable. L'enveloppe
`app.pianola.stored-project.v1` ajoute `documentId`, révision et `updatedAt` ;
elle est sérialisée dans le Web Worker puis conservée en deux générations par
IndexedDB. Le catalogue ne contient que les résumés nécessaires à l'accueil.
Les ports sont sous `src/application/ports/` et les codecs, Worker,
repositories IndexedDB/mémoire et politiques navigateur sous
`src/infrastructure/persistence/`.

Le pipeline portable :

1. reçoit une valeur JSON inconnue ;
2. vérifie identité, version, limites et sections ;
3. construit le document et le workspace ;
4. crée une entrée locale distincte sans modifier `UserSettings`.

Les fichiers `.pianola` et snapshots locaux n'acceptent que leur baseline 1.
Une autre version est rejetée sans conversion. IndexedDB utilise le layout 2 :
à l'ouverture, une base d'un layout plus ancien ou plus récent est supprimée et
recréée explicitement. Les projets locaux incompatibles ne sont pas convertis ;
un export `.pianola` est nécessaire pour conserver une sauvegarde portable.

Tests ciblés :

```bash
npm test -- src/infrastructure/persistence/__tests__/persistence-codecs.test.ts
npm test -- src/infrastructure/persistence/__tests__/project-repository-contract.test.ts
npm test -- src/infrastructure/persistence/__tests__/indexed-db-reset.test.ts
```

## MIDI

`src/project-io/midi/smf-reader.ts` et
`src/project-io/midi/smf-writer.ts` possèdent le codec binaire. L’analyse
d’import, les avertissements, le timing, les collisions et la construction du
projet sont des modules séparés dans la même capacité.

Le workflow UI est `src/ui/project-files/useMidiFileWorkflow.ts`. L’export
reçoit un `MidiExportPlan` construit par
`src/use-cases/project-files/midi-export-plan.ts`.

Test ciblé actuel :

```bash
npm test -- tests/integration/midi-regression.test.mjs
```

L'import MIDI remplace le document de l'entrée locale active, puis l'autosave
publie cette nouvelle révision. Il ne modifie pas les préférences utilisateur.
