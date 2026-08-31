export type ProjectInspectorResizeOrientation = "landscape" | "portrait";

export function resolveProjectInspectorResizeOrientation(
  compactLayout: boolean,
  portraitViewport: boolean,
): ProjectInspectorResizeOrientation {
  return compactLayout && portraitViewport ? "portrait" : "landscape";
}

export interface ProjectInspectorSizeBounds {
  readonly minimum: number;
  readonly maximum: number;
}

export function calculateLandscapeInspectorBounds(
  availableWidth: number,
  minimumInspectorWidth: number,
  minimumEditorWidth: number,
  resizeHandleSize: number,
): ProjectInspectorSizeBounds {
  return {
    minimum: minimumInspectorWidth,
    maximum: Math.max(
      minimumInspectorWidth,
      availableWidth - minimumEditorWidth - resizeHandleSize,
    ),
  };
}

export function clampProjectInspectorSize(
  size: number,
  bounds: ProjectInspectorSizeBounds,
): number {
  return Math.min(bounds.maximum, Math.max(bounds.minimum, size));
}

export function resizeProjectInspectorFromPointer(
  orientation: ProjectInspectorResizeOrientation,
  initialSize: number,
  pointerDelta: number,
  bounds: ProjectInspectorSizeBounds,
): number {
  const requestedSize = orientation === "portrait"
    ? initialSize + pointerDelta
    : initialSize - pointerDelta;

  return clampProjectInspectorSize(requestedSize, bounds);
}

export function resizeProjectInspectorFromKey(
  orientation: ProjectInspectorResizeOrientation,
  currentSize: number,
  key: string,
  step: number,
  bounds: ProjectInspectorSizeBounds,
): number | null {
  if (key === "Home") return bounds.minimum;
  if (key === "End") return bounds.maximum;

  const delta = orientation === "portrait"
    ? key === "ArrowUp"
      ? -step
      : key === "ArrowDown"
        ? step
        : null
    : key === "ArrowLeft"
      ? step
      : key === "ArrowRight"
        ? -step
        : null;

  return delta === null
    ? null
    : clampProjectInspectorSize(currentSize + delta, bounds);
}
