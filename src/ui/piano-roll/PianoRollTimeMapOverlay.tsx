import React, {
  useCallback,
  useEffect,
  useRef,
} from "react";
import type {
  Tick,
} from "../../domain/identifiers";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  ViewportState,
} from "../../editor/geometry/converter";
import type {
  ReadonlyRenderSignal,
} from "../../editor/model/render-signal";
import {
  formatMarkerFlagLabel,
  type TimeMapMarkerFlag,
} from "../../use-cases/piano-roll/timeline/time-map-marker-plans";
import {
  useTimeMapMarkerGesture,
} from "./useTimeMapMarkerGesture";

export interface PianoRollTimeMapOverlayProps {
  readonly flags: readonly TimeMapMarkerFlag[];
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly projectStore: ProjectStorePort;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly onOpenMarker: (tick: Tick) => void;
  readonly onMoveMarker: (fromTick: Tick, toTick: Tick) => void;
}

/**
 * Marker lane of the bar ruler: one flag per marker tick under the measure
 * numbers, plus a full-height delimitation line over the grid. Lives on its
 * own lane so loop gestures and marker gestures never overlap.
 */
export function PianoRollTimeMapOverlay({
  flags,
  viewport,
  projectStore,
  gridResolutionTicks,
  onOpenMarker,
  onMoveMarker,
}: PianoRollTimeMapOverlayProps): React.JSX.Element {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const flagElementsRef = useRef(new Map<Tick, HTMLButtonElement>());
  const boundaryElementsRef = useRef(new Map<Tick, HTMLElement>());
  const getFlagElement = useCallback(
    (tick: Tick): HTMLButtonElement | null =>
      flagElementsRef.current.get(tick) ?? null,
    [],
  );
  const getBoundaryElement = useCallback(
    (tick: Tick): HTMLElement | null =>
      boundaryElementsRef.current.get(tick) ?? null,
    [],
  );
  const resetPositions = useCallback((): void => {
    const currentViewport = viewport.get();
    const pixelsPerTick =
      currentViewport.zoomX / currentViewport.ticksPerPixel;

    for (const flag of flags) {
      const x =
        flag.startTick * pixelsPerTick - currentViewport.scrollX;
      const flagElement = flagElementsRef.current.get(flag.startTick);
      const boundaryElement =
        boundaryElementsRef.current.get(flag.startTick);

      if (flagElement !== undefined) {
        flagElement.style.transform = `translate3d(${String(x)}px, 0, 0)`;
      }

      if (boundaryElement !== undefined) {
        boundaryElement.style.transform = `translate3d(${String(x)}px, 0, 0)`;
      }
    }
  }, [flags, viewport]);

  useEffect(() => {
    resetPositions();

    return viewport.subscribe(resetPositions);
  }, [resetPositions, viewport]);

  const markerGesture = useTimeMapMarkerGesture({
    flags,
    viewport,
    gridResolutionTicks,
    projectStore,
    layerRef,
    onOpenMarker,
    onMoveMarker,
    getFlagElement,
    getBoundaryElement,
    resetPositions,
  });

  return (
    <>
      <div
        ref={layerRef}
        className="bar-ruler-marker-overlay"
        aria-label="Tempo and meter markers"
      >
        {flags.map((flag) => (
          <button
            key={flag.startTick}
            ref={(element) => {
              if (element === null) {
                flagElementsRef.current.delete(flag.startTick);
              } else {
                flagElementsRef.current.set(flag.startTick, element);
              }
            }}
            className={
              `bar-ruler-marker-flag${
                flag.isInitial ? " is-initial" : ""
              }`
            }
            type="button"
            data-marker-tick={flag.startTick}
            aria-label={
              `Tempo and meter marker ${formatMarkerFlagLabel(flag)}`
            }
            onPointerDown={(event) => {
              markerGesture.begin(flag, event);
            }}
          >
            <span>{formatMarkerFlagLabel(flag)}</span>
          </button>
        ))}
      </div>
      <div className="bar-ruler-marker-boundaries" aria-hidden="true">
        {flags.map((flag) => (
          <i
            key={flag.startTick}
            ref={(element) => {
              if (element === null) {
                boundaryElementsRef.current.delete(flag.startTick);
              } else {
                boundaryElementsRef.current.set(flag.startTick, element);
              }
            }}
          />
        ))}
      </div>
    </>
  );
}
