import type {
  RefObject,
} from "react";
import type {
  PointerInteractionStrategy,
} from "../../../editor-core/interactions/pointer/pointer-interaction-strategy";
import {
  createMousePointerSample,
} from "./dom-pointer-sample";

export interface PianoRollPointerEventHandlers {
  readonly pointerDown: (event: PointerEvent) => void;
  readonly pointerMove: (event: PointerEvent) => void;
  readonly finishPointer: (
    event: PointerEvent,
    cancelled: boolean,
  ) => void;
  readonly lostPointerCapture: (event: PointerEvent) => void;
}

/** Binds DOM events and owns their symmetrical cleanup. */
export function bindPianoRollPointerEvents(
  overlay: HTMLElement,
  strategyRef: RefObject<PointerInteractionStrategy | null>,
  handlers: PianoRollPointerEventHandlers,
): () => void {
  const handleDoubleClick = (event: MouseEvent): void => {
    strategyRef.current?.onDoubleClick(createMousePointerSample(event));
    event.preventDefault();
  };
  const handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
  const handlePointerUp = (event: PointerEvent): void => {
    handlers.finishPointer(event, false);
  };
  const handlePointerCancel = (event: PointerEvent): void => {
    handlers.finishPointer(event, true);
  };

  overlay.addEventListener("pointerdown", handlers.pointerDown);
  overlay.addEventListener("pointermove", handlers.pointerMove);
  overlay.addEventListener("pointerup", handlePointerUp);
  overlay.addEventListener("pointercancel", handlePointerCancel);
  overlay.addEventListener("lostpointercapture", handlers.lostPointerCapture);
  overlay.addEventListener("dblclick", handleDoubleClick);
  overlay.addEventListener("contextmenu", handleContextMenu);

  return (): void => {
    overlay.removeEventListener("pointerdown", handlers.pointerDown);
    overlay.removeEventListener("pointermove", handlers.pointerMove);
    overlay.removeEventListener("pointerup", handlePointerUp);
    overlay.removeEventListener("pointercancel", handlePointerCancel);
    overlay.removeEventListener(
      "lostpointercapture",
      handlers.lostPointerCapture,
    );
    overlay.removeEventListener("dblclick", handleDoubleClick);
    overlay.removeEventListener("contextmenu", handleContextMenu);
  };
}
