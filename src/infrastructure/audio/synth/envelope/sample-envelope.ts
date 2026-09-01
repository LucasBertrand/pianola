import type {
  SynthEnvelopeRuntimeConfig,
} from "../synth-runtime-config";

const MINIMUM_EDGE_SECONDS = 0.001;

type EnvelopeStage =
  | "attack"
  | "decay"
  | "sustain"
  | "release"
  | "ended";

/** Sample-driven ADSR whose stage boundaries reach their exact target. */
export class SampleEnvelope {
  private stage: EnvelopeStage = "ended";
  private value = 0;
  private stageSample = 0;
  private releaseStartValue = 0;
  private attackSamples = 1;
  private decaySamples = 0;
  private releaseSamples = 1;
  private sustainLevel = 0;
  private targetSustainLevel = 0;
  private attackStartValue = 0;
  private curve = 0;
  private targetCurve = 0;
  private smoothingCoefficient = 1;

  public reset(
    config: SynthEnvelopeRuntimeConfig,
    sampleRate: number,
    initialValue = 0,
  ): void {
    this.stage = "attack";
    this.value = Math.max(0, Math.min(1, initialValue));
    this.stageSample = 0;
    this.releaseStartValue = 0;
    this.attackStartValue = this.value;
    this.sustainLevel = config.sustainLevel;
    this.targetSustainLevel = config.sustainLevel;
    this.curve = config.curve;
    this.targetCurve = config.curve;
    this.smoothingCoefficient = 1 - Math.exp(-1 / (0.01 * sampleRate));
    this.attackSamples = secondsToSamples(
      Math.max(MINIMUM_EDGE_SECONDS, config.attackSeconds),
      sampleRate,
    );
    this.decaySamples = secondsToSamples(config.decaySeconds, sampleRate);
    this.releaseSamples = secondsToSamples(
      Math.max(MINIMUM_EDGE_SECONDS, config.releaseSeconds),
      sampleRate,
    );
  }

  public get ended(): boolean {
    return this.stage === "ended";
  }

  public get currentValue(): number {
    return this.value;
  }

  public previewSustainLevel(sustainLevel: number): void {
    this.targetSustainLevel = sustainLevel;
  }

  public previewCurve(curve: number): void {
    this.targetCurve = curve;
  }

  public release(releaseSeconds?: number, sampleRate?: number): void {
    if (this.stage === "release" || this.stage === "ended") {
      return;
    }

    this.stage = "release";
    this.stageSample = 0;
    this.releaseStartValue = this.value;

    if (releaseSeconds !== undefined && sampleRate !== undefined) {
      const requestedSamples = secondsToSamples(
        Math.max(MINIMUM_EDGE_SECONDS, releaseSeconds),
        sampleRate,
      );

      // A forced release may only shorten the configured tail.
      this.releaseSamples = Math.min(this.releaseSamples, requestedSamples);
    }
  }

  public next(): number {
    this.sustainLevel += (
      this.targetSustainLevel - this.sustainLevel
    ) * this.smoothingCoefficient;
    this.curve += (
      this.targetCurve - this.curve
    ) * this.smoothingCoefficient;

    switch (this.stage) {
      case "attack":
        this.stageSample += 1;
        const progress = shapeEnvelopeProgress(
          Math.min(1, this.stageSample / this.attackSamples),
          this.curve,
        );
        this.value = this.attackStartValue + (
          1 - this.attackStartValue
        ) * progress;

        if (this.stageSample >= this.attackSamples) {
          this.enterDecay();
        }
        break;

      case "decay": {
        this.stageSample += 1;
        const progress = shapeEnvelopeProgress(
          Math.min(1, this.stageSample / this.decaySamples),
          this.curve,
        );

        this.value = 1 + (this.sustainLevel - 1) * progress;

        if (this.stageSample >= this.decaySamples) {
          this.stage = "sustain";
          this.value = this.sustainLevel;
        }
        break;
      }

      case "sustain":
        this.value = this.sustainLevel;
        break;

      case "release": {
        this.stageSample += 1;
        const progress = shapeEnvelopeProgress(
          Math.min(1, this.stageSample / this.releaseSamples),
          this.curve,
        );

        this.value = this.releaseStartValue * (1 - progress);

        if (this.stageSample >= this.releaseSamples) {
          this.stage = "ended";
          this.value = 0;
        }
        break;
      }

      case "ended":
        this.value = 0;
        break;
    }

    return this.value;
  }

  private enterDecay(): void {
    this.value = 1;
    this.stageSample = 0;

    if (this.decaySamples === 0) {
      this.stage = "sustain";
      this.value = this.sustainLevel;
    } else {
      this.stage = "decay";
    }
  }
}

function secondsToSamples(seconds: number, sampleRate: number): number {
  return Math.max(1, Math.round(seconds * sampleRate));
}

/** Maps a linear stage clock to a continuously adjustable exponential curve. */
export function shapeEnvelopeProgress(progress: number, curve: number): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const clampedCurve = Math.max(-1, Math.min(1, curve));

  if (Math.abs(clampedCurve) < 0.000_001) {
    return clampedProgress;
  }

  const exponent = Math.abs(clampedCurve) * 5;

  if (clampedCurve < 0) {
    return Math.expm1(exponent * clampedProgress) / Math.expm1(exponent);
  }

  return -Math.expm1(-exponent * clampedProgress) / -Math.expm1(-exponent);
}
