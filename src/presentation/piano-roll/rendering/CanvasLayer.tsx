import React, {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  getActiveClip,
} from "../../../domain/project/project-document";

import {
  type InstrumentId,
} from "../../../domain/identifiers";
import {
  type Note,
} from "../../../domain/notes/note";
import type {
  ProjectStorePort,
} from "../../../application/history/project-store";
import {
  CoordinateConverter,
  type ViewportState,
} from "../../../editor-core/geometry/converter";
import type {
  Rect,
} from "../../../editor-core/geometry/rect";
import {
  SpatialIndex,
} from "../../../editor-core/geometry/spatial-index";
import type {
  ReadonlyEditingNoteMask,
} from "../../../editor-core/interactions/editing-note-mask";
import type {
  InstrumentRenderStyle,
} from "../../../editor-core/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../../../editor-core/model/note-color-mode";
import type {
  NoteLabelMode,
} from "../../../editor-core/model/note-label-mode";
import type {
  ReadonlyRenderSignal,
} from "../../../editor-core/model/render-signal";
import type {
  PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";
import { paintGrid } from "./grid-painter";
import { paintNotes } from "./note-painter";
import {
  useCanvasRenderer,
  type CanvasFrame,
} from "./useCanvasRenderer";
import {
  resolveEffectiveTimeMap,
  type TimeMapMarkerMovePreview,
} from "../../../application/editor-session/time-map-marker-preview-session";

const CANVAS_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
};

const OPAQUE_CONTEXT_ATTRIBUTES: CanvasRenderingContext2DSettings = {
  alpha: false,
};

const TRANSPARENT_CONTEXT_ATTRIBUTES: CanvasRenderingContext2DSettings = {
  alpha: true,
};

export interface CanvasProjectionLayerProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly visibleRegion: ReadonlyRenderSignal<Rect>;
}

export interface GridCanvasProps extends CanvasProjectionLayerProps {
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly projectStore: ProjectStorePort;
  readonly highlightedPitch: ReadonlyRenderSignal<number | null>;
  readonly markerPreview: ReadonlyRenderSignal<
    TimeMapMarkerMovePreview | null
  >;
}

export interface NotesCanvasProps extends CanvasProjectionLayerProps {
  readonly spatialIndex: SpatialIndex;
  readonly projectStore: ProjectStorePort;
  readonly instrumentStyles: ReadonlyRenderSignal<
    Readonly<Record<InstrumentId, InstrumentRenderStyle>>
  >;
  readonly noteColorMode: ReadonlyRenderSignal<NoteColorMode>;
  readonly noteLabelMode: ReadonlyRenderSignal<NoteLabelMode>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly editingNoteMask: ReadonlyEditingNoteMask;
  readonly markerPreview: ReadonlyRenderSignal<
    TimeMapMarkerMovePreview | null
  >;
}

interface CanvasLayerProps {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function GridCanvas(props: GridCanvasProps): React.JSX.Element {
  const {
    viewport,
    visibleRegion,
    gridResolutionTicks,
    pitchSnapSettings,
    highlightedPitch,
    projectStore,
    markerPreview,
  } = props;
  const converterRef = useRef<CoordinateConverter | null>(null);
  const converterVersionRef = useRef(-1);

  if (converterRef.current === null) {
    converterRef.current = new CoordinateConverter(viewport.get());
    converterVersionRef.current = viewport.version;
  }

  const renderGrid = useCallback(
    (frame: CanvasFrame): void => {
      const converter = converterRef.current;

      if (converter === null) {
        return;
      }

      if (converterVersionRef.current !== viewport.version) {
        converter.setViewportState(viewport.get());
        converterVersionRef.current = viewport.version;
      }

      const state = projectStore.getState();
      const activeClip = getActiveClip(state);
      const timeMap = resolveEffectiveTimeMap(
        activeClip.timeline.timeMap,
        markerPreview.get(),
        activeClip.id,
        state.revision,
      );

      paintGrid({
        context: frame.context,
        widthCssPixels: frame.widthCssPixels,
        heightCssPixels: frame.heightCssPixels,
        devicePixelRatio: frame.devicePixelRatio,
        converter,
        visibleRegion: visibleRegion.get(),
        gridResolutionTicks: gridResolutionTicks.get(),
        pitchSnapSettings: pitchSnapSettings.get(),
        highlightedPitch: highlightedPitch.get(),
        clock: state.clock,
        timeMap,
        durationTicks: activeClip.timeline.durationTicks,
      });
    },
    [
      gridResolutionTicks,
      pitchSnapSettings,
      highlightedPitch,
      markerPreview,
      projectStore,
      viewport,
      visibleRegion,
    ],
  );
  const renderer = useCanvasRenderer({
    render: renderGrid,
    mode: "on-demand",
    clearBeforeRender: true,
    contextAttributes: OPAQUE_CONTEXT_ATTRIBUTES,
  });

  useSignalInvalidation(viewport, renderer.invalidate);
  useSignalInvalidation(visibleRegion, renderer.invalidate);
  useSignalInvalidation(gridResolutionTicks, renderer.invalidate);
  useSignalInvalidation(pitchSnapSettings, renderer.invalidate);
  useSignalInvalidation(highlightedPitch, renderer.invalidate);
  useSignalInvalidation(markerPreview, renderer.invalidate);
  useEffect(
    () => projectStore.subscribe(renderer.invalidate),
    [projectStore, renderer.invalidate],
  );

  return <CanvasLayer canvasRef={renderer.canvasRef} />;
}

export function NotesCanvas(props: NotesCanvasProps): React.JSX.Element {
  const {
    viewport,
    visibleRegion,
    spatialIndex,
    projectStore,
    instrumentStyles,
    noteColorMode,
    noteLabelMode,
    pitchSnapSettings,
    editingNoteMask,
    markerPreview,
  } = props;
  const converterRef = useRef<CoordinateConverter | null>(null);
  const converterVersionRef = useRef(-1);
  const visibleNotesRef = useRef<Note[]>([]);

  if (converterRef.current === null) {
    converterRef.current = new CoordinateConverter(viewport.get());
    converterVersionRef.current = viewport.version;
  }

  const renderNotes = useCallback(
    (frame: CanvasFrame): void => {
      const converter = converterRef.current;

      if (converter === null) {
        return;
      }

      if (converterVersionRef.current !== viewport.version) {
        converter.setViewportState(viewport.get());
        converterVersionRef.current = viewport.version;
      }

      const region = visibleRegion.get();
      const visibleNotes = visibleNotesRef.current;

      spatialIndex.queryRect(
        region.startTick,
        region.endTick,
        region.minPitch,
        region.maxPitch,
        visibleNotes,
      );
      const state = projectStore.getState();
      const activeClip = getActiveClip(state);
      const timeMap = resolveEffectiveTimeMap(
        activeClip.timeline.timeMap,
        markerPreview.get(),
        activeClip.id,
        state.revision,
      );
      paintNotes({
        context: frame.context,
        converter,
        visibleNotes,
        editingNoteIds: editingNoteMask.get(),
        stylesByInstrumentId: instrumentStyles.get(),
        instrumentOrder: state.instrumentOrder,
        colorMode: noteColorMode.get(),
        labelMode: noteLabelMode.get(),
        globalPitchSnapSettings: pitchSnapSettings.get(),
        timeMap,
      });
    },
    [
      spatialIndex,
      editingNoteMask,
      viewport,
      visibleRegion,
      instrumentStyles,
      noteColorMode,
      noteLabelMode,
      pitchSnapSettings,
      markerPreview,
    ],
  );
  const renderer = useCanvasRenderer({
    render: renderNotes,
    mode: "on-demand",
    clearBeforeRender: true,
    contextAttributes: TRANSPARENT_CONTEXT_ATTRIBUTES,
  });

  useSignalInvalidation(viewport, renderer.invalidate);
  useSignalInvalidation(visibleRegion, renderer.invalidate);
  useSignalInvalidation(instrumentStyles, renderer.invalidate);
  useSignalInvalidation(noteColorMode, renderer.invalidate);
  useSignalInvalidation(noteLabelMode, renderer.invalidate);
  useSignalInvalidation(pitchSnapSettings, renderer.invalidate);
  useSignalInvalidation(editingNoteMask, renderer.invalidate);
  useSignalInvalidation(markerPreview, renderer.invalidate);
  useEffect(
    () => projectStore.subscribe(renderer.invalidate),
    [projectStore, renderer.invalidate],
  );

  return <CanvasLayer canvasRef={renderer.canvasRef} />;
}

function CanvasLayer(props: CanvasLayerProps): React.JSX.Element {
  return (
    <canvas
      ref={props.canvasRef}
      style={CANVAS_LAYER_STYLE}
      aria-hidden="true"
    />
  );
}

function useSignalInvalidation<T>(
  signal: ReadonlyRenderSignal<T>,
  invalidate: () => void,
): void {
  useEffect(() => {
    invalidate();
    return signal.subscribe(invalidate);
  }, [signal, invalidate]);
}
