import type {
  PointerKind,
  PointerSample,
} from "../../../editor/interactions/pointer/pointer-sample";

/** Creates an immutable snapshot before a browser reuses an event object. */
export function createPointerSample(event: PointerEvent): PointerSample {
  return {
    pointerId: event.pointerId,
    pointerType: normalizePointerKind(event.pointerType),
    button: event.button,
    clientX: event.clientX,
    clientY: event.clientY,
    timeStamp: event.timeStamp,
    shiftKey: event.shiftKey,
  };
}

/** Converts a mouse-only browser gesture to the common pointer contract. */
export function createMousePointerSample(event: MouseEvent): PointerSample {
  return {
    pointerId: -1,
    pointerType: "mouse",
    button: event.button,
    clientX: event.clientX,
    clientY: event.clientY,
    timeStamp: event.timeStamp,
    shiftKey: event.shiftKey,
  };
}

function normalizePointerKind(pointerType: string): PointerKind {
  if (pointerType === "touch" || pointerType === "pen") {
    return pointerType;
  }

  return "mouse";
}
