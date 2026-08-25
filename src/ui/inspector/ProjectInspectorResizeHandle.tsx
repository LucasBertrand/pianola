import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clampProjectInspectorSize,
  resizeProjectInspectorFromKey,
  resizeProjectInspectorFromPointer,
  type ProjectInspectorResizeOrientation,
  type ProjectInspectorSizeBounds,
} from "./project-inspector-resize";

const COMPACT_LAYOUT_QUERY = "(max-width: 920px)";
const PORTRAIT_LAYOUT_QUERY = "(orientation: portrait)";
const RESIZE_HANDLE_SIZE = 10;
const MINIMUM_LANDSCAPE_EDITOR_WIDTH = 360;
const MINIMUM_COMPACT_EDITOR_WIDTH = 120;
const MINIMUM_PORTRAIT_EDITOR_HEIGHT = 0;
// This is the outer width used by Master Tuning (including its own padding).
// The inspector's padding stays within this drag limit.
const PREFERRED_MINIMUM_INSPECTOR_WIDTH = 190;
const PREFERRED_MAXIMUM_INSPECTOR_WIDTH = 520;
const PREFERRED_MINIMUM_INSPECTOR_HEIGHT = 140;
const KEYBOARD_RESIZE_STEP = 16;
const KEYBOARD_LARGE_RESIZE_STEP = 40;

export interface ProjectInspectorResizeHandleProps {
  readonly inspectorOpen: boolean;
}

export function ProjectInspectorResizeHandle({
  inspectorOpen,
}: ProjectInspectorResizeHandleProps): React.JSX.Element {
  const handleRef = useRef<HTMLDivElement | null>(null);
  const [orientation, setOrientation] =
    useState<ProjectInspectorResizeOrientation>(readOrientation);
  const [compactLayout, setCompactLayout] =
    useState(readCompactLayout);
  const available = !compactLayout || inspectorOpen;

  useEffect(() => {
    const portraitQuery = window.matchMedia(PORTRAIT_LAYOUT_QUERY);
    const compactQuery = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const synchronize = (): void => {
      setOrientation(portraitQuery.matches ? "portrait" : "landscape");
      setCompactLayout(compactQuery.matches);
    };

    synchronize();
    portraitQuery.addEventListener("change", synchronize);
    compactQuery.addEventListener("change", synchronize);

    return (): void => {
      portraitQuery.removeEventListener("change", synchronize);
      compactQuery.removeEventListener("change", synchronize);
    };
  }, []);

  useEffect(() => {
    const handle = handleRef.current;

    if (handle === null || !available) return undefined;

    const elements = readResizeElements(handle);

    if (elements === null) return undefined;

    const synchronize = (): void => {
      const bounds = readSizeBounds(elements.workspace, orientation);
      const size = readInspectorSize(elements.inspector, orientation);
      const clampedSize = clampProjectInspectorSize(size, bounds);

      if (Math.abs(size - clampedSize) > 0.5) {
        applyInspectorSize(
          elements.appShell,
          handle,
          orientation,
          clampedSize,
          bounds,
        );
      } else {
        synchronizeAria(handle, orientation);
      }
    };
    const resizeObserver = new ResizeObserver(synchronize);

    synchronize();
    resizeObserver.observe(elements.workspace);

    return (): void => resizeObserver.disconnect();
  }, [available, orientation]);

  return (
    <div
      ref={handleRef}
      className="project-inspector-resize-handle"
      role="separator"
      aria-label="Resize project inspector"
      aria-controls="project-inspector"
      aria-orientation={orientation === "portrait" ? "horizontal" : "vertical"}
      tabIndex={available ? 0 : -1}
      onDoubleClick={(event) => {
        const handle = event.currentTarget;
        const appShell = handle.closest<HTMLElement>(".app-shell");

        appShell?.style.removeProperty(readSizeProperty(orientation));
        requestAnimationFrame(() => synchronizeAria(handle, orientation));
      }}
      onKeyDown={(event) => {
        const elements = readResizeElements(event.currentTarget);

        if (elements === null) return;

        const bounds = readSizeBounds(elements.workspace, orientation);
        const currentSize = readInspectorSize(elements.inspector, orientation);
        const nextSize = resizeProjectInspectorFromKey(
          orientation,
          currentSize,
          event.key,
          event.shiftKey
            ? KEYBOARD_LARGE_RESIZE_STEP
            : KEYBOARD_RESIZE_STEP,
          bounds,
        );

        if (nextSize === null) return;

        event.preventDefault();
        applyInspectorSize(elements.appShell, event.currentTarget, orientation, nextSize, bounds);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;

        const handle = event.currentTarget;
        const elements = readResizeElements(handle);

        if (elements === null) return;

        const pointerId = event.pointerId;
        const initialPointerPosition = orientation === "portrait"
          ? event.clientY
          : event.clientX;
        const initialSize = readInspectorSize(elements.inspector, orientation);
        const bounds = readSizeBounds(elements.workspace, orientation);
        const resizingClass = orientation === "portrait"
          ? "is-resizing-project-inspector-horizontal"
          : "is-resizing-project-inspector-vertical";

        event.preventDefault();
        event.stopPropagation();
        handle.setPointerCapture(pointerId);
        document.body.classList.add(resizingClass);
        handle.classList.add("is-resizing");

        const move = (pointerEvent: PointerEvent): void => {
          const pointerPosition = orientation === "portrait"
            ? pointerEvent.clientY
            : pointerEvent.clientX;
          const nextSize = resizeProjectInspectorFromPointer(
            orientation,
            initialSize,
            pointerPosition - initialPointerPosition,
            bounds,
          );

          applyInspectorSize(
            elements.appShell,
            handle,
            orientation,
            nextSize,
            bounds,
          );
        };
        const cleanup = (): void => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", cleanup);
          handle.removeEventListener("pointercancel", cleanup);
          handle.removeEventListener("lostpointercapture", cleanup);
          document.body.classList.remove(resizingClass);
          handle.classList.remove("is-resizing");
        };

        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", cleanup);
        handle.addEventListener("pointercancel", cleanup);
        handle.addEventListener("lostpointercapture", cleanup);
      }}
    />
  );
}

interface ResizeElements {
  readonly appShell: HTMLElement;
  readonly workspace: HTMLElement;
  readonly inspector: HTMLElement;
}

function readResizeElements(handle: HTMLElement): ResizeElements | null {
  const appShell = handle.closest<HTMLElement>(".app-shell");
  const workspace = handle.closest<HTMLElement>(".workspace");
  const inspector = workspace?.querySelector<HTMLElement>(".project-inspector");

  return appShell === null || workspace === null || inspector === undefined || inspector === null
    ? null
    : { appShell, workspace, inspector };
}

function readSizeBounds(
  workspace: HTMLElement,
  orientation: ProjectInspectorResizeOrientation,
): ProjectInspectorSizeBounds {
  const bounds = workspace.getBoundingClientRect();

  if (orientation === "portrait") {
    const maximum = Math.max(
      0,
      bounds.height - MINIMUM_PORTRAIT_EDITOR_HEIGHT - RESIZE_HANDLE_SIZE,
    );

    return {
      minimum: Math.min(PREFERRED_MINIMUM_INSPECTOR_HEIGHT, maximum),
      maximum,
    };
  }

  const compact = readCompactLayout();
  const minimumEditorWidth = compact
    ? MINIMUM_COMPACT_EDITOR_WIDTH
    : MINIMUM_LANDSCAPE_EDITOR_WIDTH;
  const maximum = Math.max(
    0,
    Math.min(
      PREFERRED_MAXIMUM_INSPECTOR_WIDTH,
      bounds.width - minimumEditorWidth - RESIZE_HANDLE_SIZE,
    ),
  );

  return {
    minimum: Math.min(PREFERRED_MINIMUM_INSPECTOR_WIDTH, maximum),
    maximum,
  };
}

function readInspectorSize(
  inspector: HTMLElement,
  orientation: ProjectInspectorResizeOrientation,
): number {
  const bounds = inspector.getBoundingClientRect();
  return orientation === "portrait" ? bounds.height : bounds.width;
}

function applyInspectorSize(
  appShell: HTMLElement,
  handle: HTMLElement,
  orientation: ProjectInspectorResizeOrientation,
  size: number,
  bounds: ProjectInspectorSizeBounds,
): void {
  appShell.style.setProperty(readSizeProperty(orientation), `${String(size)}px`);
  handle.setAttribute("aria-valuemin", String(Math.round(bounds.minimum)));
  handle.setAttribute("aria-valuemax", String(Math.round(bounds.maximum)));
  handle.setAttribute("aria-valuenow", String(Math.round(size)));
}

function synchronizeAria(
  handle: HTMLElement,
  orientation: ProjectInspectorResizeOrientation,
): void {
  const elements = readResizeElements(handle);

  if (elements === null) return;

  const bounds = readSizeBounds(elements.workspace, orientation);
  const size = readInspectorSize(elements.inspector, orientation);
  handle.setAttribute("aria-valuemin", String(Math.round(bounds.minimum)));
  handle.setAttribute("aria-valuemax", String(Math.round(bounds.maximum)));
  handle.setAttribute("aria-valuenow", String(Math.round(size)));
}

function readSizeProperty(
  orientation: ProjectInspectorResizeOrientation,
): string {
  return orientation === "portrait"
    ? "--project-inspector-panel-height"
    : "--project-inspector-panel-width";
}

function readOrientation(): ProjectInspectorResizeOrientation {
  return typeof window !== "undefined" && window.matchMedia(PORTRAIT_LAYOUT_QUERY).matches
    ? "portrait"
    : "landscape";
}

function readCompactLayout(): boolean {
  return typeof window !== "undefined" && window.matchMedia(COMPACT_LAYOUT_QUERY).matches;
}
