import type {
  InstrumentId,
} from "../../domain/identifiers";
import type {
  SubtractivePlaybackPresetSnapshot,
} from "../playback-model";
import {
  SampleEnvelope,
} from "./sample-envelope";

const PARAMETER_SMOOTHING_SECONDS = 0.01;
const FIXED_NOTE_LEVEL = 100 / 127;
// Updating at 1.5 kHz for a 48 kHz context keeps envelope motion smooth while
// avoiding a transcendental filter calculation for every voice/sample.
const FILTER_COEFFICIENT_UPDATE_SAMPLES = 32;

/** Reusable DSP voice initialized from the fixed worklet-side pool. */
export class SubtractiveWorkletVoice {
  public instrumentId: InstrumentId = "";
  public sequence = 0;
  public endTick: number | null = null;
  private auditionSamples: number | null = null;
  private readonly amplitudeEnvelope = new SampleEnvelope();
  private readonly filterEnvelope = new SampleEnvelope();
  private baseFrequencyHz = 440;
  private waveform: SubtractivePlaybackPresetSnapshot["oscillatorWaveform"] =
    "sine";
  private pulseWidth = 0.5;
  private filterEnvelopeAmountOctaves = 0;
  private phase = 0;
  private integratedTriangle = 0;
  private filterIntegratorOne = 0;
  private filterIntegratorTwo = 0;
  private frequencyHz = 440;
  private targetFrequencyHz = 440;
  private filterCutoffHz = 20_000;
  private targetFilterCutoffHz = 20_000;
  private filterResonance = 0;
  private targetFilterResonance = 0;
  private readonly smoothingCoefficient: number;
  private released = false;
  private filterCoefficientCountdown = 0;
  private filterG = 0;
  private filterDamping = 1;
  private mixLeft = 0;
  private mixRight = 0;

  public constructor(private readonly sampleRate: number) {
    this.smoothingCoefficient = 1 - Math.exp(
      -1 / (PARAMETER_SMOOTHING_SECONDS * sampleRate),
    );
  }

  public start(
    instrumentId: InstrumentId,
    pitch: number,
    config: SubtractivePlaybackPresetSnapshot,
    tuningFrequencyHz: number,
    sequence: number,
    endTick: number | null,
    auditionSamples: number | null,
    preserveContinuity = false,
  ): void {
    const amplitudeStartValue = preserveContinuity
      ? this.amplitudeEnvelope.currentValue
      : 0;
    const filterEnvelopeStartValue = preserveContinuity
      ? this.filterEnvelope.currentValue
      : 0;

    this.instrumentId = instrumentId;
    this.sequence = sequence;
    this.endTick = endTick;
    this.auditionSamples = auditionSamples;
    this.baseFrequencyHz = tuningFrequencyHz
      * 2 ** ((pitch - 69) / 12);
    this.waveform = config.oscillatorWaveform;
    this.pulseWidth = config.pulseWidth;
    this.filterEnvelopeAmountOctaves =
      config.filterEnvelopeAmountOctaves;
    this.frequencyHz = this.baseFrequencyHz
      * 2 ** (config.oscillatorDetuneCents / 1_200);
    this.targetFrequencyHz = this.frequencyHz;
    this.filterCutoffHz = config.filterCutoffHz;
    this.targetFilterCutoffHz = this.filterCutoffHz;
    this.filterResonance = config.filterResonance;
    this.targetFilterResonance = this.filterResonance;
    if (!preserveContinuity) {
      this.phase = 0;
      this.integratedTriangle = 0;
      this.filterIntegratorOne = 0;
      this.filterIntegratorTwo = 0;
    }
    this.released = false;
    this.filterCoefficientCountdown = 0;
    this.filterG = 0;
    this.filterDamping = 1;
    this.mixLeft = 0;
    this.mixRight = 0;
    this.amplitudeEnvelope.reset(
      config.envelope,
      this.sampleRate,
      amplitudeStartValue,
    );
    this.filterEnvelope.reset(
      config.filterEnvelope,
      this.sampleRate,
      filterEnvelopeStartValue,
    );
  }

  public get ended(): boolean {
    return this.amplitudeEnvelope.ended;
  }

  public get releasing(): boolean {
    return this.released;
  }

  public get level(): number {
    return this.amplitudeEnvelope.currentValue;
  }

  public preview(config: SubtractivePlaybackPresetSnapshot): void {
    this.targetFrequencyHz = this.baseFrequencyHz
      * 2 ** (config.oscillatorDetuneCents / 1_200);
    this.targetFilterCutoffHz = config.filterCutoffHz;
    this.targetFilterResonance = config.filterResonance;
  }

  public configureMix(gain: number, pan: number, audible: boolean): void {
    if (!audible) {
      this.mixLeft = 0;
      this.mixRight = 0;
      return;
    }

    const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;

    this.mixLeft = gain * Math.cos(angle);
    this.mixRight = gain * Math.sin(angle);
  }

  public get leftMixLevel(): number {
    return this.mixLeft;
  }

  public get rightMixLevel(): number {
    return this.mixRight;
  }

  public release(releaseSeconds?: number): void {
    if (this.released) {
      return;
    }

    this.released = true;
    this.auditionSamples = null;
    this.amplitudeEnvelope.release(releaseSeconds, this.sampleRate);
    this.filterEnvelope.release(releaseSeconds, this.sampleRate);
  }

  public render(): number {
    if (this.auditionSamples !== null) {
      this.auditionSamples -= 1;

      if (this.auditionSamples <= 0) {
        this.release();
      }
    }

    this.frequencyHz += (
      this.targetFrequencyHz - this.frequencyHz
    ) * this.smoothingCoefficient;
    this.filterCutoffHz += (
      this.targetFilterCutoffHz - this.filterCutoffHz
    ) * this.smoothingCoefficient;
    this.filterResonance += (
      this.targetFilterResonance - this.filterResonance
    ) * this.smoothingCoefficient;

    const frequencyHz = Math.min(
      this.sampleRate * 0.45,
      this.frequencyHz,
    );
    const phaseIncrement = frequencyHz / this.sampleRate;
    const oscillatorSample = this.renderOscillator(phaseIncrement);
    const filterEnvelope = this.filterEnvelope.next();
    const filteredSample = this.renderLowpass(
      oscillatorSample,
      filterEnvelope,
      this.filterResonance,
    );

    return filteredSample * this.amplitudeEnvelope.next() * FIXED_NOTE_LEVEL;
  }

  private renderOscillator(phaseIncrement: number): number {
    const phase = this.phase;
    let sample: number;

    switch (this.waveform) {
      case "sine":
        sample = Math.sin(2 * Math.PI * phase);
        break;

      case "triangle": {
        const square = renderBandLimitedPulse(
          phase,
          phaseIncrement,
          0.5,
        );

        this.integratedTriangle += 4 * phaseIncrement * square;
        this.integratedTriangle *= 0.9995;
        sample = Math.max(-1, Math.min(1, this.integratedTriangle));
        break;
      }

      case "square":
        sample = renderBandLimitedPulse(
          phase,
          phaseIncrement,
          this.pulseWidth,
        );
        break;

      case "sawtooth":
        sample = 2 * phase - 1 - polyBlep(phase, phaseIncrement);
        break;
    }

    this.phase = phase + phaseIncrement;
    this.phase -= Math.floor(this.phase);
    return sample;
  }

  private renderLowpass(
    input: number,
    filterEnvelope: number,
    resonance: number,
  ): number {
    if (this.filterCoefficientCountdown <= 0) {
      const cutoffHz = this.filterCutoffHz
        * 2 ** (this.filterEnvelopeAmountOctaves * filterEnvelope);
      const clampedCutoff = Math.min(
        this.sampleRate * 0.45,
        Math.max(20, cutoffHz),
      );

      this.filterG = Math.tan(
        Math.PI * clampedCutoff / this.sampleRate,
      );
      this.filterDamping = 1 / Math.max(0.5, resonance);
      this.filterCoefficientCountdown =
        FILTER_COEFFICIENT_UPDATE_SAMPLES;
    }

    this.filterCoefficientCountdown -= 1;
    const denominator = 1 + this.filterG
      * (this.filterG + this.filterDamping);
    const band = (
      this.filterIntegratorOne
      + this.filterG * (input - this.filterIntegratorTwo)
    ) / denominator;
    const low = this.filterIntegratorTwo + this.filterG * band;

    this.filterIntegratorOne = 2 * band - this.filterIntegratorOne;
    this.filterIntegratorTwo = 2 * low - this.filterIntegratorTwo;
    return Number.isFinite(low) ? low : 0;
  }
}

function renderBandLimitedPulse(
  phase: number,
  phaseIncrement: number,
  pulseWidth: number,
): number {
  let sample = phase < pulseWidth ? 1 : -1;

  sample += polyBlep(phase, phaseIncrement);
  const fallingPhase = positiveModulo(phase - pulseWidth, 1);
  sample -= polyBlep(fallingPhase, phaseIncrement);
  return sample - (2 * pulseWidth - 1);
}

function polyBlep(phase: number, phaseIncrement: number): number {
  if (phase < phaseIncrement) {
    const normalized = phase / phaseIncrement;
    return normalized + normalized - normalized * normalized - 1;
  }

  if (phase > 1 - phaseIncrement) {
    const normalized = (phase - 1) / phaseIncrement;
    return normalized * normalized + normalized + normalized + 1;
  }

  return 0;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
