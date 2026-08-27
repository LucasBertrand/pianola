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
  isIsolatedMeterMarkerFlag,
  type TimeMapMarkerFlag,
} from "../../use-cases/piano-roll/timeline/time-map-marker-plans";
import {
  useTimeMapMarkerGesture,
} from "./useTimeMapMarkerGesture";
import type {
  EditorSelection,
} from "../../editor/selection/editor-selection";
import type {
  TimelineDragPreview,
} from "../../editor/model/timeline-drag-preview";
import type {
  MutableRenderSignal,
} from "../../editor/model/render-signal";
import {
  createMarkerPreviewProjection,
  isOriginalMarkerBoundaryVisible,
} from "./time-map-marker-preview";
import type {
  SelectionMode,
} from "../../editor/interactions/gestures/gesture-draft";

export interface PianoRollTimeMapOverlayProps {
  readonly flags: readonly TimeMapMarkerFlag[];
  readonly selection: EditorSelection;
  readonly timelineDragPreview: MutableRenderSignal<
    TimelineDragPreview | null
  >;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly projectStore: ProjectStorePort;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly selectionMode: SelectionMode;
  readonly onOpenMarker: (tick: Tick) => void;
  readonly onSelectMarker: (tick: Tick, mode: SelectionMode) => void;
  readonly onMoveMarker: (fromTick: Tick, toTick: Tick) => void;
}

/**
 * Marker lane of the bar ruler: one flag per marker tick under the measure
 * numbers, plus a full-height delimitation line over the grid. Lives on its
 * own lane so loop gestures and marker gestures never overlap.
 */
export function PianoRollTimeMapOverlay({
  flags,
  selection,
  timelineDragPreview,
  viewport,
  projectStore,
  gridResolutionTicks,
  selectionMode,
  onOpenMarker,
  onSelectMarker,
  onMoveMarker,
}: PianoRollTimeMapOverlayProps): React.JSX.Element {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const flagElementsRef = useRef(new Map<Tick, HTMLButtonElement>());
  const flagLabelElementsRef = useRef(new Map<Tick, HTMLSpanElement>());
  const previewElementsRef = useRef(new Map<Tick, HTMLDivElement>());
  const boundaryElementsRef = useRef(new Map<Tick, HTMLElement>());
  const previewBoundaryElementsRef = useRef(new Map<Tick, HTMLElement>());
  const hoveredMarkerTickRef = useRef<Tick | null>(null);
  const suppressedActivationTickRef = useRef<Tick | null>(null);
  const getFlagElement = useCallback(
    (tick: Tick): HTMLButtonElement | null =>
      flagElementsRef.current.get(tick) ?? null,
    [],
  );
  const suppressMarkerActivation = useCallback((tick: Tick): void => {
    suppressedActivationTickRef.current = tick;
  }, []);
  const syncMarkerPresentation = useCallback((): void => {
    const currentViewport = viewport.get();
    const pixelsPerTick =
      currentViewport.zoomX / currentViewport.ticksPerPixel;
    const preview = timelineDragPreview.get();
    const projection = preview === null
      ? null
      : createMarkerPreviewProjection(
          flags,
          selection.markerGroups,
          preview,
        );

    for (const flag of flags) {
      const isIsolatedMeter = isIsolatedMeterMarkerFlag(flag);
      const selected = selection.hasMarkerGroup(flag.startTick);
      const previewGroup = projection?.sourceGroupsByTick.get(flag.startTick);
      const remainingFlag = projection?.remainingFlagsByTick.has(
        flag.startTick,
      ) === true
        ? projection.remainingFlagsByTick.get(flag.startTick) ?? null
        : flag;
      const receivesPreview =
        projection?.destinationFlagsByTick.has(flag.startTick) === true;
      const hideOriginal = projection !== null
        && (remainingFlag === null || receivesPreview);
      const originalBoundaryVisible = isOriginalMarkerBoundaryVisible({
        selected,
        hovered: !isIsolatedMeter
          && hoveredMarkerTickRef.current === flag.startTick,
        originalHidden: hideOriginal,
        sourcePreviewed: previewGroup !== undefined,
      }) && !isIsolatedMeter;
      const x =
        flag.startTick * pixelsPerTick
        - currentViewport.scrollX;
      const flagElement = flagElementsRef.current.get(flag.startTick);
      const labelElement = flagLabelElementsRef.current.get(flag.startTick);
      const previewElement = previewElementsRef.current.get(flag.startTick);
      const boundaryElement =
        boundaryElementsRef.current.get(flag.startTick);
      const previewBoundaryElement =
        previewBoundaryElementsRef.current.get(flag.startTick);

      if (flagElement !== undefined) {
        flagElement.style.display = hideOriginal ? "none" : "flex";
        flagElement.style.transform = `translate3d(${String(x)}px, 0, 0)`;
        flagElement.classList.toggle("is-selected", selected);
        flagElement.setAttribute("aria-pressed", String(selected));
        flagElement.classList.toggle(
          "has-section-marker",
          flag.isInitial
            && remainingFlag !== null
            && remainingFlag.sectionComment !== null,
        );
        flagElement.classList.toggle(
          "is-selection-residual",
          projection !== null
            && previewGroup !== undefined
            && !hideOriginal,
        );
      }

      if (boundaryElement !== undefined) {
        boundaryElement.style.transform = `translate3d(${String(x)}px, 0, 0)`;
        boundaryElement.classList.toggle(
          "is-visible",
          originalBoundaryVisible,
        );
      }

      if (labelElement !== undefined) {
        labelElement.textContent = remainingFlag === null
          ? ""
          : formatMarkerFlagLabel(remainingFlag);
      }

      if (previewElement !== undefined) {
        previewElement.style.display =
          projection === null || previewGroup === undefined
            ? "none"
            : "flex";

        if (projection !== null && previewGroup !== undefined) {
          const targetTick = flag.startTick + projection.deltaTicks;
          const destinationFlag =
            projection.destinationFlagsByTick.get(targetTick);
          const previewX =
            targetTick * pixelsPerTick
            - currentViewport.scrollX;

          previewElement.style.transform =
            `translate3d(${String(previewX)}px, 0, 0)`;
          previewElement.textContent = destinationFlag === undefined
            ? ""
            : formatMarkerFlagLabel(destinationFlag);
        }
      }

      if (previewBoundaryElement !== undefined) {
        previewBoundaryElement.classList.toggle(
          "is-visible",
          projection !== null && previewGroup !== undefined,
        );

        if (projection !== null && previewGroup !== undefined) {
          const previewX =
            (flag.startTick + projection.deltaTicks) * pixelsPerTick
            - currentViewport.scrollX;

          previewBoundaryElement.style.transform =
            `translate3d(${String(previewX)}px, 0, 0)`;
        }
      }
    }
  }, [flags, selection, timelineDragPreview, viewport]);

  useEffect(() => {
    syncMarkerPresentation();

    const unsubscribeViewport = viewport.subscribe(syncMarkerPresentation);
    const unsubscribePreview = timelineDragPreview.subscribe(
      syncMarkerPresentation,
    );
    const unsubscribeSelection = selection.subscribe(syncMarkerPresentation);

    return (): void => {
      unsubscribeViewport();
      unsubscribePreview();
      unsubscribeSelection();
    };
  }, [selection, syncMarkerPresentation, timelineDragPreview, viewport]);

  useEffect(
    () => projectStore.subscribe((state) => {
      selection.reconcile(state);
    }),
    [projectStore, selection],
  );

  const markerGesture = useTimeMapMarkerGesture({
    selection,
    timelineDragPreview,
    viewport,
    gridResolutionTicks,
    projectStore,
    layerRef,
    selectionMode,
    onSelectMarker,
    onMoveMarker,
    onSuppressActivation: suppressMarkerActivation,
    getFlagElement,
  });

  return (
    <>
      <div
        ref={layerRef}
        className="bar-ruler-marker-overlay"
        aria-label="Timeline markers"
      >
        {flags.map((flag) => (
          <React.Fragment key={flag.startTick}>
            <button
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
                }${
                  isIsolatedMeterMarkerFlag(flag) ? " is-meter-only" : ""
                }${
                  flag.isInitial && flag.sectionComment !== null
                    ? " has-section-marker"
                    : ""
                }`
              }
              type="button"
              data-marker-tick={flag.startTick}
              title={isIsolatedMeterMarkerFlag(flag)
                ? "Click to edit."
                : "Click to select. Double-click to edit."}
              aria-label={
                `Timeline marker ${formatMarkerFlagLabel(flag)}`
              }
              onPointerDown={(event) => {
                if (suppressedActivationTickRef.current === flag.startTick) {
                  suppressedActivationTickRef.current = null;
                }
                if (!isIsolatedMeterMarkerFlag(flag)) {
                  markerGesture.begin(flag, event);
                }
              }}
              onClick={(event) => {
                // Moving the point markers can leave a meter-only button at
                // this tick before the browser dispatches its synthetic click.
                if (suppressedActivationTickRef.current === flag.startTick) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                if (isIsolatedMeterMarkerFlag(flag)) {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenMarker(flag.startTick);
                }
              }}
              onDoubleClick={(event) => {
                if (suppressedActivationTickRef.current === flag.startTick) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                if (isIsolatedMeterMarkerFlag(flag)) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onOpenMarker(flag.startTick);
              }}
              onPointerEnter={() => {
                if (isIsolatedMeterMarkerFlag(flag)) {
                  return;
                }
                hoveredMarkerTickRef.current = flag.startTick;
                syncMarkerPresentation();
              }}
              onPointerLeave={() => {
                if (hoveredMarkerTickRef.current === flag.startTick) {
                  hoveredMarkerTickRef.current = null;
                  syncMarkerPresentation();
                }
              }}
            >
              <span
                ref={(element) => {
                  if (element === null) {
                    flagLabelElementsRef.current.delete(flag.startTick);
                  } else {
                    flagLabelElementsRef.current.set(flag.startTick, element);
                  }
                }}
              >
                {formatMarkerFlagLabel(flag)}
              </span>
            </button>
            <div
              ref={(element) => {
                if (element === null) {
                  previewElementsRef.current.delete(flag.startTick);
                } else {
                  previewElementsRef.current.set(flag.startTick, element);
                }
              }}
              className="bar-ruler-marker-flag is-selection-preview"
              aria-hidden="true"
            />
          </React.Fragment>
        ))}
      </div>
      <div className="bar-ruler-marker-boundaries" aria-hidden="true">
        {flags.map((flag) => (
          <React.Fragment key={flag.startTick}>
            <i
              ref={(element) => {
                if (element === null) {
                  boundaryElementsRef.current.delete(flag.startTick);
                } else {
                  boundaryElementsRef.current.set(flag.startTick, element);
                }
              }}
            />
            <i
              ref={(element) => {
                if (element === null) {
                  previewBoundaryElementsRef.current.delete(flag.startTick);
                } else {
                  previewBoundaryElementsRef.current.set(
                    flag.startTick,
                    element,
                  );
                }
              }}
              className="is-preview"
            />
          </React.Fragment>
        ))}
      </div>
    </>
  );
}
