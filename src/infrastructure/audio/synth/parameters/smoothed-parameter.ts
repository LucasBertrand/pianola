const PARAMETER_SMOOTHING_SECONDS = 0.01;

/** Preallocated one-pole parameter ramp used by real-time DSP components. */
export class SmoothedParameter {
  private current: number;
  private target: number;
  private readonly coefficient: number;

  public constructor(sampleRate: number, initialValue: number) {
    this.current = initialValue;
    this.target = initialValue;
    this.coefficient = 1 - Math.exp(
      -1 / (PARAMETER_SMOOTHING_SECONDS * sampleRate),
    );
  }

  public reset(value: number): void {
    this.current = value;
    this.target = value;
  }

  public setTarget(value: number): void {
    this.target = value;
  }

  public next(): number {
    this.current += (this.target - this.current) * this.coefficient;
    return this.current;
  }
}
