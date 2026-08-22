# Entrées et sorties projet

## Que possède cette zone ?

Les codecs et validations du format portable `.pianola` et du Standard MIDI File.
Elle ne possède ni le store, ni les dialogues, ni la décision de remplacer le
projet actif.

## Quel fichier lire en premier ?

Pour `.pianola` : `portable/portable-project-codec.ts`. Pour MIDI : `midi/standard-midi-file.ts`,
puis reader/writer et analyse.

## Quelles dépendances sont autorisées ?

Cette zone dépend du domaine, de la configuration et des projections neutres.
React, composants UI et composition `app` sont interdits.

## Où sont les tests ?

Les contrats du nouveau format sont dans `../persistence/__tests__/`. L'ancien
codec `native/` n'est plus connecté au produit. La régression MIDI est dans
`tests/integration/midi-regression.test.mjs`. `midi/smf-reader.ts` et
`native/parsing/parse-instruments.ts` sont signalés comme modules volumineux par
le contrôle structurel.
