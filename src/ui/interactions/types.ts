export type InteractionTool = "select";

export interface InteractionModeState {
  readonly activeTool: InteractionTool;
}

export interface InteractionToolSignal {
  readonly version: number;
  get(): InteractionModeState;
  set(state: InteractionModeState): void;
  subscribe(listener: () => void): () => void;
}

export interface TouchAwareInteractionStrategy {
  readonly supportsHover: false;
  onPointerDown(event: PointerEvent): void;
  onPointerMove(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
  onPointerCancel(event: PointerEvent): void;
  onGesture(events: PointerEvent[]): void;
  onLongPress(event: PointerEvent): void;
  onDoubleClick(event: MouseEvent): void;
  cancel(): void;
}

export interface InteractionManagerController {
  getActiveTool(): InteractionTool;
}

export interface PianoRollContextActionDetail {
  readonly clientX: number;
  readonly clientY: number;
  readonly tick: number;
  readonly pitch: number;
  readonly noteId: string | null;
}

export const PIANO_ROLL_CONTEXT_ACTION_EVENT =
  "piano-roll-context-action" as const;

export function isSupportedPointerActivation(
  event: PointerEvent,
): boolean {
  return event.button === 0;
}
