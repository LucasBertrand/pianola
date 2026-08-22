import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import {
  type InstrumentId,
} from "../../../domain/identifiers";
import type {
  ViewportState,
} from "../../../editor/geometry/converter";
import type {
  SpatialIndex,
} from "../../../editor/geometry/spatial-index";
import type {
  SelectionMode,
} from "../../../editor/interactions/gestures/gesture-draft";
import type {
  PianoRollControllerPort,
} from "../../../editor/interactions/piano-roll-controller-port";
import {
  PianoRollInteractionSession,
} from "../../../editor/interactions/piano-roll-interaction-session";
import type {
  PointerInteractionStrategy,
} from "../../../editor/interactions/pointer/pointer-interaction-strategy";
import type {
  InstrumentRenderStyle,
} from "../../../editor/model/instrument-render-style";
import type {
  MutableRenderSignal,
  ReadonlyRenderSignal,
} from "../../../editor/model/render-signal";
import type {
  EditorSelectionRequests,
} from "../../../editor/selection/editor-selection-requests";
import type {
  EditorSelection,
} from "../../../editor/selection/editor-selection";
import type {
  PitchSnapSettings,
} from "../../../music/pitch-snap";
import type {
  EditorCommandPort,
} from "../../../use-cases/commands/editor-command-service";
import type {
  NoteCollisionResolutionRequest,
} from "../../../use-cases/piano-roll/notes/note-collision-resolution";
import type {
  MarkerCollisionResolutionRequest,
} from "../../../use-cases/piano-roll/timeline/marker-collision-resolution";
import type {
  InteractionVisualController,
} from "./interaction-visual-controller";
import {
  NoteGestureWorkflowAdapter,
} from "./note-gesture-workflow-adapter";
import {
  createPianoRollGestureStrategy,
} from "./piano-roll-gesture-strategy";
import {
  PianoRollSelectionController,
} from "./piano-roll-selection-controller";
import type {
  TimelineDragPreview,
} from "../../../editor/model/timeline-drag-preview";
import {
  getActiveClip,
} from "../../../domain/project/project-document";
import {
  resolvePitchSnapSettings,
} from "../../../use-cases/piano-roll/timeline/pitch-snap-resolution";

export interface UsePianoRollEventsOptions {
  readonly overlayRef: RefObject<HTMLElement | null>;
  readonly visualsRef: RefObject<InteractionVisualController | null>;
  readonly strategyRef: RefObject<PointerInteractionStrategy | null>;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly spatialIndex: SpatialIndex;
  readonly instrumentStyles: ReadonlyRenderSignal<
    Readonly<Record<InstrumentId, InstrumentRenderStyle>>
  >;
  readonly editorCommands: EditorCommandPort;
  readonly selection: EditorSelection;
  readonly activeInstrumentId: InstrumentId;
  readonly totalTicks: number;
  readonly selectionMode: SelectionMode;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly selectionRequests: EditorSelectionRequests;
  readonly highlightedPitch: MutableRenderSignal<number | null>;
  readonly timelineDragPreview: MutableRenderSignal<
    TimelineDragPreview | null
  >;
  readonly onGridSeek?: (tick: number) => void;
  readonly onSelectionChange?: (
    hasSelection: boolean,
    soleInstrumentId: InstrumentId | null,
  ) => void;
  readonly onNoteCollision?: (
    request: NoteCollisionResolutionRequest,
  ) => void;
  readonly onMarkerCollision?: (
    request: MarkerCollisionResolutionRequest,
  ) => void;
  readonly onTransactionRejected?: (error: unknown) => void;
}

/** Mounts the gesture strategy and exposes the imperative selection port. */
export function usePianoRollEvents(
  options: UsePianoRollEventsOptions,
): PianoRollControllerPort {
  const {
    overlayRef,
    visualsRef,
    strategyRef,
    viewport,
    spatialIndex,
    instrumentStyles,
    editorCommands,
    selection,
    activeInstrumentId,
    totalTicks,
    selectionMode,
    gridResolutionTicks,
    pitchSnapSettings,
    selectionRequests,
    highlightedPitch,
    timelineDragPreview,
    onGridSeek,
    onSelectionChange,
    onNoteCollision,
    onMarkerCollision,
    onTransactionRejected,
  } = options;
  const sessionRef = useRef<PianoRollInteractionSession | null>(null);
  const activeInstrumentIdRef = useRef(activeInstrumentId);

  activeInstrumentIdRef.current = activeInstrumentId;

  if (sessionRef.current === null) {
    sessionRef.current = new PianoRollInteractionSession(
      viewport.get(),
      viewport.version,
      selection,
    );
  }

  const session = sessionRef.current;
  const selectionController = useMemo(
    () => new PianoRollSelectionController({
      session,
      viewport,
      editorCommands,
      getVisuals: () => visualsRef.current,
      onSelectionChange,
    }),
    [
      editorCommands,
      onSelectionChange,
      session,
      viewport,
      visualsRef,
    ],
  );

  useEffect(() => {
    const overlay = overlayRef.current;

    if (overlay === null) {
      return undefined;
    }

    const workflow = new NoteGestureWorkflowAdapter({
      editorCommands,
      selection: session.selection,
      onSelectionChanged: () => selectionController.showSelection(),
      onCollision: onNoteCollision,
      ...(onMarkerCollision === undefined ? {} : { onMarkerCollision }),
      onTransactionRejected,
    });
    const strategy = createPianoRollGestureStrategy({
      overlay,
      getVisuals: () => visualsRef.current,
      session,
      viewport,
      selectionController,
      workflow,
      spatialIndex,
      instrumentStyles,
      editorCommands,
      getActiveInstrumentId: () => activeInstrumentIdRef.current,
      getInstrumentOrder: () => editorCommands.getState().instrumentOrder,
      totalTicks,
      selectionMode,
      gridResolutionTicks,
      pitchSnapSettings,
      onGridSeek,
      onPitchHighlightChange: (pitch) => {
        highlightedPitch.set(pitch);
      },
      timelineDragPreview,
    });
    const unsubscribeViewport = viewport.subscribe(
      () => selectionController.showSelection(),
    );
    const unsubscribeSelectionRequests = selectionRequests.subscribe(
      (request) => selectionController.handleRequest(request),
    );

    strategyRef.current = strategy;
    selectionController.showSelection();

    return (): void => {
      strategy.cancel();
      unsubscribeViewport();
      unsubscribeSelectionRequests();

      if (strategyRef.current === strategy) {
        strategyRef.current = null;
      }
    };
  }, [
    editorCommands,
    gridResolutionTicks,
    highlightedPitch,
    instrumentStyles,
    onGridSeek,
    onNoteCollision,
    onMarkerCollision,
    onTransactionRejected,
    overlayRef,
    pitchSnapSettings,
    selectionController,
    selectionMode,
    selectionRequests,
    session,
    spatialIndex,
    strategyRef,
    totalTicks,
    timelineDragPreview,
    viewport,
    visualsRef,
  ]);

  useEffect(() => {
    let externalPreviewActive = false;

    const updateExternalPreview = (): void => {
      const preview = timelineDragPreview.get();
      const visuals = visualsRef.current;

      if (
        preview?.source !== "markers"
        || preview.standaloneMarkerTick !== null
      ) {
        if (externalPreviewActive) {
          externalPreviewActive = false;
          visuals?.endDrag();
          selectionController.showSelection();
        }
        return;
      }

      const state = editorCommands.getState();
      const clip = getActiveClip(state);
      const converter = session.synchronizeConverter(
        viewport.get(),
        viewport.version,
      );
      const getSnapSettingsAtTick = (tick: number) =>
        resolvePitchSnapSettings(
          clip.timeline.timeMap,
          pitchSnapSettings.get(),
          tick,
        );

      if (!externalPreviewActive) {
        externalPreviewActive = true;
        visuals?.beginDrag(
          session.selection.notes,
          converter,
          instrumentStyles.get(),
          getSnapSettingsAtTick,
          clip.timeline.timeMap.scaleMarkers,
        );
      }

      const deltaX = converter.tickToCssPixelX(preview.deltaTicks)
        - converter.tickToCssPixelX(0);
      const pitchStepCssPixels = converter.pitchToCssPixelY(0)
        - converter.pitchToCssPixelY(1);

      visuals?.updateDrag(
        deltaX,
        pitchStepCssPixels,
        preview.deltaTicks,
        0,
        getSnapSettingsAtTick,
      );
    };

    const unsubscribe = timelineDragPreview.subscribe(updateExternalPreview);

    return (): void => {
      unsubscribe();

      if (externalPreviewActive) {
        visualsRef.current?.endDrag();
      }
    };
  }, [
    editorCommands,
    instrumentStyles,
    pitchSnapSettings,
    selectionController,
    session,
    timelineDragPreview,
    viewport,
    visualsRef,
  ]);

  return selectionController;
}
