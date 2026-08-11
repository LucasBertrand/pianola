import {
  INSTRUMENT_CONSTANTS,
  PROJECT_CONSTANTS,
} from "../config/program-constants";
import type {
  InstrumentPreset,
  PresetId,
  SubtractiveSynthConfig,
} from "./model";

export const DEFAULT_INSTRUMENT_PRESET_ID =
  "subtractive-sawtooth";

const BUILT_IN_PRESETS = Object.freeze([
  createSubtractivePreset(
    DEFAULT_INSTRUMENT_PRESET_ID,
    "Sawtooth",
    createSubtractiveConfig(),
  ),
  createSubtractivePreset(
    "subtractive-sine",
    "Sine",
    createSubtractiveConfig({
      oscillatorWaveform: "sine",
      filterCutoffHz: 12_000,
      filterEnvelopeAmountOctaves: 0.25,
    }),
  ),
  createSubtractivePreset(
    "subtractive-triangle",
    "Triangle",
    createSubtractiveConfig({
      oscillatorWaveform: "triangle",
      filterCutoffHz: 10_000,
      filterEnvelopeAmountOctaves: 0.25,
    }),
  ),
  createSubtractivePreset(
    "subtractive-warm-pad",
    "Pad",
    createSubtractiveConfig({
      oscillatorWaveform: "triangle",
      polyphony: 8,
      envelope: {
        attackSeconds: 0.25,
        decaySeconds: 1.4,
        sustainLevel: 0.78,
        releaseSeconds: 2,
      },
      filterCutoffHz: 2_500,
      filterResonance: 0.8,
      filterEnvelopeAmountOctaves: 1.5,
      filterEnvelope: {
        attackSeconds: 0.6,
        decaySeconds: 1.8,
        sustainLevel: 0.45,
        releaseSeconds: 1.8,
      },
    }),
  ),
  createSubtractivePreset(
    "subtractive-pulse-bass",
    "Pulse Bass",
    createSubtractiveConfig({
      oscillatorWaveform: "square",
      polyphony: 1,
      pulseWidth: 0.28,
      envelope: {
        attackSeconds: 0.005,
        decaySeconds: 0.22,
        sustainLevel: 0.62,
        releaseSeconds: 0.16,
      },
      filterCutoffHz: 750,
      filterResonance: 4.5,
      filterEnvelopeAmountOctaves: 3.5,
      filterEnvelope: {
        attackSeconds: 0.005,
        decaySeconds: 0.28,
        sustainLevel: 0.12,
        releaseSeconds: 0.18,
      },
    }),
  ),
  createSubtractivePreset(
    "subtractive-bright-pluck",
    "Bright Pluck",
    createSubtractiveConfig({
      polyphony: 6,
      envelope: {
        attackSeconds: 0.002,
        decaySeconds: 0.16,
        sustainLevel: 0.18,
        releaseSeconds: 0.24,
      },
      filterCutoffHz: 4_800,
      filterResonance: 1.4,
      filterEnvelopeAmountOctaves: 3,
      filterEnvelope: {
        attackSeconds: 0.002,
        decaySeconds: 0.2,
        sustainLevel: 0.08,
        releaseSeconds: 0.2,
      },
    }),
  ),
] satisfies readonly InstrumentPreset[]);

const BUILT_IN_PRESET_ORDER = Object.freeze(
  BUILT_IN_PRESETS.map((preset) => preset.id),
);

const BUILT_IN_PRESETS_BY_ID = Object.freeze(
  Object.fromEntries(
    BUILT_IN_PRESETS.map((preset) => [preset.id, preset]),
  ) as Readonly<Record<PresetId, InstrumentPreset>>,
);

export interface InstrumentPresetLibrary {
  readonly instrumentPresetsById: Readonly<
    Record<PresetId, InstrumentPreset>
  >;
  readonly instrumentPresetOrder: readonly PresetId[];
}

const DEFAULT_INSTRUMENT_PRESET_LIBRARY = Object.freeze({
  instrumentPresetsById: BUILT_IN_PRESETS_BY_ID,
  instrumentPresetOrder: BUILT_IN_PRESET_ORDER,
}) satisfies InstrumentPresetLibrary;

/** Returns the immutable built-in preset library used by a new project. */
export function createDefaultInstrumentPresetLibrary(): InstrumentPresetLibrary {
  return DEFAULT_INSTRUMENT_PRESET_LIBRARY;
}

/** Selects a stable default preset while generated instruments are created. */
export function getDefaultInstrumentPresetId(
  instrumentIndex: number,
): PresetId {
  return selectInstrumentPresetId(
    BUILT_IN_PRESET_ORDER,
    instrumentIndex,
  );
}

/** Returns an independent instrument configuration initialized from a preset. */
export function createInstrumentConfigFromPreset(
  preset: InstrumentPreset,
): SubtractiveSynthConfig {
  return {
    ...preset.config,
    envelope: { ...preset.config.envelope },
    filterEnvelope: { ...preset.config.filterEnvelope },
  };
}

/** Creates the deterministic built-in configuration used by generated instruments. */
export function createDefaultInstrumentConfig(
  instrumentIndex: number,
): SubtractiveSynthConfig {
  const presetId = getDefaultInstrumentPresetId(instrumentIndex);
  const preset = BUILT_IN_PRESETS_BY_ID[presetId];

  if (preset === undefined) {
    throw new Error(`Instrument preset "${presetId}" is unavailable.`);
  }

  return createInstrumentConfigFromPreset(preset);
}

/** Selects a preset deterministically from a validated project order. */
export function selectInstrumentPresetId(
  presetOrder: readonly PresetId[],
  instrumentIndex: number,
): PresetId {
  const presetId = presetOrder[instrumentIndex % presetOrder.length];

  if (presetId === undefined) {
    throw new Error("A project must contain at least one instrument preset.");
  }

  return presetId;
}

function createSubtractivePreset(
  id: PresetId,
  name: string,
  config: SubtractiveSynthConfig,
): InstrumentPreset {
  return Object.freeze({
    id,
    name,
    kind: "subtractive",
    config,
  });
}

function createSubtractiveConfig(
  changes: Partial<SubtractiveSynthConfig> = {},
): SubtractiveSynthConfig {
  const defaultEnvelope = {
    attackSeconds: INSTRUMENT_CONSTANTS.attackSeconds,
    decaySeconds: INSTRUMENT_CONSTANTS.decaySeconds,
    sustainLevel: INSTRUMENT_CONSTANTS.sustainLevel,
    releaseSeconds: INSTRUMENT_CONSTANTS.releaseSeconds,
  };
  const defaultFilterEnvelope = {
    attackSeconds: INSTRUMENT_CONSTANTS.filterAttackSeconds,
    decaySeconds: INSTRUMENT_CONSTANTS.filterDecaySeconds,
    sustainLevel: INSTRUMENT_CONSTANTS.filterSustainLevel,
    releaseSeconds: INSTRUMENT_CONSTANTS.filterReleaseSeconds,
  };

  return Object.freeze({
    kind: "subtractive",
    oscillatorWaveform:
      changes.oscillatorWaveform
      ?? INSTRUMENT_CONSTANTS.defaultOscillatorWaveform,
    polyphony:
      changes.polyphony
      ?? PROJECT_CONSTANTS.defaultSubtractiveSynthPolyphony,
    oscillatorDetuneCents:
      changes.oscillatorDetuneCents
      ?? INSTRUMENT_CONSTANTS.oscillatorDetuneCents,
    pulseWidth:
      changes.pulseWidth
      ?? INSTRUMENT_CONSTANTS.pulseWidth,
    envelope: Object.freeze({
      ...defaultEnvelope,
      ...changes.envelope,
    }),
    filterCutoffHz:
      changes.filterCutoffHz
      ?? INSTRUMENT_CONSTANTS.filterCutoffHz,
    filterResonance:
      changes.filterResonance
      ?? INSTRUMENT_CONSTANTS.filterResonance,
    filterEnvelopeAmountOctaves:
      changes.filterEnvelopeAmountOctaves
      ?? INSTRUMENT_CONSTANTS.filterEnvelopeAmountOctaves,
    filterEnvelope: Object.freeze({
      ...defaultFilterEnvelope,
      ...changes.filterEnvelope,
    }),
  });
}
