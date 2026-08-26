# Entrées et sorties projet

> **État courant.** Ce guide décrit `src/project-io` avant sa redistribution.
> Pour une tâche de migration, lire
> [`../../docs/migration/README.md`](../../docs/migration/README.md) et vérifier
> `STATUS.md` avant d'appliquer un chemin cible.

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

Les contrats du nouveau format sont dans `../persistence/__tests__/`. Les codecs
portable et local réutilisent encore `native/parsing/parse-project`; le codec
`native/` possède aussi ses propres tests historiques. Le lot 2 doit extraire la
logique courante nécessaire avant de supprimer cette zone. La régression MIDI
est dans `tests/integration/midi-regression.test.mjs`. `midi/smf-reader.ts` et
`native/parsing/parse-instruments.ts` sont signalés comme modules volumineux par
le contrôle structurel.
