# Audio

> **État courant.** Ce guide décrit la zone présente dans le worktree. Pour une
> tâche de migration, commencer par
> [`../../docs/migration/README.md`](../../docs/migration/README.md) et vérifier
> `STATUS.md` avant d'utiliser un propriétaire cible.

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

Le chargement initial et les changements de source transfèrent une timeline
complète. Ensuite, pan, gain, mute, solo, tuning, transport et configuration
d’instrument passent par des commandes légères. Seul un changement d’événements
transfère à nouveau les tableaux de notes, instrument par instrument. Chaque
message porte une version de protocole ; les mutations portent aussi la séquence
de timeline et une version d’état monotone, afin qu’une commande tardive ne
modifie pas un remplacement ou un clip préchargé déjà activé.

Le worklet avance le tick depuis le nombre d’échantillons rendus : aucun timer,
frame React ou callback du thread principal ne déclenche une note.

Le cœur évite les allocations temporaires dans `process()`, borne la polyphonie
globale pour les processeurs mobiles et utilise des oscillateurs PolyBLEP pour
limiter l’aliasing. Le vol de voix réaffecte la voix existante avec continuité :
un release audible compte donc dans la polyphonie et un instrument monophonique
ne produit jamais deux voix simultanées. Un index
d’intervalles transféré avec chaque piste permet de retrouver les notes tenues
après un seek sans parcourir toute la timeline sur le thread audio.

Les oscillateurs sont validés sur les 128 notes MIDI par des golden metrics
(DC fenêtré, RMS, peak et énergie spectrale hors harmoniques), pas par des
snapshots de buffers audio. Le triangle emploie une fuite d’intégrateur relative
à sa période afin de conserver son niveau dans le grave. Pour les pulses, les
fronts sont maintenus à au moins un échantillon l’un de l’autre lorsque la
largeur demandée n’est plus représentable, ce qui stabilise les largeurs 5/95 %
dans l’aigu sans ajouter d’allocation ni de suréchantillonnage.

`__tests__/dsp-determinism-performance.test.ts` complète ces goldens sur la voix
soustractive et sur le moteur entier à 44,1, 48 et 96 kHz. Il mesure aussi la
discontinuité maximale, vérifie le rendu bit-déterministe et impose, à 48 kHz,
des budgets médians par quantum de 0,25 ms, 0,9 ms et 2,4 ms pour respectivement
1, 8 et 24 voix. Les buffers sont préalloués et un garde interdit les
allocations par constructeurs usuels pendant `process()`.

## Politique de prévisualisation des paramètres

La matrice canonique se trouve dans `instrument-preview-policy.ts`. Une
annulation renvoie la configuration publiée au worklet ; les paramètres actifs
reviennent alors à leur valeur d’origine avec la même rampe de 10 ms.

| Comportement | Paramètres |
| --- | --- |
| Actif avec lissage | Tuning master, detune, pulse width, sustain et courbe des deux enveloppes, cutoff, résonance, key tracking, quantité d’enveloppe de filtre |
| Prochaine note seulement | Waveform, polyphonie, phase libre, attack/decay/release des deux enveloppes |
| Redémarrage du processeur requis | Type d’instrument (`kind`) ; ce changement n’est actuellement pas exposé par l’éditeur |

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
`__tests__/audio-worklet-transport.test.ts` vérifie les transferts différentiels,
le versionnage et les courses entre commandes, remplacements et clips
préchargés.
