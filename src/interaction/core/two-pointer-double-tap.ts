export interface TwoPointerDoubleTapSettings {
  readonly maximumDelayMs: number;
  readonly maximumDistanceCssPixels: number;
}

/**
 * Recognizes two consecutive two-pointer taps without depending on browser
 * events. Gesture qualification remains the responsibility of the input
 * adapter, while this class only compares completed tap time and position.
 */
export class TwoPointerDoubleTapGesture {
  private previousTapTimeStamp = 0;
  private previousTapX = 0;
  private previousTapY = 0;
  private hasPreviousTap = false;

  public constructor(
    private readonly settings: TwoPointerDoubleTapSettings,
  ) {}

  public recordTap(
    timeStamp: number,
    centerX: number,
    centerY: number,
  ): boolean {
    const elapsed = timeStamp - this.previousTapTimeStamp;
    const deltaX = centerX - this.previousTapX;
    const deltaY = centerY - this.previousTapY;
    const maximumDistanceSquared =
      this.settings.maximumDistanceCssPixels
      * this.settings.maximumDistanceCssPixels;
    const isDoubleTap =
      this.hasPreviousTap
      && elapsed > 0
      && elapsed <= this.settings.maximumDelayMs
      && deltaX * deltaX + deltaY * deltaY
        <= maximumDistanceSquared;

    if (isDoubleTap) {
      this.reset();
      return true;
    }

    this.previousTapTimeStamp = timeStamp;
    this.previousTapX = centerX;
    this.previousTapY = centerY;
    this.hasPreviousTap = true;
    return false;
  }

  public reset(): void {
    this.previousTapTimeStamp = 0;
    this.previousTapX = 0;
    this.previousTapY = 0;
    this.hasPreviousTap = false;
  }
}
