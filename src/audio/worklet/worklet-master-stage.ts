export type MasterProtectionMode = "soft-clipper" | "lookahead-limiter";

export interface MasterLevelMeasurement {
  readonly peakLeft: number;
  readonly peakRight: number;
  readonly rmsLeft: number;
  readonly rmsRight: number;
  readonly preProtectionPeak: number;
  readonly gainReductionDb: number;
}

export interface MasterLevelWriter {
  peakLeft: number;
  peakRight: number;
  rmsLeft: number;
  rmsRight: number;
  preProtectionPeak: number;
  gainReductionDb: number;
}

export const MASTER_HEADROOM_DB = -6;
export const MASTER_HEADROOM_GAIN = 10 ** (MASTER_HEADROOM_DB / 20);
export const MASTER_CEILING_DB = -1;
export const MASTER_CEILING_GAIN = 10 ** (MASTER_CEILING_DB / 20);
export const MASTER_LIMITER_LOOKAHEAD_SECONDS = 0.002;
export const DEFAULT_MASTER_PROTECTION_MODE: MasterProtectionMode =
  "lookahead-limiter";

const LIMITER_RELEASE_SECONDS = 0.08;
const SOFT_CLIP_KNEE_RATIO = 0.75;

/**
 * Allocation-free master DSP. All delay and peak-deque storage is reserved in
 * the constructor; processFrame() only updates scalar and typed-array state.
 */
export class WorkletMasterStage {
  private readonly lookaheadFrames: number;
  private readonly delayLeft: Float32Array;
  private readonly delayRight: Float32Array;
  private readonly peakDequeValues: Float32Array;
  private readonly peakDequeFrames: Float64Array;
  private readonly dequeCapacity: number;
  private readonly releaseCoefficient: number;
  private delayIndex = 0;
  private dequeHead = 0;
  private dequeCount = 0;
  private inputFrame = 0;
  private limiterGain = 1;
  private meterPeakLeft = 0;
  private meterPeakRight = 0;
  private meterSquareLeft = 0;
  private meterSquareRight = 0;
  private meterPreProtectionPeak = 0;
  private meterMinimumGain = 1;
  private meterFrameCount = 0;

  public constructor(
    sampleRate: number,
    private readonly mode: MasterProtectionMode =
      DEFAULT_MASTER_PROTECTION_MODE,
  ) {
    this.lookaheadFrames = Math.max(
      1,
      Math.round(sampleRate * MASTER_LIMITER_LOOKAHEAD_SECONDS),
    );
    this.delayLeft = new Float32Array(this.lookaheadFrames);
    this.delayRight = new Float32Array(this.lookaheadFrames);
    this.dequeCapacity = this.lookaheadFrames + 2;
    this.peakDequeValues = new Float32Array(this.dequeCapacity);
    this.peakDequeFrames = new Float64Array(this.dequeCapacity);
    this.releaseCoefficient = Math.exp(
      -1 / (LIMITER_RELEASE_SECONDS * sampleRate),
    );
  }

  public get latencyFrames(): number {
    return this.mode === "lookahead-limiter" ? this.lookaheadFrames : 0;
  }

  public processFrame(
    left: Float32Array,
    right: Float32Array,
    frameIndex: number,
    masterLevel: number,
  ): void {
    const inputLeft = sanitizeSample(
      (left[frameIndex] ?? 0) * masterLevel * MASTER_HEADROOM_GAIN,
    );
    const inputRight = sanitizeSample(
      (right[frameIndex] ?? 0) * masterLevel * MASTER_HEADROOM_GAIN,
    );
    const inputPeak = Math.max(Math.abs(inputLeft), Math.abs(inputRight));
    let outputLeft: number;
    let outputRight: number;
    let appliedGain = 1;

    if (this.mode === "soft-clipper") {
      outputLeft = softClip(inputLeft);
      outputRight = softClip(inputRight);
      const outputPeak = Math.max(
        Math.abs(outputLeft),
        Math.abs(outputRight),
      );

      appliedGain = inputPeak > 0 ? Math.min(1, outputPeak / inputPeak) : 1;
    } else {
      const delayedLeft = this.inputFrame >= this.lookaheadFrames
        ? this.delayLeft[this.delayIndex] ?? 0
        : 0;
      const delayedRight = this.inputFrame >= this.lookaheadFrames
        ? this.delayRight[this.delayIndex] ?? 0
        : 0;

      this.delayLeft[this.delayIndex] = inputLeft;
      this.delayRight[this.delayIndex] = inputRight;
      this.delayIndex += 1;
      if (this.delayIndex === this.lookaheadFrames) {
        this.delayIndex = 0;
      }

      this.pushPeak(inputPeak);
      const windowPeak = this.peakDequeValues[this.dequeHead] ?? 0;
      const targetGain = windowPeak > MASTER_CEILING_GAIN
        ? MASTER_CEILING_GAIN / windowPeak
        : 1;

      if (targetGain < this.limiterGain) {
        this.limiterGain = targetGain;
      } else {
        this.limiterGain = targetGain + this.releaseCoefficient
          * (this.limiterGain - targetGain);
      }

      appliedGain = this.limiterGain;
      outputLeft = delayedLeft * appliedGain;
      outputRight = delayedRight * appliedGain;
    }

    left[frameIndex] = sanitizeSample(outputLeft);
    right[frameIndex] = sanitizeSample(outputRight);
    this.measure(inputPeak, left[frameIndex] ?? 0, right[frameIndex] ?? 0, appliedGain);
    this.inputFrame += 1;
  }

  /** Called only at the deliberately reduced MessagePort reporting cadence. */
  public readAndResetLevels(): MasterLevelMeasurement {
    const levels: MasterLevelWriter = {
      peakLeft: 0,
      peakRight: 0,
      rmsLeft: 0,
      rmsRight: 0,
      preProtectionPeak: 0,
      gainReductionDb: 0,
    };

    this.writeAndResetLevels(levels);
    return levels;
  }

  /** Writes into processor-owned storage so reporting adds no JS allocation. */
  public writeAndResetLevels(levels: MasterLevelWriter): void {
    const divisor = Math.max(1, this.meterFrameCount);

    levels.peakLeft = this.meterPeakLeft;
    levels.peakRight = this.meterPeakRight;
    levels.rmsLeft = Math.sqrt(this.meterSquareLeft / divisor);
    levels.rmsRight = Math.sqrt(this.meterSquareRight / divisor);
    levels.preProtectionPeak = this.meterPreProtectionPeak;
    levels.gainReductionDb = this.meterMinimumGain < 1
      ? -20 * Math.log10(this.meterMinimumGain)
      : 0;

    this.meterPeakLeft = 0;
    this.meterPeakRight = 0;
    this.meterSquareLeft = 0;
    this.meterSquareRight = 0;
    this.meterPreProtectionPeak = 0;
    this.meterMinimumGain = 1;
    this.meterFrameCount = 0;
  }

  private pushPeak(peak: number): void {
    const minimumFrame = this.inputFrame - this.lookaheadFrames;

    while (
      this.dequeCount > 0
      && (this.peakDequeFrames[this.dequeHead] ?? 0) < minimumFrame
    ) {
      this.dequeHead = (this.dequeHead + 1) % this.dequeCapacity;
      this.dequeCount -= 1;
    }

    while (this.dequeCount > 0) {
      const tail = (
        this.dequeHead + this.dequeCount - 1
      ) % this.dequeCapacity;

      if ((this.peakDequeValues[tail] ?? 0) > peak) {
        break;
      }

      this.dequeCount -= 1;
    }

    const insertionIndex = (
      this.dequeHead + this.dequeCount
    ) % this.dequeCapacity;

    this.peakDequeValues[insertionIndex] = peak;
    this.peakDequeFrames[insertionIndex] = this.inputFrame;
    this.dequeCount += 1;
  }

  private measure(
    inputPeak: number,
    outputLeft: number,
    outputRight: number,
    appliedGain: number,
  ): void {
    const absoluteLeft = Math.abs(outputLeft);
    const absoluteRight = Math.abs(outputRight);

    this.meterPeakLeft = Math.max(this.meterPeakLeft, absoluteLeft);
    this.meterPeakRight = Math.max(this.meterPeakRight, absoluteRight);
    this.meterSquareLeft += outputLeft * outputLeft;
    this.meterSquareRight += outputRight * outputRight;
    this.meterPreProtectionPeak = Math.max(
      this.meterPreProtectionPeak,
      inputPeak,
    );
    this.meterMinimumGain = Math.min(this.meterMinimumGain, appliedGain);
    this.meterFrameCount += 1;
  }
}

function softClip(sample: number): number {
  const absoluteSample = Math.abs(sample);
  const knee = MASTER_CEILING_GAIN * SOFT_CLIP_KNEE_RATIO;

  if (absoluteSample <= knee) {
    return sample;
  }

  const kneeWidth = MASTER_CEILING_GAIN - knee;
  const magnitude = knee + kneeWidth * Math.tanh(
    (absoluteSample - knee) / kneeWidth,
  );
  return Math.sign(sample) * magnitude;
}

function sanitizeSample(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
