# Fichiers projet

## Que possède cette zone ?

Les codecs et validations du Standard MIDI File. Le format `.pianola` est déjà
possédé par `src/infrastructure/project-files/pianola/` et la persistance locale
par `src/infrastructure/persistence/`.

## Quel fichier lire en premier ?

Pour MIDI : `midi/standard-midi-file.ts`, puis reader/writer et analyse.

## Quelles dépendances sont autorisées ?

Cette infrastructure dépend du domaine, des plans applicatifs et de ses
constantes MIDI colocalisées. React, présentation et bootstrap sont interdits.

## Où sont les tests ?

La régression MIDI est dans `tests/integration/midi-regression.test.mjs`.
`midi/smf-reader.ts` est signalé comme module volumineux par le contrôle
structurel.
