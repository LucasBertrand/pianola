import {
  INTERACTION_CONSTANTS,
} from "../../config/program-constants";
import type {
  PointerSample,
} from "../../interaction/core/input";
import type {
  InteractionModeState,
  InteractionTool,
} from "../../interaction/core/state";
export type {
  InteractionModeState,
  InteractionTool,
  SelectionMode,
} from "../../interaction/core/state";

export interface InteractionToolSignal {
  readonly version: number;
  get(): InteractionModeState;
  set(state: InteractionModeState): void;
  subscribe(listener: () => void): () => void;
}

export interface TouchAwareInteractionStrategy {
  readonly supportsHover: false;
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
  INTERACTION_CONSTANTS.contextActionEventName;

export function isSupportedPointerActivation(
  event: Pick<PointerSample, "button">,
): boolean {
  return event.button === 0;
}
