import { useEffect, useRef } from "react";

export function useStylusAction(onAction: () => void): void {
  const hoverClickActiveRef = useRef(false);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      // 5 = eraser, 2 = right click (some pens), 1 = middle click
      if (
        event.pointerType === "pen"
        && (event.button === 5 || event.button === 2 || event.button === 1)
      ) {
        // Only intercept if we are relatively sure it's a side-button and not a primary tip click
        // But since we rely on pointermove for hover-clicks, we just handle standard alternative buttons here.
        if (event.button === 5 || event.button === 2) {
          event.preventDefault();
          event.stopPropagation();
          onAction();
        }
      }
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerType === "pen") {
        // Detect "air click": buttons is 1 (left click), but pressure is 0
        const isHoverClicking = event.buttons === 1 && event.pressure === 0;

        if (isHoverClicking && !hoverClickActiveRef.current) {
          hoverClickActiveRef.current = true;
          event.preventDefault();
          onAction();
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
