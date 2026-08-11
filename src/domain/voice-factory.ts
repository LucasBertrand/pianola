import {
  PROJECT_CONSTANTS,
  VOICE_CONSTANTS,
} from "../config/program-constants";
import type {
  OscillatorWaveform,
  Voice,
  VoiceId,
} from "./model";

export interface CreateDefaultVoiceOptions {
  readonly id: VoiceId;
  readonly name: string;
  readonly color: string;
  readonly oscillatorWaveform?: OscillatorWaveform;
}

/** Creates a complete voice using the shared product defaults. */
export function createDefaultVoice(
  options: CreateDefaultVoiceOptions,
): Voice {
  return {
    id: options.id,
    name: options.name,
    color: options.color,
    muted: VOICE_CONSTANTS.muted,
    locked: VOICE_CONSTANTS.locked,
    solo: VOICE_CONSTANTS.solo,
    gain: VOICE_CONSTANTS.gain,
    pan: VOICE_CONSTANTS.pan,
    instrument: {
      kind: "subtractive",
      oscillatorWaveform:
        options.oscillatorWaveform
        ?? VOICE_CONSTANTS.defaultOscillatorWaveform,
      polyphony: PROJECT_CONSTANTS.defaultSubtractiveSynthPolyphony,
      oscillatorDetuneCents:
        VOICE_CONSTANTS.oscillatorDetuneCents,
      pulseWidth: VOICE_CONSTANTS.pulseWidth,
      envelope: {
        attackSeconds: VOICE_CONSTANTS.attackSeconds,
        decaySeconds: VOICE_CONSTANTS.decaySeconds,
        sustainLevel: VOICE_CONSTANTS.sustainLevel,
        releaseSeconds: VOICE_CONSTANTS.releaseSeconds,
      },
      filterCutoffHz: VOICE_CONSTANTS.filterCutoffHz,
      filterResonance: VOICE_CONSTANTS.filterResonance,
      filterEnvelopeAmountOctaves:
        VOICE_CONSTANTS.filterEnvelopeAmountOctaves,
      filterEnvelope: {
        attackSeconds: VOICE_CONSTANTS.filterAttackSeconds,
        decaySeconds: VOICE_CONSTANTS.filterDecaySeconds,
        sustainLevel: VOICE_CONSTANTS.filterSustainLevel,
        releaseSeconds: VOICE_CONSTANTS.filterReleaseSeconds,
      },
    },
    effects: [],
    generativeRules: [],
    interpretation: {
      transposeSemitones:
        VOICE_CONSTANTS.transposeSemitones,
      timingOffsetTicks:
        VOICE_CONSTANTS.timingOffsetTicks,
      gateRatio: VOICE_CONSTANTS.gateRatio,
      velocityScale: VOICE_CONSTANTS.velocityScale,
      probability: VOICE_CONSTANTS.probability,
    },
  };
}

/** Cycles through the four oscillator shapes used for generated voices. */
export function getDefaultOscillatorWaveform(
  voiceIndex: number,
): OscillatorWaveform {
  const sequence = VOICE_CONSTANTS.oscillatorWaveformCycle;

  return sequence[
    voiceIndex % sequence.length
  ] ?? VOICE_CONSTANTS.defaultOscillatorWaveform;
}
