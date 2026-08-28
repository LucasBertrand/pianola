import type {
  PointerSample,
} from "./pointer-sample";

/** Browser-independent event strategy consumed by the native listener hook. */
export interface PointerInteractionStrategy {
  onPointerDown(event: PointerSample): void;
  shouldScheduleLongPress(): boolean;
  onPointerMove(event: PointerSample): void;
  onPointerUp(event: PointerSample): void;
  onPointerCancel(event: PointerSample): void;
  onGesture(events: readonly PointerSample[]): void;
  onLongPress(event: PointerSample): void;
  onDoubleClick(event: PointerSample): void;
  cancel(): void;
}

export function isSupportedPointerActivation(
  event: Pick<PointerSample, "button">,
): boolean {
  return event.button === 0;
}
