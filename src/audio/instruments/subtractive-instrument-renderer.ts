import {
  AUDIO_CONSTANTS,
} from "../../config/audio-config";
import type {
  SubtractivePlaybackInstrumentSnapshot,
} from "../playback-model";
import {
  type AudioEngineConfig,
} from "../audio-engine-config";
import {
  type InstrumentId,
} from "../../domain/identifiers";
import {
  resolveNoteEnvelopePeakLevel,
} from "../note-dynamics";
import type {
  ActiveInstrumentVoice,
  InstrumentRenderer,
  InstrumentScheduleRequest,
} from "./instrument-renderer";

/** Builds and owns oscillator-based voices for subtractive instruments. */
export class SubtractiveInstrumentRenderer
  implements InstrumentRenderer<SubtractivePlaybackInstrumentSnapshot> {
  public readonly kind = "subtractive" as const;
  private readonly pulseWavesByContext =
    new WeakMap<AudioContext, Map<number, PeriodicWave>>();

  public getMaximumPolyphony(
    instrument: SubtractivePlaybackInstrumentSnapshot,
    engineConfig: AudioEngineConfig,
  ): number {
    return Math.min(
      instrument.instrument.polyphony,
      engineConfig.maximumRendererPolyphony,
    );
  }

  public schedule(
    request: InstrumentScheduleRequest<SubtractivePlaybackInstrumentSnapshot>,
  ): ActiveInstrumentVoice {
    const {
      context,
      destination,
      event,
      startAudioTimeSeconds,
      noteEndAudioTimeSeconds,
      tuningFrequencyHz,
      releaseTailSeconds,
      onEnded,
    } = request;
    const instrument = event.instrument.instrument;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const envelopeGain = context.createGain();
    const releaseSeconds = Math.min(
      instrument.envelope.releaseSeconds,
      releaseTailSeconds,
    );
    const stopAudioTimeSeconds =
      noteEndAudioTimeSeconds + releaseSeconds;
    const activeVoice = new SubtractiveActiveVoice(
      event.occurrenceId,
      event.instrument.instrumentId,
      oscillator,
      filter,
      envelopeGain,
      startAudioTimeSeconds,
      stopAudioTimeSeconds,
      onEnded,
    );

    this.configureOscillator(
      context,
      oscillator,
      instrument.oscillatorWaveform,
      instrument.pulseWidth,
    );
    oscillator.frequency.setValueAtTime(
      midiPitchToFrequency(event.pitch, tuningFrequencyHz),
      startAudioTimeSeconds,
    );
    oscillator.detune.setValueAtTime(
      instrument.oscillatorDetuneCents,
      startAudioTimeSeconds,
    );

    filter.type = "lowpass";
    filter.Q.setValueAtTime(
      instrument.filterResonance,
      startAudioTimeSeconds,
    );

    const baseFilterFrequency = clampFilterFrequency(
      instrument.filterCutoffHz,
      context.sampleRate,
    );
    const peakFilterFrequency = clampFilterFrequency(
      baseFilterFrequency
        * 2 ** instrument.filterEnvelopeAmountOctaves,
      context.sampleRate,
    );
    const sustainFilterFrequency = clampFilterFrequency(
      baseFilterFrequency
        * 2 ** (
          instrument.filterEnvelopeAmountOctaves
          * instrument.filterEnvelope.sustainLevel
        ),
      context.sampleRate,
    );
    const amplitudePeakLevel = resolveNoteEnvelopePeakLevel(
      event.velocity,
    );

    scheduleAdsrParameter(
      filter.frequency,
      baseFilterFrequency,
      peakFilterFrequency,
      sustainFilterFrequency,
      baseFilterFrequency,
      startAudioTimeSeconds,
      noteEndAudioTimeSeconds,
      instrument.filterEnvelope.attackSeconds,
      instrument.filterEnvelope.decaySeconds,
      instrument.filterEnvelope.releaseSeconds,
    );

    scheduleAdsrParameter(
      envelopeGain.gain,
      0,
      amplitudePeakLevel,
      amplitudePeakLevel * instrument.envelope.sustainLevel,
      0,
      startAudioTimeSeconds,
      noteEndAudioTimeSeconds,
      instrument.envelope.attackSeconds,
      instrument.envelope.decaySeconds,
      releaseSeconds,
    );

    oscillator.connect(filter);
    filter.connect(envelopeGain);
    envelopeGain.connect(destination);
    oscillator.start(startAudioTimeSeconds);
    oscillator.stop(
      stopAudioTimeSeconds + AUDIO_CONSTANTS.minimumNoteSeconds,
    );

    return activeVoice;
  }

  private configureOscillator(
    context: AudioContext,
    oscillator: OscillatorNode,
    waveform: OscillatorType,
    pulseWidth: number,
  ): void {
    if (
      waveform !== "square"
      || Math.abs(pulseWidth - 0.5) < 0.000_001
    ) {
      oscillator.type = waveform;
      return;
    }

    let wavesByWidth = this.pulseWavesByContext.get(context);

    if (wavesByWidth === undefined) {
      wavesByWidth = new Map<number, PeriodicWave>();
      this.pulseWavesByContext.set(context, wavesByWidth);
    }

    const normalizedPulseWidth = Number(pulseWidth.toFixed(4));
    let periodicWave = wavesByWidth.get(normalizedPulseWidth);

    if (periodicWave === undefined) {
      periodicWave = createPulseWave(context, normalizedPulseWidth);
      wavesByWidth.set(normalizedPulseWidth, periodicWave);
    }

    oscillator.setPeriodicWave(periodicWave);
  }
}

class SubtractiveActiveVoice implements ActiveInstrumentVoice {
  public ended = false;

  public constructor(
    public readonly occurrenceId: string,
    public readonly instrumentId: InstrumentId,
    private readonly oscillator: OscillatorNode,
    private readonly filter: BiquadFilterNode,
    private readonly envelopeGain: GainNode,
    public readonly startAudioTimeSeconds: number,
    public stopAudioTimeSeconds: number,
    private readonly onEnded: (occurrenceId: string) => void,
  ) {
    oscillator.onended = (): void => {
      this.finish();
    };
  }

  public stop(atAudioTimeSeconds: number): void {
    if (this.ended) {
      return;
    }

    const stopTime =
      atAudioTimeSeconds + AUDIO_CONSTANTS.cancellationFadeSeconds;
    const gain = this.envelopeGain.gain;

    holdAudioParam(gain, atAudioTimeSeconds);
    gain.linearRampToValueAtTime(0, stopTime);

    try {
      this.oscillator.stop(
        stopTime + AUDIO_CONSTANTS.minimumNoteSeconds,
      );
    } catch {
      this.finish();
    }

    this.stopAudioTimeSeconds = stopTime;
  }

  public cancelBeforeStart(atAudioTimeSeconds: number): void {
    if (this.ended) {
      return;
    }

    const stopTime =
      atAudioTimeSeconds + AUDIO_CONSTANTS.minimumNoteSeconds;
    const gain = this.envelopeGain.gain;

    gain.cancelScheduledValues(atAudioTimeSeconds);
    gain.setValueAtTime(0, atAudioTimeSeconds);

    try {
      this.oscillator.stop(stopTime);
    } catch {
      this.finish();
    }

    this.stopAudioTimeSeconds = stopTime;
  }

  private finish(): void {
    if (this.ended) {
      return;
    }

    this.ended = true;
    this.oscillator.disconnect();
    this.filter.disconnect();
    this.envelopeGain.disconnect();
    this.onEnded(this.occurrenceId);
  }
}

function scheduleAdsrParameter(
  parameter: AudioParam,
  startValue: number,
  peakLevel: number,
  sustainValue: number,
  releaseValue: number,
  startAudioTimeSeconds: number,
  noteEndAudioTimeSeconds: number,
  attackSeconds: number,
  decaySeconds: number,
  releaseSeconds: number,
): void {
  const attackEnd = startAudioTimeSeconds + attackSeconds;
  const decayEnd = attackEnd + decaySeconds;
  let noteOffValue = startValue;

  parameter.cancelScheduledValues(startAudioTimeSeconds);
  parameter.setValueAtTime(startValue, startAudioTimeSeconds);

  if (attackSeconds > 0) {
    const attackTimeConstant =
      attackSeconds
      / AUDIO_CONSTANTS.envelopeTimeConstantDivisor;

    parameter.setTargetAtTime(
      peakLevel,
      startAudioTimeSeconds,
      attackTimeConstant,
    );

    if (noteEndAudioTimeSeconds < attackEnd) {
      noteOffValue = calculateExponentialApproach(
        startValue,
        peakLevel,
        noteEndAudioTimeSeconds - startAudioTimeSeconds,
        attackTimeConstant,
      );
      parameter.setValueAtTime(noteOffValue, noteEndAudioTimeSeconds);
    } else {
      parameter.setValueAtTime(peakLevel, attackEnd);
      noteOffValue = peakLevel;
    }
  } else {
    parameter.setValueAtTime(peakLevel, startAudioTimeSeconds);
    noteOffValue = peakLevel;
  }

  if (noteEndAudioTimeSeconds > attackEnd) {
    if (decaySeconds > 0 && noteEndAudioTimeSeconds < decayEnd) {
      const decayTimeConstant =
        decaySeconds
        / AUDIO_CONSTANTS.envelopeTimeConstantDivisor;

      parameter.setTargetAtTime(
        sustainValue,
        attackEnd,
        decayTimeConstant,
      );
      noteOffValue = calculateExponentialApproach(
        peakLevel,
        sustainValue,
        noteEndAudioTimeSeconds - attackEnd,
        decayTimeConstant,
      );
      parameter.setValueAtTime(noteOffValue, noteEndAudioTimeSeconds);
    } else {
      if (decaySeconds > 0) {
        parameter.setTargetAtTime(
          sustainValue,
          attackEnd,
          decaySeconds / AUDIO_CONSTANTS.envelopeTimeConstantDivisor,
        );
        parameter.setValueAtTime(sustainValue, decayEnd);
      } else {
        parameter.setValueAtTime(sustainValue, attackEnd);
      }

      noteOffValue = sustainValue;
      parameter.setValueAtTime(sustainValue, noteEndAudioTimeSeconds);
    }
  }

  parameter.setValueAtTime(noteOffValue, noteEndAudioTimeSeconds);

  if (releaseSeconds > 0) {
    parameter.setTargetAtTime(
      releaseValue,
      noteEndAudioTimeSeconds,
      releaseSeconds / AUDIO_CONSTANTS.envelopeTimeConstantDivisor,
    );
    parameter.setValueAtTime(
      releaseValue,
      noteEndAudioTimeSeconds + releaseSeconds,
    );
  } else {
    parameter.setValueAtTime(releaseValue, noteEndAudioTimeSeconds);
  }
}

function clampFilterFrequency(
  frequencyHz: number,
  sampleRate: number,
): number {
  return Math.min(
    Math.max(20, frequencyHz),
    sampleRate * 0.49,
  );
}

function createPulseWave(
  context: AudioContext,
  pulseWidth: number,
): PeriodicWave {
  const harmonicCount = 64;
  const real = new Float32Array(harmonicCount + 1);
  const imaginary = new Float32Array(harmonicCount + 1);

  for (
    let harmonic = 1;
    harmonic <= harmonicCount;
    harmonic += 1
  ) {
    const phase = 2 * Math.PI * harmonic * pulseWidth;
    const scale = 2 / (Math.PI * harmonic);

    real[harmonic] = scale * Math.sin(phase);
    imaginary[harmonic] = scale * (1 - Math.cos(phase));
  }

  return context.createPeriodicWave(real, imaginary);
}

function calculateExponentialApproach(
  initialValue: number,
  targetValue: number,
  elapsedSeconds: number,
  timeConstantSeconds: number,
): number {
  return targetValue
    + (initialValue - targetValue)
      * Math.exp(-elapsedSeconds / timeConstantSeconds);
}

function holdAudioParam(
  parameter: AudioParam,
  atAudioTimeSeconds: number,
): void {
  try {
    parameter.cancelAndHoldAtTime(atAudioTimeSeconds);
  } catch {
    parameter.cancelScheduledValues(atAudioTimeSeconds);
    parameter.setValueAtTime(
      parameter.value,
      atAudioTimeSeconds,
    );
  }
}

function midiPitchToFrequency(
  pitch: number,
  tuningFrequencyHz: number,
): number {
  return tuningFrequencyHz * 2 ** ((pitch - 69) / 12);
}
