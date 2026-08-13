import type {
  PlaybackEnvelope,
} from "../playback-model";

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
  private attackStartValue = 0;

  public reset(
    config: PlaybackEnvelope,
    sampleRate: number,
    initialValue = 0,
  ): void {
    this.stage = "attack";
    this.value = Math.max(0, Math.min(1, initialValue));
    this.stageSample = 0;
    this.releaseStartValue = 0;
    this.attackStartValue = this.value;
    this.sustainLevel = config.sustainLevel;
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
    this.sustainLevel = sustainLevel;
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
    switch (this.stage) {
      case "attack":
        this.stageSample += 1;
        this.value = this.attackStartValue + (
          1 - this.attackStartValue
        ) * Math.min(1, this.stageSample / this.attackSamples);

        if (this.stageSample >= this.attackSamples) {
          this.enterDecay();
        }
        break;

      case "decay": {
        this.stageSample += 1;
        const progress = Math.min(1, this.stageSample / this.decaySamples);

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
        const progress = Math.min(1, this.stageSample / this.releaseSamples);

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
