import { describe, expect, test } from "vitest";
import type { SynthConfig } from "../../../domain/instruments/synth/synth-config";
import { projectSynthRuntimeConfig } from "../synth/project-synth-runtime-config";

describe("synth runtime projection", () => {
  test("projects every durable field once into the runtime sections", () => {
    const durable: SynthConfig = {
      kind: "synth",
      oscillatorWaveform: "square",
      polyphony: 13,
      oscillatorDetuneCents: -17,
      oscillatorFreePhase: true,
      pulseWidth: 0.37,
      envelope: {
        attackSeconds: 0.11,
        decaySeconds: 0.22,
        sustainLevel: 0.33,
        releaseSeconds: 0.44,
        curve: -0.55,
      },
      filterCutoffHz: 1_234,
      filterResonance: 5.6,
      filterKeyTracking: 0.78,
      filterEnvelopeAmountOctaves: 3.2,
      filterEnvelope: {
        attackSeconds: 0.66,
        decaySeconds: 0.77,
        sustainLevel: 0.88,
        releaseSeconds: 0.99,
        curve: 0.12,
      },
    };

    expect(projectSynthRuntimeConfig(durable)).toEqual({
      kind: "synth-runtime",
      polyphony: 13,
      oscillator: {
        waveform: "square",
        detuneCents: -17,
        freePhase: true,
        pulseWidth: 0.37,
      },
      amplitudeEnvelope: {
        attackSeconds: 0.11,
        decaySeconds: 0.22,
        sustainLevel: 0.33,
        releaseSeconds: 0.44,
        curve: -0.55,
      },
      filter: {
        cutoffHz: 1_234,
        resonance: 5.6,
        keyTracking: 0.78,
        envelopeAmountOctaves: 3.2,
      },
      filterEnvelope: {
        attackSeconds: 0.66,
        decaySeconds: 0.77,
        sustainLevel: 0.88,
        releaseSeconds: 0.99,
        curve: 0.12,
      },
    });
  });
});
