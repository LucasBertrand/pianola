import type {
  OscillatorWaveform,
} from "../../domain/instruments/instrument";

export interface DspMetrics {
  readonly peak: number;
  readonly rms: number;
  readonly dcOffset: number;
  readonly maximumDiscontinuity: number;
  readonly outOfBandEnergyDb: number;
}

export function measureDspMetrics(
  samples: Float32Array | Float64Array,
  sampleRate: number,
  fundamentalHz: number,
  waveform: OscillatorWaveform,
): DspMetrics {
  let peak = 0;
  let weightedSum = 0;
  let windowSum = 0;
  let sumOfSquares = 0;
  let maximumDiscontinuity = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    peak = Math.max(peak, Math.abs(sample));
    const angle = 2 * Math.PI * index / (samples.length - 1);
    const window = 0.35875
      - 0.48829 * Math.cos(angle)
      + 0.14128 * Math.cos(2 * angle)
      - 0.01168 * Math.cos(3 * angle);
    weightedSum += sample * window;
    windowSum += window;
    sumOfSquares += sample * sample;
    if (index > 0) {
      maximumDiscontinuity = Math.max(
        maximumDiscontinuity,
        Math.abs(sample - (samples[index - 1] ?? 0)),
      );
    }
  }

  return {
    peak,
    rms: Math.sqrt(sumOfSquares / samples.length),
    dcOffset: weightedSum / windowSum,
    maximumDiscontinuity,
    outOfBandEnergyDb: measureOutOfBandEnergyDb(
      samples,
      sampleRate,
      fundamentalHz,
      waveform,
    ),
  };
}

function measureOutOfBandEnergyDb(
  samples: Float32Array | Float64Array,
  sampleRate: number,
  fundamentalHz: number,
  waveform: OscillatorWaveform,
): number {
  assertPowerOfTwo(samples.length);
  const real = new Float64Array(samples.length);
  const imaginary = new Float64Array(samples.length);

  for (let index = 0; index < samples.length; index += 1) {
    const angle = 2 * Math.PI * index / (samples.length - 1);
    const window = 0.35875
      - 0.48829 * Math.cos(angle)
      + 0.14128 * Math.cos(2 * angle)
      - 0.01168 * Math.cos(3 * angle);
    real[index] = (samples[index] ?? 0) * window;
  }

  fftInPlace(real, imaginary);
  const harmonicBins = new Uint8Array(samples.length / 2);
  const harmonicStep = waveform === "triangle" || waveform === "square"
    ? 2 : 1;

  for (let harmonic = 1;
    harmonic * fundamentalHz < sampleRate / 2;
    harmonic += harmonicStep) {
    const centerBin = Math.round(
      harmonic * fundamentalHz * samples.length / sampleRate,
    );
    for (let offset = -4; offset <= 4; offset += 1) {
      const bin = centerBin + offset;
      if (bin > 0 && bin < harmonicBins.length) harmonicBins[bin] = 1;
    }
  }

  let totalEnergy = 0;
  let outOfBandEnergy = 0;
  for (let bin = 1; bin < harmonicBins.length; bin += 1) {
    const realValue = real[bin] ?? 0;
    const imaginaryValue = imaginary[bin] ?? 0;
    const energy = realValue * realValue + imaginaryValue * imaginaryValue;
    totalEnergy += energy;
    if (harmonicBins[bin] === 0) outOfBandEnergy += energy;
  }

  return 10 * Math.log10(Math.max(
    Number.EPSILON,
    outOfBandEnergy / totalEnergy,
  ));
}

function assertPowerOfTwo(value: number): void {
  if (value < 2 || (value & (value - 1)) !== 0) {
    throw new Error("DSP spectrum input length must be a power of two.");
  }
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
      const realValue = real[index] ?? 0;
      const imaginaryValue = imaginary[index] ?? 0;
      real[index] = real[reversed] ?? 0;
      imaginary[index] = imaginary[reversed] ?? 0;
      real[reversed] = realValue;
      imaginary[reversed] = imaginaryValue;
    }
  }

  for (let size = 2; size <= length; size *= 2) {
    const stepReal = Math.cos(-2 * Math.PI / size);
    const stepImaginary = Math.sin(-2 * Math.PI / size);
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
