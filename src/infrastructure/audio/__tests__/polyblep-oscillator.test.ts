import {
  describe,
  expect,
  test,
} from "vitest";
import type {
  OscillatorWaveform,
} from "../../../domain/instruments/instrument";
import {
  PolyBlepOscillator,
} from "../worklet/synth/polyblep-oscillator";

const SAMPLE_RATE = 48_000;
const FFT_SIZE = 8_192;
const LOWEST_MIDI_PITCH = 0;
const HIGHEST_MIDI_PITCH = 127;

interface OscillatorCase {
  readonly name: string;
  readonly waveform: OscillatorWaveform;
  readonly pulseWidth: number;
  readonly golden: {
    readonly maximumAbsoluteDc: number;
    readonly minimumRms: number;
    readonly minimumLowRegisterRms: number;
    readonly maximumRms: number;
    readonly maximumAbsolutePeak: number;
    readonly maximumAliasDb: number;
  };
}

// These are perceptual/DSP acceptance metrics, deliberately not exact audio
// buffers. They tolerate harmless floating-point and phase changes while still
// catching level, bias and anti-aliasing regressions across all 128 MIDI notes.
const OSCILLATOR_GOLDENS: readonly OscillatorCase[] = [
  {
    name: "sine",
    waveform: "sine",
    pulseWidth: 0.5,
    golden: {
      maximumAbsoluteDc: 0.000_02,
      minimumRms: 0.70,
      minimumLowRegisterRms: 0.70,
      maximumRms: 0.71,
      maximumAbsolutePeak: 1.001,
      maximumAliasDb: -70,
    },
  },
  {
    name: "triangle",
    waveform: "triangle",
    pulseWidth: 0.5,
    golden: {
      maximumAbsoluteDc: 0.000_02,
      minimumRms: 0.48,
      minimumLowRegisterRms: 0.57,
      maximumRms: 0.585,
      maximumAbsolutePeak: 1.01,
      maximumAliasDb: -21,
    },
  },
  {
    name: "saw",
    waveform: "sawtooth",
    pulseWidth: 0.5,
    golden: {
      maximumAbsoluteDc: 0.000_02,
      minimumRms: 0.35,
      minimumLowRegisterRms: 0.57,
      maximumRms: 0.585,
      maximumAbsolutePeak: 1.001,
      maximumAliasDb: -12,
    },
  },
  {
    name: "square 50%",
    waveform: "square",
    pulseWidth: 0.5,
    golden: {
      maximumAbsoluteDc: 0.000_02,
      minimumRms: 0.70,
      minimumLowRegisterRms: 0.99,
      maximumRms: 1.005,
      maximumAbsolutePeak: 1.001,
      maximumAliasDb: -13,
    },
  },
  {
    name: "pulse 5%",
    waveform: "square",
    pulseWidth: 0.05,
    golden: {
      maximumAbsoluteDc: 0.000_02,
      minimumRms: 0.31,
      minimumLowRegisterRms: 0.42,
      maximumRms: 0.56,
      maximumAbsolutePeak: 1.91,
      maximumAliasDb: -9.5,
    },
  },
  {
    name: "pulse 95%",
    waveform: "square",
    pulseWidth: 0.95,
    golden: {
      maximumAbsoluteDc: 0.000_02,
      minimumRms: 0.31,
      minimumLowRegisterRms: 0.42,
      maximumRms: 0.56,
      maximumAbsolutePeak: 1.91,
      maximumAliasDb: -9.5,
    },
  },
];

describe("PolyBLEP oscillator golden metrics", () => {
  test.each(OSCILLATOR_GOLDENS)(
    "$name stays within its full-tessitura metric envelope",
    ({ waveform, pulseWidth, golden }) => {
      let maximumAbsoluteDc = 0;
      let minimumRms = Number.POSITIVE_INFINITY;
      let minimumLowRegisterRms = Number.POSITIVE_INFINITY;
      let maximumRms = 0;
      let maximumAbsolutePeak = 0;
      let maximumAliasDb = Number.NEGATIVE_INFINITY;

      for (
        let midiPitch = LOWEST_MIDI_PITCH;
        midiPitch <= HIGHEST_MIDI_PITCH;
        midiPitch += 1
      ) {
        const frequencyHz = 440 * 2 ** ((midiPitch - 69) / 12);
        const phaseIncrement = Math.min(0.45, frequencyHz / SAMPLE_RATE);
        const oscillator = new PolyBlepOscillator();
        oscillator.reset(0);

        // Let the triangle's DC servo settle for a pitch-independent number
        // of periods. Other shapes take the same path to keep metrics uniform.
        renderSamples(
          oscillator,
          waveform,
          phaseIncrement,
          pulseWidth,
          Math.ceil(32 / phaseIncrement),
        );
        const levelSamples = renderSamples(
          oscillator,
          waveform,
          phaseIncrement,
          pulseWidth,
          Math.max(FFT_SIZE * 2, Math.ceil(64 / phaseIncrement)),
        );
        const { absoluteDc, rms, absolutePeak } = measureLevel(levelSamples);

        maximumAbsoluteDc = Math.max(maximumAbsoluteDc, absoluteDc);
        minimumRms = Math.min(minimumRms, rms);
        if (midiPitch <= 24) {
          minimumLowRegisterRms = Math.min(minimumLowRegisterRms, rms);
        }
        maximumRms = Math.max(maximumRms, rms);
        maximumAbsolutePeak = Math.max(maximumAbsolutePeak, absolutePeak);

        const spectrumSamples = renderSamples(
          oscillator,
          waveform,
          phaseIncrement,
          pulseWidth,
          FFT_SIZE,
        );
        maximumAliasDb = Math.max(
          maximumAliasDb,
          measureOutOfHarmonicEnergyDb(
            spectrumSamples,
            frequencyHz,
            waveform,
            pulseWidth,
          ),
        );
      }

      expect(maximumAbsoluteDc).toBeLessThanOrEqual(
        golden.maximumAbsoluteDc,
      );
      expect(minimumRms).toBeGreaterThanOrEqual(golden.minimumRms);
      expect(minimumLowRegisterRms).toBeGreaterThanOrEqual(
        golden.minimumLowRegisterRms,
      );
      expect(maximumRms).toBeLessThanOrEqual(golden.maximumRms);
      expect(maximumAbsolutePeak).toBeLessThanOrEqual(
        golden.maximumAbsolutePeak,
      );
      expect(maximumAliasDb).toBeLessThanOrEqual(golden.maximumAliasDb);
    },
  );
});

function renderSamples(
  oscillator: PolyBlepOscillator,
  waveform: OscillatorWaveform,
  phaseIncrement: number,
  pulseWidth: number,
  sampleCount: number,
): Float64Array {
  const samples = new Float64Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = oscillator.render(
      waveform,
      phaseIncrement,
      pulseWidth,
    );
  }
  return samples;
}

function measureLevel(samples: Float64Array): {
  readonly absoluteDc: number;
  readonly rms: number;
  readonly absolutePeak: number;
} {
  let weightedSum = 0;
  let windowSum = 0;
  let sumOfSquares = 0;
  let absolutePeak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    const angle = 2 * Math.PI * index / (samples.length - 1);
    const window = 0.35875
      - 0.48829 * Math.cos(angle)
      + 0.14128 * Math.cos(2 * angle)
      - 0.01168 * Math.cos(3 * angle);
    weightedSum += sample * window;
    windowSum += window;
    sumOfSquares += sample * sample;
    absolutePeak = Math.max(absolutePeak, Math.abs(sample));
  }

  return {
    absoluteDc: Math.abs(weightedSum / windowSum),
    rms: Math.sqrt(sumOfSquares / samples.length),
    absolutePeak,
  };
}

function measureOutOfHarmonicEnergyDb(
  samples: Float64Array,
  frequencyHz: number,
  waveform: OscillatorWaveform,
  pulseWidth: number,
): number {
  const real = new Float64Array(samples.length);
  const imaginary = new Float64Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    // Four-term Blackman-Harris confines a valid partial to a small, known
    // bin neighbourhood, so the remaining energy is a stable aliasing proxy.
    const angle = 2 * Math.PI * index / (samples.length - 1);
    const window = 0.35875
      - 0.48829 * Math.cos(angle)
      + 0.14128 * Math.cos(2 * angle)
      - 0.01168 * Math.cos(3 * angle);
    real[index] = (samples[index] ?? 0) * window;
  }
  fftInPlace(real, imaginary);

  const harmonicBins = new Uint8Array(samples.length / 2);
  const harmonicStep = waveform === "triangle"
    || (waveform === "square" && pulseWidth === 0.5)
    ? 2
    : 1;
  const firstHarmonic = 1;
  for (
    let harmonic = firstHarmonic;
    harmonic * frequencyHz < SAMPLE_RATE / 2;
    harmonic += harmonicStep
  ) {
    const centerBin = Math.round(
      harmonic * frequencyHz * samples.length / SAMPLE_RATE,
    );
    for (let offset = -4; offset <= 4; offset += 1) {
      const bin = centerBin + offset;
      if (bin > 0 && bin < harmonicBins.length) {
        harmonicBins[bin] = 1;
      }
    }
  }

  let totalEnergy = 0;
  let outOfHarmonicEnergy = 0;
  for (let bin = 1; bin < harmonicBins.length; bin += 1) {
    const realValue = real[bin] ?? 0;
    const imaginaryValue = imaginary[bin] ?? 0;
    const energy = realValue * realValue + imaginaryValue * imaginaryValue;
    totalEnergy += energy;
    if (harmonicBins[bin] === 0) {
      outOfHarmonicEnergy += energy;
    }
  }

  return 10 * Math.log10(
    Math.max(Number.EPSILON, outOfHarmonicEnergy / totalEnergy),
  );
}

function fftInPlace(real: Float64Array, imaginary: Float64Array): void {
  const length = real.length;
  for (let index = 1, reversed = 0; index < length; index += 1) {
    let bit = length >> 1;
    while ((reversed & bit) !== 0) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed] ?? 0, real[index] ?? 0];
      [imaginary[index], imaginary[reversed]] = [
        imaginary[reversed] ?? 0,
        imaginary[index] ?? 0,
      ];
    }
  }

  for (let size = 2; size <= length; size *= 2) {
    const angle = -2 * Math.PI / size;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < length; start += size) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < size / 2; offset += 1) {
        const evenIndex = start + offset;
        const oddIndex = evenIndex + size / 2;
        const oddReal = real[oddIndex] ?? 0;
        const oddImaginary = imaginary[oddIndex] ?? 0;
        const transformedReal = oddReal * twiddleReal
          - oddImaginary * twiddleImaginary;
        const transformedImaginary = oddReal * twiddleImaginary
          + oddImaginary * twiddleReal;
        const evenReal = real[evenIndex] ?? 0;
        const evenImaginary = imaginary[evenIndex] ?? 0;

        real[evenIndex] = evenReal + transformedReal;
        imaginary[evenIndex] = evenImaginary + transformedImaginary;
        real[oddIndex] = evenReal - transformedReal;
        imaginary[oddIndex] = evenImaginary - transformedImaginary;

        const nextTwiddleReal = twiddleReal * stepReal
          - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary
          + twiddleImaginary * stepReal;
        twiddleReal = nextTwiddleReal;
      }
    }
  }
}
