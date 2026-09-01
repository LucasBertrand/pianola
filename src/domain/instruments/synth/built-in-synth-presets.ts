import type {
  PresetId,
} from "../../identifiers";
import {
  PROJECT_CONSTANTS,
} from "../../project/project-constants";
import type {
  AdsrEnvelope,
} from "../synth/synth-envelope";
import type {
  SynthConfig,
} from "../synth/synth-config";
import {
  SYNTH_CONSTANTS,
} from "../synth/synth-constants";
import type {
  InstrumentPreset,
} from "../presets/instrument-preset";
import {
  cloneSynthConfig,
} from "../presets/instrument-preset";

export const DEFAULT_INSTRUMENT_PRESET_ID = "synth-sawtooth";

const BUILT_IN_PRESETS = Object.freeze([
  createSynthPreset(DEFAULT_INSTRUMENT_PRESET_ID, "Sawtooth", createSynthConfig()),
  createSynthPreset("synth-sine", "Sine", createSynthConfig({
    oscillatorWaveform: "sine",
    filterCutoffHz: 12_000,
    filterEnvelopeAmountOctaves: 0.25,
  })),
  createSynthPreset("synth-triangle", "Triangle", createSynthConfig({
    oscillatorWaveform: "triangle",
    filterCutoffHz: 10_000,
    filterEnvelopeAmountOctaves: 0.25,
  })),
  createSynthPreset("synth-warm-pad", "Pad", createSynthConfig({
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
  })),
  createSynthPreset("synth-pulse-bass", "Pulse Bass", createSynthConfig({
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
  })),
  createSynthPreset("synth-bright-pluck", "Bright Pluck", createSynthConfig({
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
  })),
  createSynthPreset("lead-sawtooth", "Lead", createSynthConfig({
    oscillatorWaveform: "sawtooth",
    filterCutoffHz: 12_000,
    filterEnvelopeAmountOctaves: 0.25,
  })),
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
  readonly instrumentPresetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly instrumentPresetOrder: readonly PresetId[];
}

const DEFAULT_INSTRUMENT_PRESET_LIBRARY = Object.freeze({
  instrumentPresetsById: BUILT_IN_PRESETS_BY_ID,
  instrumentPresetOrder: BUILT_IN_PRESET_ORDER,
}) satisfies InstrumentPresetLibrary;

export function createDefaultInstrumentPresetLibrary(): InstrumentPresetLibrary {
  return DEFAULT_INSTRUMENT_PRESET_LIBRARY;
}

export function getDefaultInstrumentPresetId(instrumentIndex: number): PresetId {
  return selectInstrumentPresetId(BUILT_IN_PRESET_ORDER, instrumentIndex);
}

export function createInstrumentConfigFromPreset(
  preset: InstrumentPreset,
): SynthConfig {
  return cloneSynthConfig(preset.config);
}

export function createDefaultInstrumentConfig(
  instrumentIndex: number,
): SynthConfig {
  const presetId = getDefaultInstrumentPresetId(instrumentIndex);
  const preset = BUILT_IN_PRESETS_BY_ID[presetId];

  if (preset === undefined) {
    throw new Error(`Instrument preset "${presetId}" is unavailable.`);
  }

  return createInstrumentConfigFromPreset(preset);
}

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

function createSynthPreset(
  id: PresetId,
  name: string,
  config: SynthConfig,
): InstrumentPreset {
  return Object.freeze({ id, name, kind: "synth", config });
}

function createSynthConfig(
  changes: Partial<Omit<SynthConfig, "envelope" | "filterEnvelope">> & {
    readonly envelope?: Partial<AdsrEnvelope>;
    readonly filterEnvelope?: Partial<AdsrEnvelope>;
  } = {},
): SynthConfig {
  const defaultEnvelope = {
    attackSeconds: SYNTH_CONSTANTS.attackSeconds,
    decaySeconds: SYNTH_CONSTANTS.decaySeconds,
    sustainLevel: SYNTH_CONSTANTS.sustainLevel,
    releaseSeconds: SYNTH_CONSTANTS.releaseSeconds,
    curve: SYNTH_CONSTANTS.envelopeCurve,
  };
  const defaultFilterEnvelope = {
    attackSeconds: SYNTH_CONSTANTS.filterAttackSeconds,
    decaySeconds: SYNTH_CONSTANTS.filterDecaySeconds,
    sustainLevel: SYNTH_CONSTANTS.filterSustainLevel,
    releaseSeconds: SYNTH_CONSTANTS.filterReleaseSeconds,
    curve: SYNTH_CONSTANTS.envelopeCurve,
  };

  return Object.freeze({
    kind: "synth",
    oscillatorWaveform:
      changes.oscillatorWaveform ?? SYNTH_CONSTANTS.defaultOscillatorWaveform,
    polyphony: changes.polyphony ?? PROJECT_CONSTANTS.defaultSynthPolyphony,
    oscillatorDetuneCents:
      changes.oscillatorDetuneCents ?? SYNTH_CONSTANTS.oscillatorDetuneCents,
    oscillatorFreePhase:
      changes.oscillatorFreePhase ?? SYNTH_CONSTANTS.oscillatorFreePhase,
    pulseWidth: changes.pulseWidth ?? SYNTH_CONSTANTS.pulseWidth,
    envelope: Object.freeze({ ...defaultEnvelope, ...changes.envelope }),
    filterCutoffHz:
      changes.filterCutoffHz ?? SYNTH_CONSTANTS.filterCutoffHz,
    filterResonance:
      changes.filterResonance ?? SYNTH_CONSTANTS.filterResonance,
    filterKeyTracking:
      changes.filterKeyTracking ?? SYNTH_CONSTANTS.filterKeyTracking,
    filterEnvelopeAmountOctaves:
      changes.filterEnvelopeAmountOctaves
      ?? SYNTH_CONSTANTS.filterEnvelopeAmountOctaves,
    filterEnvelope: Object.freeze({
      ...defaultFilterEnvelope,
      ...changes.filterEnvelope,
    }),
  });
}
