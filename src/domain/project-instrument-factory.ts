import {
  PROJECT_CONSTANTS,
  INSTRUMENT_CONSTANTS,
} from "../config/program-constants";
import type {
  ClipInstrumentState,
  InstrumentConfig,
  OscillatorWaveform,
  SubtractiveSynthConfig,
  ProjectInstrument,
  InstrumentId,
} from "./model";

export interface CreateDefaultProjectInstrumentOptions {
  readonly id: InstrumentId;
  readonly name: string;
  readonly color: string;
}

/** Creates a global instrument identity using the shared product defaults. */
export function createDefaultProjectInstrument(
  options: CreateDefaultProjectInstrumentOptions,
): ProjectInstrument {
  return {
    id: options.id,
    name: options.name,
    color: options.color,
    pan: INSTRUMENT_CONSTANTS.pan,
    effects: [],
    generativeRules: [],
    interpretation: {
      transposeSemitones:
        INSTRUMENT_CONSTANTS.transposeSemitones,
      timingOffsetTicks:
        INSTRUMENT_CONSTANTS.timingOffsetTicks,
      gateRatio: INSTRUMENT_CONSTANTS.gateRatio,
      velocityScale: INSTRUMENT_CONSTANTS.velocityScale,
      probability: INSTRUMENT_CONSTANTS.probability,
    },
  };
}

/** Creates the default subtractive preset owned by one clip instrument. */
export function createDefaultSubtractiveSynthConfig(
  oscillatorWaveform: OscillatorWaveform =
    INSTRUMENT_CONSTANTS.defaultOscillatorWaveform,
): SubtractiveSynthConfig {
  return {
    kind: "subtractive",
    oscillatorWaveform,
    polyphony: PROJECT_CONSTANTS.defaultSubtractiveSynthPolyphony,
    oscillatorDetuneCents: INSTRUMENT_CONSTANTS.oscillatorDetuneCents,
    pulseWidth: INSTRUMENT_CONSTANTS.pulseWidth,
    envelope: {
      attackSeconds: INSTRUMENT_CONSTANTS.attackSeconds,
      decaySeconds: INSTRUMENT_CONSTANTS.decaySeconds,
      sustainLevel: INSTRUMENT_CONSTANTS.sustainLevel,
      releaseSeconds: INSTRUMENT_CONSTANTS.releaseSeconds,
    },
    filterCutoffHz: INSTRUMENT_CONSTANTS.filterCutoffHz,
    filterResonance: INSTRUMENT_CONSTANTS.filterResonance,
    filterEnvelopeAmountOctaves:
      INSTRUMENT_CONSTANTS.filterEnvelopeAmountOctaves,
    filterEnvelope: {
      attackSeconds: INSTRUMENT_CONSTANTS.filterAttackSeconds,
      decaySeconds: INSTRUMENT_CONSTANTS.filterDecaySeconds,
      sustainLevel: INSTRUMENT_CONSTANTS.filterSustainLevel,
      releaseSeconds: INSTRUMENT_CONSTANTS.filterReleaseSeconds,
    },
  };
}

/** Creates mutable-independent defaults for one instrument inside one clip. */
export function createDefaultClipInstrumentState(
  oscillatorWaveform?: OscillatorWaveform,
): ClipInstrumentState {
  return {
    gain: PROJECT_CONSTANTS.defaultClipInstrumentGain,
    muted: PROJECT_CONSTANTS.defaultClipInstrumentMuted,
    locked: PROJECT_CONSTANTS.defaultClipInstrumentLocked,
    solo: PROJECT_CONSTANTS.defaultClipInstrumentSolo,
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

/** Cycles through the four oscillator shapes used for generated instruments. */
export function getDefaultOscillatorWaveform(
  instrumentIndex: number,
): OscillatorWaveform {
  const sequence = INSTRUMENT_CONSTANTS.oscillatorWaveformCycle;

  return sequence[
    instrumentIndex % sequence.length
  ] ?? INSTRUMENT_CONSTANTS.defaultOscillatorWaveform;
}
