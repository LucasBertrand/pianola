# Entrées et sorties projet

## Que possède cette zone ?

Les codecs et validations du format natif `.pianola` et du Standard MIDI File.
Elle ne possède ni le store, ni les dialogues, ni la décision de remplacer le
projet actif.

## Quel fichier lire en premier ?

Pour le natif : `native/parse-native-project.ts` et
`native/serialize-native-project.ts`. Pour MIDI : `midi/standard-midi-file.ts`,
puis reader/writer et analyse.

## Quelles dépendances sont autorisées ?

Cette zone dépend du domaine, de la configuration et des projections neutres.
React, composants UI et composition `app` sont interdits.

## Où sont les tests ?

Les contrats natifs sont dans `native/__tests__/`. La régression MIDI est dans
`tests/integration/midi-regression.test.mjs`. `midi/smf-reader.ts` et
`native/parsing/parse-instruments.ts` sont signalés comme modules volumineux par
le contrôle structurel.
