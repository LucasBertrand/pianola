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
} from "../../../domain/project-store";
import {
  CoordinateConverter,
  type ViewportState,
} from "../../../editor/geometry/converter";
import type {
  Rect,
} from "../../../editor/geometry/rect";
import {
  SpatialIndex,
} from "../../../editor/geometry/spatial-index";
import type {
  ReadonlyEditingNoteMask,
} from "../../../editor/interactions/editing-note-mask";
import type {
  InstrumentRenderStyle,
} from "../../../editor/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../../../editor/model/note-color-mode";
import type {
  ReadonlyRenderSignal,
} from "../../../editor/model/render-signal";
import type {
  PitchSnapSettings,
} from "../../../music/pitch-snap";
import { paintGrid } from "./grid-painter";
import { paintNotes } from "./note-painter";
import {
  useCanvasRenderer,
  type CanvasFrame,
} from "./useCanvasRenderer";

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
}

export interface NotesCanvasProps extends CanvasProjectionLayerProps {
  readonly spatialIndex: SpatialIndex;
  readonly projectStore: ProjectStorePort;
  readonly instrumentStyles: ReadonlyRenderSignal<
    Readonly<Record<InstrumentId, InstrumentRenderStyle>>
  >;
  readonly noteColorMode: ReadonlyRenderSignal<NoteColorMode>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly editingNoteMask: ReadonlyEditingNoteMask;
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
        timeMap: activeClip.timeline.timeMap,
        durationTicks: activeClip.timeline.durationTicks,
      });
    },
    [
      gridResolutionTicks,
      pitchSnapSettings,
      highlightedPitch,
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
    pitchSnapSettings,
    editingNoteMask,
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
      paintNotes({
        context: frame.context,
        converter,
        visibleNotes,
        editingNoteIds: editingNoteMask.get(),
        stylesByInstrumentId: instrumentStyles.get(),
        instrumentOrder: projectStore.getState().instrumentOrder,
        colorMode: noteColorMode.get(),
        pitchLabelSettings: pitchSnapSettings.get(),
      });
    },
    [
      spatialIndex,
      editingNoteMask,
      viewport,
      visibleRegion,
      instrumentStyles,
      noteColorMode,
      pitchSnapSettings,
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
  useSignalInvalidation(pitchSnapSettings, renderer.invalidate);
  useSignalInvalidation(editingNoteMask, renderer.invalidate);
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
