# Fichiers projet

## Format natif `.pianola`

Le point d’entrée de lecture est
`src/project-io/native/parse-native-project.ts`; celui d’écriture est
`src/project-io/native/serialize-native-project.ts`. Le schéma JSON v1 vit dans
`src/project-io/native/native-project-schema.ts` et reste distinct du domaine.

Le parseur :

1. reçoit une valeur JSON inconnue ;
2. vérifie version, limites et sections ;
3. construit instruments, clips, document et état d’éditeur ;
4. retourne un agrégat prêt à remplacer le runtime.

Pour ajouter un champ persistant à un instrument, mettre à jour le type du
domaine, le schéma natif, le sérialiseur, le lecteur d’instruments et leurs
tests. Ne pas disperser la validation d’un même agrégat.

Tests ciblés :

```bash
npm test -- src/project-io/native/__tests__/parse-native-project.test.ts
npm test -- src/project-io/native/__tests__/serialize-native-project.test.ts
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

Le découpage interne des parseurs MIDI et natif n’appartient pas au chantier de
navigabilité courant ; leurs façades et leurs tests restent inchangés.
