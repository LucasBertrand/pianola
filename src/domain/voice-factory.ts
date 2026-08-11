import {
  PROJECT_CONSTANTS,
  VOICE_CONSTANTS,
} from "../config/program-constants";
import type {
  ClipVoiceState,
  InstrumentConfig,
  OscillatorWaveform,
  SubtractiveSynthConfig,
  Voice,
  VoiceId,
} from "./model";

export interface CreateDefaultVoiceOptions {
  readonly id: VoiceId;
  readonly name: string;
  readonly color: string;
}

/** Creates a global voice identity using the shared product defaults. */
export function createDefaultVoice(
  options: CreateDefaultVoiceOptions,
): Voice {
  return {
    id: options.id,
    name: options.name,
    color: options.color,
    pan: VOICE_CONSTANTS.pan,
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

/** Creates the default subtractive preset owned by one clip voice. */
export function createDefaultSubtractiveSynthConfig(
  oscillatorWaveform: OscillatorWaveform =
    VOICE_CONSTANTS.defaultOscillatorWaveform,
): SubtractiveSynthConfig {
  return {
    kind: "subtractive",
    oscillatorWaveform,
    polyphony: PROJECT_CONSTANTS.defaultSubtractiveSynthPolyphony,
    oscillatorDetuneCents: VOICE_CONSTANTS.oscillatorDetuneCents,
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
  };
}

/** Creates mutable-independent defaults for one voice inside one clip. */
export function createDefaultClipVoiceState(
  oscillatorWaveform?: OscillatorWaveform,
): ClipVoiceState {
  return {
    gain: PROJECT_CONSTANTS.defaultClipVoiceGain,
    muted: PROJECT_CONSTANTS.defaultClipVoiceMuted,
    locked: PROJECT_CONSTANTS.defaultClipVoiceLocked,
    solo: PROJECT_CONSTANTS.defaultClipVoiceSolo,
    instrument: createDefaultSubtractiveSynthConfig(
      oscillatorWaveform,
    ),
  };
}

/** Clones a preset without leaking nested references between clips. */
export function cloneInstrumentConfig(
  instrument: InstrumentConfig,
): InstrumentConfig {
  switch (instrument.kind) {
    case "subtractive":
      return {
        ...instrument,
        envelope: { ...instrument.envelope },
        filterEnvelope: { ...instrument.filterEnvelope },
      };
  }
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
