# Audio

## Que possède cette zone ?

La compilation de snapshot, la couche transitoire de prévisualisation des
instruments, l’horloge de transport, la fenêtre lookahead, les occurrences,
notes tenues, voix, bus Web Audio et renderers d’instrument.

## Quel fichier lire en premier ?

La façade transport est `lookahead-scheduler.ts`; la façade navigateur est
`web-audio-engine.ts`. Le scheduler délègue à
`playback-occurrence-scheduler.ts`; le moteur délègue routage, automation et
polyphonie à leurs modules nommés.

```text
PlaybackSource + InstrumentSettingsPreviewLayer
  → PlaybackSnapshot → LookaheadScheduler
  → occurrences → WebAudioEngine → bus/voix → InstrumentRenderer
```

`instrument-settings-preview.ts` contient uniquement des overrides de session.
Ils ne sont ni écrits dans `ProjectDocument`, ni envoyés à `ProjectStore`. En
lecture, le scheduler remplace le snapshot sans déplacer son horloge ni annuler
les occurrences. Le moteur lisse les paramètres continus des voix actives ; les
paramètres structurels restants s’appliquent aux notes suivantes. Retirer
l’override restaure de la même façon les réglages publiés.

## Quelles dépendances sont autorisées ?

Audio peut dépendre du domaine, de la configuration et des primitives de temps.
Il ne dépend ni de React, ni de composants UI, ni de `app`.

## Où sont les tests ?

`__tests__/playback-plan.test.ts` couvre la compilation pure, la superposition
transitoire et la stabilité du transport pendant une prévisualisation.
Scheduling, boucles, audition, voix et bus sont aussi couverts dans la suite
centrale de régression.
