/** Pointer categories understood by the editor interaction core. */
export type PointerKind = "mouse" | "touch" | "pen";

/**
 * Browser-independent pointer data captured by the DOM adapter. Keeping this
 * value free of native events makes gesture behavior deterministic in tests
 * and reusable by future input adapters.
 */
export interface PointerSample {
  readonly pointerId: number;
  readonly pointerType: PointerKind;
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly timeStamp: number;
  readonly shiftKey: boolean;
}
