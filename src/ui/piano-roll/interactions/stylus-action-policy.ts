interface StylusPointerSample {
  readonly pointerType: string;
  readonly button: number;
  readonly buttons: number;
  readonly pressure: number;
}

/** Covers the barrel, middle-style barrel, and eraser button codes. */
export function isStylusButtonActivation(
  event: StylusPointerSample,
): boolean {
  return event.pointerType === "pen"
    && (event.button === 1 || event.button === 2 || event.button === 5);
}

/** Some drivers expose the barrel button as a pressureless primary hover. */
export function isStylusHoverButtonActivation(
  event: StylusPointerSample,
): boolean {
  return event.pointerType === "pen"
    && event.buttons === 1
    && event.pressure === 0;
}
