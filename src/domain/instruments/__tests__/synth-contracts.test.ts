import { describe, expect, test } from "vitest";
import {
  createDefaultInstrumentConfig,
  createDefaultInstrumentPresetLibrary,
} from "../synth/built-in-synth-presets";
import type { SynthConfig } from "../synth/synth-config";
import { validateSynthConfig } from "../synth/synth-validation";

const DEFAULT_CONFIG: SynthConfig = {
  kind: "synth",
  oscillatorWaveform: "sawtooth",
  polyphony: 1,
  oscillatorDetuneCents: 0,
  oscillatorFreePhase: false,
  pulseWidth: 0.5,
  envelope: {
    attackSeconds: 0.012,
    decaySeconds: 0.18,
    sustainLevel: 0.72,
    releaseSeconds: 0.42,
    curve: 0.35,
  },
  filterCutoffHz: 8_000,
  filterResonance: 0.2,
  filterKeyTracking: 0,
  filterEnvelopeAmountOctaves: 1,
  filterEnvelope: {
    attackSeconds: 0.008,
    decaySeconds: 0.32,
    sustainLevel: 0.28,
    releaseSeconds: 0.36,
    curve: 0.35,
  },
};

describe("synth domain contracts", () => {
  test("keeps the exact durable default synth configuration", () => {
    expect(createDefaultInstrumentConfig(0)).toEqual(DEFAULT_CONFIG);
  });

  test("keeps every built-in preset and its exact configuration", () => {
    const library = createDefaultInstrumentPresetLibrary();

    expect(library.instrumentPresetOrder).toEqual([
      "synth-sawtooth",
      "synth-sine",
      "synth-triangle",
      "synth-warm-pad",
      "synth-pulse-bass",
      "synth-bright-pluck",
      "lead-sawtooth",
    ]);
    expect(library.instrumentPresetOrder.map((presetId) => {
      const preset = library.instrumentPresetsById[presetId];
      return preset === undefined
        ? undefined
        : { id: preset.id, name: preset.name, config: preset.config };
    })).toEqual([
      { id: "synth-sawtooth", name: "Sawtooth", config: DEFAULT_CONFIG },
      {
        id: "synth-sine",
        name: "Sine",
        config: withConfig({
          oscillatorWaveform: "sine",
          filterCutoffHz: 12_000,
          filterEnvelopeAmountOctaves: 0.25,
        }),
      },
      {
        id: "synth-triangle",
        name: "Triangle",
        config: withConfig({
          oscillatorWaveform: "triangle",
          filterCutoffHz: 10_000,
          filterEnvelopeAmountOctaves: 0.25,
        }),
      },
      {
        id: "synth-warm-pad",
        name: "Pad",
        config: withConfig({
          oscillatorWaveform: "triangle",
          polyphony: 8,
          envelope: {
            attackSeconds: 0.25,
            decaySeconds: 1.4,
            sustainLevel: 0.78,
            releaseSeconds: 2,
            curve: 0.35,
          },
          filterCutoffHz: 2_500,
          filterResonance: 0.8,
          filterEnvelopeAmountOctaves: 1.5,
          filterEnvelope: {
            attackSeconds: 0.6,
            decaySeconds: 1.8,
            sustainLevel: 0.45,
            releaseSeconds: 1.8,
            curve: 0.35,
          },
        }),
      },
      {
        id: "synth-pulse-bass",
        name: "Pulse Bass",
        config: withConfig({
          oscillatorWaveform: "square",
          polyphony: 1,
          pulseWidth: 0.28,
          envelope: {
            attackSeconds: 0.005,
            decaySeconds: 0.22,
            sustainLevel: 0.62,
            releaseSeconds: 0.16,
            curve: 0.35,
          },
          filterCutoffHz: 750,
          filterResonance: 4.5,
          filterEnvelopeAmountOctaves: 3.5,
          filterEnvelope: {
            attackSeconds: 0.005,
            decaySeconds: 0.28,
            sustainLevel: 0.12,
            releaseSeconds: 0.18,
            curve: 0.35,
          },
        }),
      },
      {
        id: "synth-bright-pluck",
        name: "Bright Pluck",
        config: withConfig({
          polyphony: 6,
          envelope: {
            attackSeconds: 0.002,
            decaySeconds: 0.16,
            sustainLevel: 0.18,
            releaseSeconds: 0.24,
            curve: 0.35,
          },
          filterCutoffHz: 4_800,
          filterResonance: 1.4,
          filterEnvelopeAmountOctaves: 3,
          filterEnvelope: {
            attackSeconds: 0.002,
            decaySeconds: 0.2,
            sustainLevel: 0.08,
            releaseSeconds: 0.2,
            curve: 0.35,
          },
        }),
      },
      {
        id: "lead-sawtooth",
        name: "Lead",
        config: withConfig({
          filterCutoffHz: 12_000,
          filterEnvelopeAmountOctaves: 0.25,
        }),
      },
    ]);
  });

  test.each([
    ["instrument.oscillatorWaveform", { oscillatorWaveform: "noise" }],
    ["instrument.polyphony", { polyphony: 0 }],
    ["instrument.oscillatorDetuneCents", { oscillatorDetuneCents: Number.NaN }],
    ["instrument.oscillatorFreePhase", { oscillatorFreePhase: 1 }],
    ["instrument.pulseWidth", { pulseWidth: 0 }],
    ["instrument.envelope.attackSeconds", { envelope: { ...DEFAULT_CONFIG.envelope, attackSeconds: -1 } }],
    ["instrument.envelope.decaySeconds", { envelope: { ...DEFAULT_CONFIG.envelope, decaySeconds: 11 } }],
    ["instrument.envelope.sustainLevel", { envelope: { ...DEFAULT_CONFIG.envelope, sustainLevel: 2 } }],
    ["instrument.envelope.releaseSeconds", { envelope: { ...DEFAULT_CONFIG.envelope, releaseSeconds: 3 } }],
    ["instrument.envelope.curve", { envelope: { ...DEFAULT_CONFIG.envelope, curve: 2 } }],
    ["instrument.filterCutoffHz", { filterCutoffHz: 0 }],
    ["instrument.filterResonance", { filterResonance: 25 }],
    ["instrument.filterKeyTracking", { filterKeyTracking: -1 }],
    ["instrument.filterEnvelopeAmountOctaves", { filterEnvelopeAmountOctaves: 9 }],
    ["instrument.filterEnvelope.attackSeconds", { filterEnvelope: { ...DEFAULT_CONFIG.filterEnvelope, attackSeconds: -1 } }],
    ["instrument.filterEnvelope.decaySeconds", { filterEnvelope: { ...DEFAULT_CONFIG.filterEnvelope, decaySeconds: 11 } }],
    ["instrument.filterEnvelope.sustainLevel", { filterEnvelope: { ...DEFAULT_CONFIG.filterEnvelope, sustainLevel: 2 } }],
    ["instrument.filterEnvelope.releaseSeconds", { filterEnvelope: { ...DEFAULT_CONFIG.filterEnvelope, releaseSeconds: 3 } }],
    ["instrument.filterEnvelope.curve", { filterEnvelope: { ...DEFAULT_CONFIG.filterEnvelope, curve: -2 } }],
  ] as const)("validates %s", (path, invalidPart) => {
    const invalidConfig = { ...DEFAULT_CONFIG, ...invalidPart } as SynthConfig;

    expect(validateSynthConfig(invalidConfig).issues.map((issue) => issue.path))
      .toContain(path);
  });
});

function withConfig(changes: Partial<SynthConfig>): SynthConfig {
  return { ...DEFAULT_CONFIG, ...changes };
}
