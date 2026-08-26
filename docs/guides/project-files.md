# Fichiers projet

> **État courant.** Ce guide décrit les codecs présents avant le lot 2. La cible
> incompatible avec les anciens formats est définie par D-009 dans
> [`../migration/DECISIONS.md`](../migration/DECISIONS.md), et son avancement par
> [`../migration/STATUS.md`](../migration/STATUS.md).

## Format natif `.pianola`

Le point d’entrée unique du format portable est
`src/project-io/portable/portable-project-codec.ts`. Le fichier porte
`format: "app.pianola.project"`, sa propre `schemaVersion`, le document musical
et un `ProjectWorkspaceState` séparé. Il ne contient aucune préférence
utilisateur.

Le lecteur traite toujours le JSON comme inconnu, reconnaît format et version,
valide le document puis le workspace. Une version future est refusée sans être
réécrite. L'import crée un nouveau `documentId` local même si le fichier vient
d'un projet déjà présent dans la bibliothèque.

Le format local est différent du format portable. L'enveloppe
`app.pianola.stored-project` ajoute `documentId`, révision et `updatedAt`; elle
est sérialisée dans le Web Worker puis conservée en deux générations par
IndexedDB. Le catalogue ne contient que les résumés nécessaires à l'accueil.

Le pipeline portable :

1. reçoit une valeur JSON inconnue ;
2. vérifie identité, version, limites et sections ;
3. construit le document et le workspace ;
4. crée une entrée locale distincte sans modifier `UserSettings`.

Les enveloppes v1 locale, portable et native restent lisibles. Les champs
`anchorTick` et `playheadTick` sont validés puis retirés pendant la construction
du modèle v2 ; les exports et autosaves suivants ne les écrivent plus.

Cette compatibilité décrit uniquement le code courant. Elle doit être supprimée
au lot 2 : elle ne constitue pas une exigence de la cible.

Tests ciblés :

```bash
npm test -- src/persistence/__tests__/persistence-codecs.test.ts
npm test -- src/persistence/__tests__/project-repository-contract.test.ts
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
