# Domaine

## Que possède cette zone ?

Le document musical, ses identifiants, notes, clips, instruments, transport,
master bus, validations, commandes, transformations, collisions et historique.

## Quel fichier lire en premier ?

Commencer par `project/project-document.ts`, puis suivre vers `clips/clip.ts`,
`clips/clip-hierarchy.ts`, `instruments/project-instrument.ts`,
`instruments/synth/synth-config.ts` ou `notes/note.ts`. Les presets sont sous
`instruments/presets/` et leurs validations restent colocalisées avec leur
propriétaire. Une mutation commence dans
`commands/command-types.ts` et aboutit au reducer. La structure temporelle
d’un clip — marqueurs de tempo, métrique, gamme et section, dérivation des
mesures — est exposée par `transport/time-map.ts` et répartie dans les modules
`time-map-*`, `time-signature.ts` et `*-marker-operations.ts`. La théorie
musicale pure vit dans `music-theory/` ; `pitch-pattern-catalog.ts` possède le
catalogue catégorisé des gammes et accords. Leur symbolisation s'appuie sur Tonal.
Les invariants sont validés dans
`validation/transport-validation.ts`.

## Quelles dépendances sont autorisées ?

Les constantes métier sont colocalisées dans le domaine. La création des
identifiants de presets personnels est injectée par le workflow : le domaine ne
dépend ni du temps, ni de l'aléatoire, ni de React ou du navigateur.

## Où sont les tests ?

Les unités vivent dans `__tests__/` et `commands/__tests__/`. Les invariants
transversaux restent couverts par `tests/integration/audio-domain-regression.test.mjs`.
`note-collision.ts` dépasse le seuil indicatif car il possède l’algorithme
cohérent de merge/slice ; le dialogue et les gestes vivent hors de ce module.
