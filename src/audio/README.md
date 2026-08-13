# Audio

## Que possède cette zone ?

La compilation de snapshot, l’horloge de transport, la fenêtre lookahead, les
occurrences, notes tenues, voix, bus Web Audio et renderers d’instrument.

## Quel fichier lire en premier ?

La façade transport est `lookahead-scheduler.ts`; la façade navigateur est
`web-audio-engine.ts`. Le scheduler délègue à
`playback-occurrence-scheduler.ts`; le moteur délègue routage, automation et
polyphonie à leurs modules nommés.

```text
PlaybackSource → PlaybackSnapshot → LookaheadScheduler
  → occurrences → WebAudioEngine → bus/voix → InstrumentRenderer
```

## Quelles dépendances sont autorisées ?

Audio peut dépendre du domaine, de la configuration et des primitives de temps.
Il ne dépend ni de React, ni de composants UI, ni de `app`.

## Où sont les tests ?

`__tests__/playback-plan.test.ts` couvre la compilation pure. Scheduling, boucles,
audition, voix et bus sont couverts dans la suite centrale de régression.
