import {
  useEffect,
} from "react";
import type {
  ViewportPoint,
} from "./floating-radial-menu-model";

type OpenRadialMenu = (position: ViewportPoint) => void;

interface ContextMenuPointerEvent extends MouseEvent {
  readonly pointerType?: string;
}

/** Prevents the native menu and opens the radial menu for mouse actions. */
export function handleDocumentContextMenu(
  event: ContextMenuPointerEvent,
  openAt: OpenRadialMenu,
): void {
  event.preventDefault();

  // Touch long presses and pen buttons have their own interaction paths.
  if (event.pointerType !== undefined && event.pointerType !== "mouse") {
    return;
  }

  openAt({ x: event.clientX, y: event.clientY });
}

/** Owns the editor-wide native context-menu override. */
export function useDocumentRadialMenu(openAt: OpenRadialMenu): void {
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent): void => {
      handleDocumentContextMenu(event, openAt);
    };

    document.addEventListener("contextmenu", handleContextMenu, true);

    return (): void => {
      document.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, [openAt]);
}
