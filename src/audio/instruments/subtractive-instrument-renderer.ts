import {
  AUDIO_CONSTANTS,
} from "../../config/program-constants";
import type {
  AudioEngineConfig,
  VoiceId,
} from "../../domain/model";
import type {
  PlaybackVoiceSnapshot,
} from "../contracts";
import {
  resolveNoteEnvelopePeakLevel,
} from "../note-dynamics";
import type {
  ActiveInstrumentVoice,
  InstrumentRenderer,
  InstrumentScheduleRequest,
} from "./contracts";

/** Builds and owns oscillator-based voices for subtractive instruments. */
export class SubtractiveInstrumentRenderer
  implements InstrumentRenderer {
  public readonly kind = "subtractive" as const;

  public getMaximumPolyphony(
    voice: PlaybackVoiceSnapshot,
    engineConfig: AudioEngineConfig,
  ): number {
    return Math.min(
      voice.instrument.polyphony,
      engineConfig.maxPolyphonyPerVoice,
    );
  }

  public schedule(
    request: InstrumentScheduleRequest,
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
    const instrument = event.voice.instrument;
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
      event.voice.voiceId,
      oscillator,
      filter,
      envelopeGain,
      startAudioTimeSeconds,
      stopAudioTimeSeconds,
      onEnded,
    );

    oscillator.type = instrument.oscillatorWaveform;
    oscillator.frequency.setValueAtTime(
      midiPitchToFrequency(event.pitch, tuningFrequencyHz),
      startAudioTimeSeconds,
    );
    oscillator.detune.setValueAtTime(
      instrument.oscillatorDetuneCents,
      startAudioTimeSeconds,
    );

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      Math.min(
        instrument.filterCutoffHz,
        context.sampleRate * 0.49,
      ),
      startAudioTimeSeconds,
    );
    filter.Q.setValueAtTime(
      instrument.filterResonance,
      startAudioTimeSeconds,
    );

    scheduleEnvelope(
      envelopeGain.gain,
      resolveNoteEnvelopePeakLevel(event.velocity),
      startAudioTimeSeconds,
      noteEndAudioTimeSeconds,
      instrument.envelope.attackSeconds,
      instrument.envelope.decaySeconds,
      instrument.envelope.sustainLevel,
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
}

class SubtractiveActiveVoice implements ActiveInstrumentVoice {
  public ended = false;

  public constructor(
    public readonly occurrenceId: string,
    public readonly voiceId: VoiceId,
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

function scheduleEnvelope(
  parameter: AudioParam,
  peakLevel: number,
  startAudioTimeSeconds: number,
  noteEndAudioTimeSeconds: number,
  attackSeconds: number,
  decaySeconds: number,
  sustainLevel: number,
  releaseSeconds: number,
): void {
  const attackEnd = startAudioTimeSeconds + attackSeconds;
  const decayEnd = attackEnd + decaySeconds;
  const sustainGain = peakLevel * sustainLevel;
  let noteOffGain = sustainGain;

  parameter.cancelScheduledValues(startAudioTimeSeconds);
  parameter.setValueAtTime(0, startAudioTimeSeconds);

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
      noteOffGain = calculateExponentialApproach(
        0,
        peakLevel,
        noteEndAudioTimeSeconds - startAudioTimeSeconds,
        attackTimeConstant,
      );
      parameter.setValueAtTime(noteOffGain, noteEndAudioTimeSeconds);
    } else {
      parameter.setValueAtTime(peakLevel, attackEnd);
    }
  } else {
    parameter.setValueAtTime(peakLevel, startAudioTimeSeconds);
  }

  if (noteEndAudioTimeSeconds > attackEnd) {
    if (decaySeconds > 0 && noteEndAudioTimeSeconds < decayEnd) {
      const decayTimeConstant =
        decaySeconds
        / AUDIO_CONSTANTS.envelopeTimeConstantDivisor;

      parameter.setTargetAtTime(
        sustainGain,
        attackEnd,
        decayTimeConstant,
      );
      noteOffGain = calculateExponentialApproach(
        peakLevel,
        sustainGain,
        noteEndAudioTimeSeconds - attackEnd,
        decayTimeConstant,
      );
      parameter.setValueAtTime(noteOffGain, noteEndAudioTimeSeconds);
    } else {
      if (decaySeconds > 0) {
        parameter.setTargetAtTime(
          sustainGain,
          attackEnd,
          decaySeconds / AUDIO_CONSTANTS.envelopeTimeConstantDivisor,
        );
        parameter.setValueAtTime(sustainGain, decayEnd);
      } else {
        parameter.setValueAtTime(sustainGain, attackEnd);
      }

      parameter.setValueAtTime(sustainGain, noteEndAudioTimeSeconds);
    }
  }

  parameter.setValueAtTime(noteOffGain, noteEndAudioTimeSeconds);

  if (releaseSeconds > 0) {
    parameter.setTargetAtTime(
      0,
      noteEndAudioTimeSeconds,
      releaseSeconds / AUDIO_CONSTANTS.envelopeTimeConstantDivisor,
    );
    parameter.setValueAtTime(
      0,
      noteEndAudioTimeSeconds + releaseSeconds,
    );
  } else {
    parameter.setValueAtTime(0, noteEndAudioTimeSeconds);
  }
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
