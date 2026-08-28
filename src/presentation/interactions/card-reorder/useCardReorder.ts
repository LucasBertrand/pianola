import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

const REORDER_CARD_SELECTOR = "[data-reorder-index]";

export interface CardReorderController<Id extends string> {
  readonly begin: (
    id: Id,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
}

/** Keeps pointer-driven list reordering independent from card selection. */
export function useCardReorder<Id extends string>(
  order: readonly Id[],
  onReorder: (id: Id, targetIndex: number) => void,
): CardReorderController<Id> {
  const orderRef = useRef(order);
  const onReorderRef = useRef(onReorder);

  orderRef.current = order;
  onReorderRef.current = onReorder;

  const begin = useCallback((
    id: Id,
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }

    const handle = event.currentTarget;
    const sourceCard = handle.closest<HTMLElement>(REORDER_CARD_SELECTOR);

    if (sourceCard === null) {
      return;
    }

    const pointerId = event.pointerId;
    let targetIndex = orderRef.current.indexOf(id);
    const reorderColor = getComputedStyle(sourceCard)
      .getPropertyValue("--instrument-color");

    if (targetIndex < 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture(pointerId);
    sourceCard.classList.add("is-reordering");

    const clearTarget = (): void => {
      const target = sourceCard.parentElement?.querySelector(
        ".is-reorder-target",
      );

      target?.classList.remove("is-reorder-target");
      (target as HTMLElement | null)?.style.removeProperty("--reorder-color");
    };

    const move = (pointerEvent: PointerEvent): void => {
      const pointedElement = document.elementFromPoint(
        pointerEvent.clientX,
        pointerEvent.clientY,
      );
      const targetCard = pointedElement?.closest<HTMLElement>(
        REORDER_CARD_SELECTOR,
      );

      if (targetCard === null || targetCard === undefined) {
        return;
      }

      if (targetCard.parentElement !== sourceCard.parentElement) {
        return;
      }

      const nextIndex = Number(targetCard.dataset["reorderIndex"]);

      if (!Number.isSafeInteger(nextIndex)) {
        return;
      }

      targetIndex = nextIndex;
      clearTarget();

      if (targetCard !== sourceCard) {
        targetCard.style.setProperty("--reorder-color", reorderColor);
        targetCard.classList.add("is-reorder-target");
      }
    };

    const finish = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      sourceCard.classList.remove("is-reordering");
      clearTarget();

      const sourceIndex = orderRef.current.indexOf(id);

      if (sourceIndex >= 0 && targetIndex !== sourceIndex) {
        onReorderRef.current(id, targetIndex);
      }
    };

    const cancel = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      sourceCard.classList.remove("is-reordering");
      clearTarget();
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
  }, []);

  return { begin };
}
