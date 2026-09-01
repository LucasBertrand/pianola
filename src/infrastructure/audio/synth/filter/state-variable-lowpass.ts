import type {
  SynthFilterRuntimeConfig,
} from "../synth-runtime-config";
import {
  SmoothedParameter,
} from "../parameters/smoothed-parameter";

const FILTER_COEFFICIENT_UPDATE_SAMPLES = 32;
const SECOND_STAGE_DAMPING = Math.SQRT2;

/** Allocation-free four-pole state-variable low-pass owned by one synth voice. */
export class StateVariableLowpass {
  private firstStageIntegratorOne = 0;
  private firstStageIntegratorTwo = 0;
  private secondStageIntegratorOne = 0;
  private secondStageIntegratorTwo = 0;
  private coefficientCountdown = 0;
  private coefficientG = 0;
  private damping = 1;
  private readonly cutoffHz: SmoothedParameter;
  private readonly resonance: SmoothedParameter;
  private readonly keyTracking: SmoothedParameter;
  private readonly envelopeAmountOctaves: SmoothedParameter;

  public constructor(private readonly sampleRate: number) {
    this.cutoffHz = new SmoothedParameter(sampleRate, 20_000);
    this.resonance = new SmoothedParameter(sampleRate, 0);
    this.keyTracking = new SmoothedParameter(sampleRate, 0);
    this.envelopeAmountOctaves = new SmoothedParameter(sampleRate, 0);
  }

  public reset(
    config: SynthFilterRuntimeConfig,
    preserveContinuity: boolean,
  ): void {
    this.cutoffHz.reset(config.cutoffHz);
    this.resonance.reset(config.resonance);
    this.keyTracking.reset(config.keyTracking);
    this.envelopeAmountOctaves.reset(config.envelopeAmountOctaves);
    if (!preserveContinuity) {
      this.firstStageIntegratorOne = 0;
      this.firstStageIntegratorTwo = 0;
      this.secondStageIntegratorOne = 0;
      this.secondStageIntegratorTwo = 0;
    }
    this.coefficientCountdown = 0;
    this.coefficientG = 0;
    this.damping = 1;
  }

  public preview(config: SynthFilterRuntimeConfig): void {
    this.cutoffHz.setTarget(config.cutoffHz);
    this.resonance.setTarget(config.resonance);
    this.keyTracking.setTarget(config.keyTracking);
    this.envelopeAmountOctaves.setTarget(config.envelopeAmountOctaves);
  }

  public process(input: number, envelope: number, pitch: number): number {
    const cutoffHz = this.cutoffHz.next();
    const resonance = this.resonance.next();
    const keyTracking = this.keyTracking.next();
    const envelopeAmountOctaves = this.envelopeAmountOctaves.next();

    if (this.coefficientCountdown <= 0) {
      const modulatedCutoff = cutoffHz * 2 ** (
        envelopeAmountOctaves * envelope
        + ((pitch - 60) / 12) * keyTracking
      );
      const clampedCutoff = Math.min(
        this.sampleRate * 0.45,
        Math.max(20, modulatedCutoff),
      );
      this.coefficientG = Math.tan(
        Math.PI * clampedCutoff / this.sampleRate,
      );
      this.damping = 1 / Math.max(0.5, resonance);
      this.coefficientCountdown = FILTER_COEFFICIENT_UPDATE_SAMPLES;
    }

    this.coefficientCountdown -= 1;
    const firstStageDenominator = 1 + this.coefficientG
      * (this.coefficientG + this.damping);
    const firstStageBand = (
      this.firstStageIntegratorOne
      + this.coefficientG * (input - this.firstStageIntegratorTwo)
    ) / firstStageDenominator;
    const firstStageLow = this.firstStageIntegratorTwo
      + this.coefficientG * firstStageBand;

    this.firstStageIntegratorOne = 2 * firstStageBand
      - this.firstStageIntegratorOne;
    this.firstStageIntegratorTwo = 2 * firstStageLow
      - this.firstStageIntegratorTwo;

    const secondStageDenominator = 1 + this.coefficientG
      * (this.coefficientG + SECOND_STAGE_DAMPING);
    const secondStageBand = (
      this.secondStageIntegratorOne
      + this.coefficientG * (
        firstStageLow - this.secondStageIntegratorTwo
      )
    ) / secondStageDenominator;
    const secondStageLow = this.secondStageIntegratorTwo
      + this.coefficientG * secondStageBand;

    this.secondStageIntegratorOne = 2 * secondStageBand
      - this.secondStageIntegratorOne;
    this.secondStageIntegratorTwo = 2 * secondStageLow
      - this.secondStageIntegratorTwo;
    return Number.isFinite(secondStageLow) ? secondStageLow : 0;
  }
}
