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
} from "../../../editor-core/geometry/converter";
import type {
  SpatialIndex,
} from "../../../editor-core/geometry/spatial-index";
import type {
  SelectionMode,
} from "../../../editor-core/interactions/gestures/gesture-draft";
import type {
  PianoRollControllerPort,
} from "../piano-roll-controller-port";
import {
  PianoRollInteractionSession,
} from "../../../editor-core/interactions/piano-roll-interaction-session";
import type {
  PointerInteractionStrategy,
} from "../../../editor-core/interactions/pointer/pointer-interaction-strategy";
import type {
  InstrumentRenderStyle,
} from "../../../editor-core/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../../../editor-core/model/note-color-mode";
import type {
  MutableRenderSignal,
  ReadonlyRenderSignal,
} from "../../../editor-core/model/render-signal";
import type {
  EditorSelectionRequests,
} from "../../../editor-core/selection/editor-selection-requests";
import type {
  EditorSelection,
} from "../../../editor-core/selection/editor-selection";
import type {
  PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";
import type {
  EditorCommandPort,
} from "../../../application/history/editor-command-service";
import type {
  NoteCollisionResolutionRequest,
} from "../../../application/piano-roll/notes/note-collision-resolution";
import type {
  MarkerCollisionResolutionRequest,
} from "../../../application/piano-roll/timeline/marker-collision-resolution";
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
import {
  getActiveClip,
} from "../../../domain/project/project-document";
import {
  resolvePitchSnapSettings,
} from "../../../application/piano-roll/timeline/pitch-snap-resolution";
import type {
  ProjectStorePort,
} from "../../../application/history/project-store";
import {
  resolveEffectiveTimeMap,
  type TimeMapMarkerMovePreview,
  type TimeMapMarkerPreviewSession,
} from "../../../application/editor-session/time-map-marker-preview-session";

export interface UsePianoRollEventsOptions {
  readonly overlayRef: RefObject<HTMLElement | null>;
  readonly visualsRef: RefObject<InteractionVisualController | null>;
  readonly strategyRef: RefObject<PointerInteractionStrategy | null>;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly spatialIndex: SpatialIndex;
  readonly instrumentStyles: ReadonlyRenderSignal<
    Readonly<Record<InstrumentId, InstrumentRenderStyle>>
  >;
  readonly noteColorMode: ReadonlyRenderSignal<NoteColorMode>;
  readonly projectStore: ProjectStorePort;
  readonly editorCommands: EditorCommandPort;
  readonly selection: EditorSelection;
  readonly activeInstrumentId: InstrumentId;
  readonly totalTicks: number;
  readonly selectionMode: SelectionMode;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly selectionRequests: EditorSelectionRequests;
  readonly highlightedPitch: MutableRenderSignal<number | null>;
  readonly timeMapMarkerPreview: TimeMapMarkerPreviewSession;
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
    noteColorMode,
    projectStore,
    editorCommands,
    selection,
    activeInstrumentId,
    totalTicks,
    selectionMode,
    gridResolutionTicks,
    pitchSnapSettings,
    selectionRequests,
    highlightedPitch,
    timeMapMarkerPreview,
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
      timeMapMarkerPreview,
    });
    const unsubscribeViewport = viewport.subscribe(
      () => selectionController.showSelection(),
    );
    const refreshSelection = (): void => {
      selectionController.showSelection();
    };
    const unsubscribeInstrumentStyles = instrumentStyles.subscribe(
      refreshSelection,
    );
    const unsubscribeNoteColorMode = noteColorMode.subscribe(
      refreshSelection,
    );
    const unsubscribePitchSnapSettings = pitchSnapSettings.subscribe(
      refreshSelection,
    );
    const unsubscribeProject = projectStore.subscribe(refreshSelection);
    const unsubscribeSelectionRequests = selectionRequests.subscribe(
      (request) => selectionController.handleRequest(request),
    );

    strategyRef.current = strategy;
    selectionController.showSelection();

    return (): void => {
      strategy.cancel();
      unsubscribeViewport();
      unsubscribeInstrumentStyles();
      unsubscribeNoteColorMode();
      unsubscribePitchSnapSettings();
      unsubscribeProject();
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
    noteColorMode,
    onGridSeek,
    onNoteCollision,
    onMarkerCollision,
    onTransactionRejected,
    overlayRef,
    pitchSnapSettings,
    projectStore,
    selectionController,
    selectionMode,
    selectionRequests,
    session,
    spatialIndex,
    strategyRef,
    totalTicks,
    timeMapMarkerPreview,
    viewport,
    visualsRef,
  ]);

  useEffect(() => {
    let externalPreviewActive = false;

    const updateExternalPreview = (): void => {
      const preview = timeMapMarkerPreview.signal.get();
      const visuals = visualsRef.current;

      if (
        session.draft.mode === "DRAGGING"
        || preview === null
        || !doesPreviewMoveEditorSelection(preview, selection)
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
      const getEffectiveTimeMap = () => resolveEffectiveTimeMap(
        clip.timeline.timeMap,
        timeMapMarkerPreview.signal.get(),
        clip.id,
        state.revision,
      );
      const converter = session.synchronizeConverter(
        viewport.get(),
        viewport.version,
      );
      const getSnapSettingsAtTick = (tick: number) =>
        resolvePitchSnapSettings(
          getEffectiveTimeMap(),
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
          () => getEffectiveTimeMap().scaleMarkers,
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

    const unsubscribe = timeMapMarkerPreview.signal.subscribe(
      updateExternalPreview,
    );

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
    timeMapMarkerPreview,
    viewport,
    visualsRef,
  ]);

  return selectionController;
}

function doesPreviewMoveEditorSelection(
  preview: TimeMapMarkerMovePreview,
  selection: EditorSelection,
): boolean {
  if (
    selection.notes.length === 0
    || preview.movedGroups.length !== selection.markerGroups.length
  ) {
    return false;
  }

  return preview.movedGroups.every((group) => {
    const selected = selection.findMarkerGroup(group.startTick);

    return selected !== undefined
      && selected.kinds.length === group.kinds.length
      && group.kinds.every((kind) => selected.kinds.includes(kind));
  });
}
