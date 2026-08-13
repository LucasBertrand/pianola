# Journal du chantier P1

Branche de travail : `migration/p1-boundaries`, issue du jalon P0
`migration/p0-guardrails`.

Dernière mise à jour : 13 août 2026.

## État

Le socle P1 est en place et les critères techniques de sortie sont couverts :

- contrats de grille, couleur, runtime et dialogue indépendants des composants ;
- `src/app` limité à `App.tsx`, `create-app-runtime.ts` et `demo-project.ts` ;
- cas d’usage dans `use-cases`, calculs et sessions dans `editor`, formats dans
  `project-io`, adaptateurs React regroupés par capacité dans `ui` ;
- interactions navigateur sous `ui/piano-roll/interactions`, événements convertis
  en `PointerSample` neutre avant le cœur d’édition ;
- configuration divisée par propriétaire ; `program-constants.ts` supprimé ;
- noms génériques historiques (`types`, `contracts`, `state`, `input`, `errors`)
  remplacés par des rôles explicites ;
- compilation audio depuis un `PlaybackSource` explicite ;
- export SMF depuis une `MidiExportProjection` indépendante du store ;
- registre de renderers audio conservé dans le moteur, sans branche instrument
  dans le scheduler générique.

La suite de régression compte 82 tests Vitest. Les deux grands témoins
historiques conservent provisoirement l’extension `.test.mjs`; ils utilisent le
runner Vitest et les builders partagés, et aucun runner historique ne subsiste.

## Compatibilité assumée

Le format `.pianola` v1 continue de sérialiser `activeClipId`. La navigation est
déjà exclue de l’historique et n’est plus consultée par les compilateurs audio et
MIDI, mais retirer le champ du modèle interne sera couplé à une migration native
versionnée afin de ne pas casser les fichiers existants.

## Vérification attendue

```bash
npm run verify
```

Cette commande doit valider les frontières P1, le TypeScript strict, le build de
production et les 82 scénarios Vitest.
