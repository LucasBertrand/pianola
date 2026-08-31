import { useEffect, useRef } from "react";
import type {
  ViewportPoint,
} from "../../radial-menu/floating-radial-menu-model";
import {
  isStylusButtonActivation,
  isStylusHoverButtonActivation,
} from "../../../editor-core/interactions/pointer/stylus-action-policy";

/** Maps pen barrel, eraser, and supported hover-button input to one action. */
export function useStylusAction(
  onAction: (position: ViewportPoint) => void,
): void {
  const hoverClickActiveRef = useRef(false);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (isStylusButtonActivation(event)) {
        event.preventDefault();
        event.stopPropagation();
        onAction({ x: event.clientX, y: event.clientY });
      }
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerType === "pen") {
        // Some pen drivers report the barrel button as a pressureless hover click.
        const isHoverClicking = isStylusHoverButtonActivation(event);

        if (isHoverClicking && !hoverClickActiveRef.current) {
          hoverClickActiveRef.current = true;
          event.preventDefault();
          onAction({ x: event.clientX, y: event.clientY });
        } else if (!isHoverClicking && hoverClickActiveRef.current) {
          hoverClickActiveRef.current = false;
        }
      }
    };

    const handlePointerUp = (event: PointerEvent): void => {
      if (event.pointerType === "pen") {
        hoverClickActiveRef.current = false;
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    document.addEventListener("pointermove", handlePointerMove, { capture: true });
    document.addEventListener("pointerup", handlePointerUp, { capture: true });

    return (): void => {
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("pointermove", handlePointerMove, { capture: true });
      document.removeEventListener("pointerup", handlePointerUp, { capture: true });
    };
  }, [onAction]);
}
