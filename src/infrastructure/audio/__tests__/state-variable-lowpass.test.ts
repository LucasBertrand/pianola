import { describe, expect, test } from "vitest";
import type { SynthFilterRuntimeConfig } from "../synth/synth-runtime-config";
import { StateVariableLowpass } from "../synth/filter/state-variable-lowpass";

const SAMPLE_RATE = 48_000;
const BASE_CONFIG: SynthFilterRuntimeConfig = {
  cutoffHz: 1_000,
  resonance: 0.2,
  keyTracking: 0,
  envelopeAmountOctaves: 0,
};

describe("state-variable low-pass", () => {
  test("settles to the DC input without becoming unstable", () => {
    const filter = createFilter(BASE_CONFIG);
    let output = 0;
    let maximum = 0;
    let allFinite = true;

    for (let sample = 0; sample < SAMPLE_RATE; sample += 1) {
      output = filter.process(1, 0, 60);
      allFinite &&= Number.isFinite(output);
      maximum = Math.max(maximum, Math.abs(output));
    }

    expect(allFinite).toBe(true);
    expect(maximum).toBeLessThan(2);
    expect(output).toBeCloseTo(1, 3);
  });

  test("keeps the supported resonance range bounded", () => {
    const filter = createFilter({ ...BASE_CONFIG, resonance: 24 });
    let maximum = 0;

    for (let sample = 0; sample < SAMPLE_RATE; sample += 1) {
      const output = filter.process(sample === 0 ? 1 : 0, 0, 60);
      expect(Number.isFinite(output)).toBe(true);
      maximum = Math.max(maximum, Math.abs(output));
    }

    expect(maximum).toBeLessThan(2);
  });

  test("opens the filter with envelope modulation and key tracking", () => {
    const fixedEnergy = alternatingSignalEnergy(BASE_CONFIG, 0, 60);
    const envelopeEnergy = alternatingSignalEnergy({
      ...BASE_CONFIG,
      envelopeAmountOctaves: 4,
    }, 1, 60);
    const trackedEnergy = alternatingSignalEnergy({
      ...BASE_CONFIG,
      keyTracking: 1,
    }, 0, 108);

    expect(envelopeEnergy).toBeGreaterThan(fixedEnergy * 2);
    expect(trackedEnergy).toBeGreaterThan(fixedEnergy * 2);
  });

  test("attenuates at approximately 24 dB per octave above cutoff", () => {
    const config = { ...BASE_CONFIG, cutoffHz: 250, resonance: 0 };
    const lowerOctaveAmplitude = steadyStateAmplitude(config, 2_000);
    const upperOctaveAmplitude = steadyStateAmplitude(config, 4_000);
    const attenuationDb = 20 * Math.log10(
      lowerOctaveAmplitude / upperOctaveAmplitude,
    );

    expect(attenuationDb).toBeGreaterThan(21);
    expect(attenuationDb).toBeLessThan(27);
  });

  test.each([
    { cutoffHz: 0, resonance: 0, keyTracking: 0, envelopeAmountOctaves: 0 },
    { cutoffHz: Number.POSITIVE_INFINITY, resonance: 24, keyTracking: 1,
      envelopeAmountOctaves: 8 },
    { cutoffHz: Number.NaN, resonance: Number.NaN, keyTracking: Number.NaN,
      envelopeAmountOctaves: Number.NaN },
  ])("never returns a non-finite sample for extreme parameters", (config) => {
    const filter = createFilter(config);

    for (let sample = 0; sample < 2_048; sample += 1) {
      expect(Number.isFinite(filter.process(sample % 2 === 0 ? 1 : -1, 1, 127)))
        .toBe(true);
    }
  });

  test("keeps the sample loop allocation-free", () => {
    expect(StateVariableLowpass.prototype.process.toString()).not.toMatch(
      /\bnew\s|Array\.from|\.(?:map|filter|slice|concat)\(/,
    );
  });
});

function createFilter(config: SynthFilterRuntimeConfig): StateVariableLowpass {
  const filter = new StateVariableLowpass(SAMPLE_RATE);
  filter.reset(config, false);
  return filter;
}

function alternatingSignalEnergy(
  config: SynthFilterRuntimeConfig,
  envelope: number,
  pitch: number,
): number {
  const filter = createFilter(config);
  let energy = 0;

  for (let sample = 0; sample < 4_096; sample += 1) {
      const input = Math.sin(2 * Math.PI * 6_000 * sample / SAMPLE_RATE);
      const output = filter.process(input, envelope, pitch);
    if (sample >= 1_024) energy += output * output;
  }

  return energy;
}

function steadyStateAmplitude(
  config: SynthFilterRuntimeConfig,
  frequencyHz: number,
): number {
  const filter = createFilter(config);
  let energy = 0;
  const warmupSamples = 4_096;
  const measuredSamples = 4_096;

  for (let sample = 0; sample < warmupSamples + measuredSamples; sample += 1) {
    const input = Math.sin(2 * Math.PI * frequencyHz * sample / SAMPLE_RATE);
    const output = filter.process(input, 0, 60);
    if (sample >= warmupSamples) energy += output * output;
  }

  return Math.sqrt(energy / measuredSamples);
}
