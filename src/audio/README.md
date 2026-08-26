# Audio

## Que possède cette zone ?

La compilation de la timeline transférable, le transport à l’échantillon, les
boucles, les voix soustractives, les enveloppes et le protocole AudioWorklet.

## Quel fichier lire en premier ?

La façade navigateur est `audio-worklet-transport.ts`. Le cœur temps réel est
`worklet/worklet-timeline-engine.ts`; il est indépendant du DOM et testable sans
navigateur. `worklet/playback-processor.ts` ne fait que relier ce cœur à
`AudioWorkletProcessor`.

```text
PlaybackSource
  → compilePlaybackPlan
  → createTransferableAudioWorkletTimeline
  → AudioWorkletTransport ── MessagePort ──→ WorkletTimelineEngine
                                           → voix/DSP stéréo
                                           → sortie audio
```

La timeline entière est transférée lorsqu’une donnée musicale change. Ensuite,
le worklet avance le tick depuis le nombre d’échantillons rendus : aucun timer,
frame React ou callback du thread principal ne déclenche une note. Une
prévisualisation d’instrument est un message de paramètres léger ; elle ne
recompile et ne retransfère jamais les notes.

Le cœur évite les allocations temporaires dans `process()`, borne la polyphonie
globale pour les processeurs mobiles et utilise des oscillateurs PolyBLEP pour
limiter l’aliasing. Le vol de voix réaffecte la voix existante avec continuité :
un release audible compte donc dans la polyphonie et un instrument monophonique
ne produit jamais deux voix simultanées. Un index
d’intervalles transféré avec chaque piste permet de retrouver les notes tenues
après un seek sans parcourir toute la timeline sur le thread audio.

## Étage master temps réel

`worklet/worklet-master-stage.ts` traite la somme stéréo après le gain master.
Il réserve **-6 dB** de headroom (`0,501187` linéaire) avant la protection et
fixe le plafond à **-1 dBFS** (`0,891251` linéaire). Le headroom absorbe les
transitoires nominales et laisse de la marge aux conversions en aval ; il ne
garantit pas seul une sortie bornée lorsque de nombreuses voix cohérentes
s’additionnent. La protection assure cette dernière garantie.

| Protection | Latence | Comportement | Choix conseillé |
| --- | ---: | --- | --- |
| `soft-clipper` | 0 | Knee à 75 % du plafond, saturation continue et strictement bornée ; ajoute des harmoniques sur une surcharge durable. | Préécoute sans latence et instruments percussifs quand la couleur de saturation est acceptable. |
| `lookahead-limiter` | 2 ms (96 échantillons à 48 kHz) | Détection peak stéréo liée, attaque anticipée et release de 80 ms ; préserve mieux le timbre sous surcharge brève. | Master par défaut et lecture de la timeline. |

Le limiteur emploie une ligne à retard et une deque monotone préallouées. Le
clipper ne conserve que des scalaires. Aucun des deux chemins n’alloue dans
`processFrame()` ; changer de protection se fait à la construction du moteur,
hors du rendu temps réel.

La mesure porte sur les peaks et RMS linéaires gauche/droite après protection,
avec en plus le peak avant protection et la réduction de gain maximale en dB.
Le worklet accumule ces valeurs avec des scalaires puis publie un message
`master-levels` à **20 Hz**. La façade navigateur l’expose par
`AudioTransportCallbacks.onMasterLevels`, ce qui évite un message et un objet
par quantum audio.

## Quelles dépendances sont autorisées ?

Audio peut dépendre du domaine, de la configuration et des primitives de temps.
Il ne dépend ni de React, ni de composants UI, ni de `app`.

## Où sont les tests ?

`__tests__/worklet-timeline-engine.test.ts` couvre l’horloge à l’échantillon,
les boucles autonomes, les seeks, les paramètres actifs et la stabilité DSP.
`__tests__/audio-worklet-transport.test.ts` vérifie que le thread principal
transfère une timeline unique et n’envoie aucun événement par note.
