import React, {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import type {
  Note,
  NoteId,
  ProjectState,
  VoiceId,
} from "../../domain/model";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import {
  CoordinateConverter,
  MAX_MIDI_PITCH,
  MIN_MIDI_PITCH,
  type ViewportState,
} from "../../geometry/converter";
import {
  SpatialIndex,
} from "../../geometry/spatial-index";
import {
  useCanvasRenderer,
  type CanvasFrame,
} from "../hooks/useCanvasRenderer";
import type {
  PianoRollEventController,
} from "../hooks/usePianoRollEvents";
import type {
  InteractionToolSignal,
} from "../interactions/types";
import type {
  ReadonlyRenderSignal,
} from "../rendering/render-signal";
import {
  InteractionOverlay,
} from "./InteractionOverlay";

export interface Rect {
  readonly startTick: number;
  readonly endTick: number;
  readonly minPitch: number;
  readonly maxPitch: number;
}

export interface CanvasLayerProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly visibleRegion: ReadonlyRenderSignal<Rect>;
}

export interface VoiceRenderStyle {
  readonly fillStyle: string;
  readonly opacity: number;
}

export type NoteColorMode = "voice" | "pitch";

export interface GridCanvasProps extends CanvasLayerProps {
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly projectStore: ProjectStorePort;
}

export interface NotesCanvasProps extends CanvasLayerProps {
  readonly spatialIndex: SpatialIndex;
  readonly voiceStyles: ReadonlyRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
  readonly noteColorMode: ReadonlyRenderSignal<NoteColorMode>;
  readonly editingNoteIds: ReadonlySet<NoteId>;
}

export interface PianoRollLayersProps extends CanvasLayerProps {
  readonly spatialIndex: SpatialIndex;
  readonly voiceStyles: ReadonlyRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
  readonly noteColorMode: ReadonlyRenderSignal<NoteColorMode>;
  readonly projectStore: ProjectStorePort;
  readonly toolState: InteractionToolSignal;
  readonly activeVoiceId: VoiceId;
  readonly totalTicks: number;
  readonly setViewport: (viewport: ViewportState) => void;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly voiceSelectionRequest: ReadonlyRenderSignal<VoiceId | null>;
  readonly eventControllerRef: MutableRefObject<
    PianoRollEventController | null
  >;
  readonly onSelectionChange: (hasSelection: boolean) => void;
}

const LAYER_STACK_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  isolation: "isolate",
};

const CANVAS_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
};

const OPAQUE_CONTEXT_ATTRIBUTES: CanvasRenderingContext2DSettings = {
  alpha: true,
};

const TRANSPARENT_CONTEXT_ATTRIBUTES: CanvasRenderingContext2DSettings = {
  alpha: true,
};

const GRID_BACKGROUND_COLOR = "#16181d";
const BLACK_KEY_ROW_COLOR = "#121419";
const PITCH_LINE_COLOR = "#252a33";
const SUBDIVISION_LINE_COLOR = "#242933";
const BEAT_LINE_COLOR = "#303744";
const BAR_LINE_COLOR = "#465164";
const DEFAULT_NOTE_COLOR = "#6ea8fe";
const PITCH_CLASS_NOTE_COLORS = [
  "#ef5c65",
  "#f07c5d",
  "#eaa64f",
  "#d3c958",
  "#8bcf63",
  "#55c89e",
  "#4bc2d1",
  "#5797ea",
  "#7775e8",
  "#a66fdc",
  "#d56dbc",
  "#ea6f8d",
] as const;
const MIN_GRID_LINE_SPACING_CSS_PIXELS = 4;
const MAX_GRID_LINES_PER_PASS = 4_096;

export function PianoRollLayers(
  props: PianoRollLayersProps,
): React.JSX.Element {
  const {
    viewport,
    visibleRegion,
    spatialIndex,
    voiceStyles,
    noteColorMode,
    projectStore,
    toolState,
    activeVoiceId,
    totalTicks,
    setViewport,
    gridResolutionTicks,
    voiceSelectionRequest,
    eventControllerRef,
    onSelectionChange,
  } = props;
  const editingNoteIdsRef = useRef<Set<NoteId> | null>(null);

  if (editingNoteIdsRef.current === null) {
    editingNoteIdsRef.current = new Set<NoteId>();
  }

  const editingNoteIds = editingNoteIdsRef.current;

  return (
    <div style={LAYER_STACK_STYLE}>
      <GridCanvas
        viewport={viewport}
        visibleRegion={visibleRegion}
        gridResolutionTicks={gridResolutionTicks}
        projectStore={projectStore}
      />
      <NotesCanvas
        viewport={viewport}
        visibleRegion={visibleRegion}
        spatialIndex={spatialIndex}
        voiceStyles={voiceStyles}
        noteColorMode={noteColorMode}
        editingNoteIds={editingNoteIds}
      />
      <InteractionOverlay
        viewport={viewport}
        spatialIndex={spatialIndex}
        voiceStyles={voiceStyles}
        noteColorMode={noteColorMode}
        projectStore={projectStore}
        toolState={toolState}
        activeVoiceId={activeVoiceId}
        totalTicks={totalTicks}
        setViewport={setViewport}
        gridResolutionTicks={gridResolutionTicks}
        voiceSelectionRequest={voiceSelectionRequest}
        editingNoteIds={editingNoteIds}
        eventControllerRef={eventControllerRef}
        onSelectionChange={onSelectionChange}
      />
    </div>
  );
}

export function GridCanvas(props: GridCanvasProps): React.JSX.Element {
  const {
    viewport,
    visibleRegion,
    gridResolutionTicks,
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

      paintGrid(
        frame.context,
        frame,
        converter,
        visibleRegion.get(),
        gridResolutionTicks.get(),
        projectStore.getState().transportSettings,
      );
    },
    [
      gridResolutionTicks,
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
  useEffect(
    () => projectStore.subscribe(renderer.invalidate),
    [
      projectStore,
      renderer.invalidate,
    ],
  );

  return (
    <canvas
      ref={renderer.canvasRef}
      style={CANVAS_LAYER_STYLE}
      aria-hidden="true"
    />
  );
}

export function NotesCanvas(props: NotesCanvasProps): React.JSX.Element {
  const {
    viewport,
    visibleRegion,
    spatialIndex,
    voiceStyles,
    noteColorMode,
    editingNoteIds,
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
      const stylesByVoiceId = voiceStyles.get();
      const colorMode = noteColorMode.get();

      spatialIndex.queryRect(
        region.startTick,
        region.endTick,
        region.minPitch,
        region.maxPitch,
        visibleNotes,
      );
      visibleNotes.sort(
        colorMode === "voice"
          ? compareNotesByVoice
          : compareNotesByPitch,
      );

      let currentVoiceId: VoiceId | null = null;
      let currentPitch = -1;
      let currentOpacity = -1;
      const context = frame.context;

      for (
        let noteIndex = 0;
        noteIndex < visibleNotes.length;
        noteIndex += 1
      ) {
        const note = visibleNotes[noteIndex];

        if (note === undefined) {
          continue;
        }

        if (editingNoteIds.has(note.id)) {
          continue;
        }

        const voiceStyle = stylesByVoiceId[note.voiceId];

        if (
          (
            colorMode === "voice"
            && note.voiceId !== currentVoiceId
          )
          || (
            colorMode === "pitch"
            && note.pitch !== currentPitch
          )
        ) {
          context.fillStyle =
            getNoteFillStyle(
              note,
              stylesByVoiceId,
              colorMode,
            );
          currentVoiceId = note.voiceId;
          currentPitch = note.pitch;
        }

        const opacity = voiceStyle?.opacity ?? 1;

        if (opacity !== currentOpacity) {
          context.globalAlpha = voiceStyle?.opacity ?? 1;
          currentOpacity = opacity;
        }

        const x = converter.tickToCssPixelX(note.startTick);
        const endX = converter.tickToCssPixelX(
          note.startTick + note.durationTicks,
        );
        const y = converter.pitchToCssPixelY(note.pitch);
        const nextRowY = converter.pitchToCssPixelY(note.pitch - 1);
        const width = endX - x;
        const height = Math.max(1, nextRowY - y - 1);

        context.fillRect(x, y, width, height);
      }
    },
    [
      spatialIndex,
      editingNoteIds,
      viewport,
      visibleRegion,
      voiceStyles,
      noteColorMode,
    ],
  );
  const renderer = useCanvasRenderer({
    render: renderNotes,
    mode: "continuous",
    clearBeforeRender: true,
    contextAttributes: TRANSPARENT_CONTEXT_ATTRIBUTES,
  });

  return (
    <canvas
      ref={renderer.canvasRef}
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
  }, [
    signal,
    invalidate,
  ]);
}

function paintGrid(
  context: CanvasRenderingContext2D,
  frame: CanvasFrame,
  converter: CoordinateConverter,
  region: Rect,
  gridResolutionTicks: number,
  transport: ProjectState["transportSettings"],
): void {
  const width = frame.widthCssPixels;
  const height = frame.heightCssPixels;

  context.fillStyle = GRID_BACKGROUND_COLOR;
  context.fillRect(0, 0, width, height);

  const firstPitch = Math.max(
    MIN_MIDI_PITCH,
    Math.ceil(region.minPitch),
  );
  const lastPitch = Math.min(
    MAX_MIDI_PITCH,
    Math.floor(region.maxPitch),
  );

  context.fillStyle = BLACK_KEY_ROW_COLOR;

  for (let pitch = firstPitch; pitch <= lastPitch; pitch += 1) {
    if (isBlackKey(pitch)) {
      const y = converter.pitchToCssPixelY(pitch);
      const nextY = converter.pitchToCssPixelY(pitch - 1);
      context.fillRect(0, y, width, nextY - y);
    }
  }

  for (let pitch = firstPitch; pitch <= lastPitch; pitch += 1) {
    const y = converter.pitchToCssPixelY(pitch);
    fillHorizontalDeviceLine(
      context,
      y,
      width,
      frame.devicePixelRatio,
      PITCH_LINE_COLOR,
    );
  }

  if (
    !Number.isSafeInteger(gridResolutionTicks)
    || gridResolutionTicks <= 0
  ) {
    return;
  }

  const effectiveResolutionTicks = getEffectiveGridResolution(
    converter,
    region,
    gridResolutionTicks,
  );

  drawTickLines(
    context,
    frame.devicePixelRatio,
    converter,
    region,
    height,
    effectiveResolutionTicks,
    SUBDIVISION_LINE_COLOR,
  );
  const ticksPerBeat =
    transport.ppqn * 4 / transport.timeSignature.denominator;

  drawTickLines(
    context,
    frame.devicePixelRatio,
    converter,
    region,
    height,
    ticksPerBeat,
    BEAT_LINE_COLOR,
  );
  drawTickLines(
    context,
    frame.devicePixelRatio,
    converter,
    region,
    height,
    ticksPerBeat * transport.timeSignature.numerator,
    BAR_LINE_COLOR,
  );
}

function getEffectiveGridResolution(
  converter: CoordinateConverter,
  region: Rect,
  requestedResolutionTicks: number,
): number {
  let resolutionTicks = requestedResolutionTicks;
  let lineSpacing = Math.abs(
    converter.tickToCssPixelX(resolutionTicks)
    - converter.tickToCssPixelX(0),
  );
  const visibleTickSpan = Math.max(
    0,
    region.endTick - region.startTick,
  );

  while (
    lineSpacing < MIN_GRID_LINE_SPACING_CSS_PIXELS
    || visibleTickSpan / resolutionTicks > MAX_GRID_LINES_PER_PASS
  ) {
    resolutionTicks *= 2;
    lineSpacing *= 2;

    if (!Number.isSafeInteger(resolutionTicks)) {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  return resolutionTicks;
}

function drawTickLines(
  context: CanvasRenderingContext2D,
  devicePixelRatio: number,
  converter: CoordinateConverter,
  region: Rect,
  height: number,
  resolutionTicks: number,
  color: string,
): void {
  if (!Number.isFinite(resolutionTicks) || resolutionTicks <= 0) {
    return;
  }

  const firstTick =
    Math.floor(region.startTick / resolutionTicks) * resolutionTicks;

  for (
    let tick = firstTick;
    tick <= region.endTick;
    tick += resolutionTicks
  ) {
    const x = converter.tickToCssPixelX(tick);
    fillVerticalDeviceLine(
      context,
      x,
      height,
      devicePixelRatio,
      color,
    );
  }
}

function fillVerticalDeviceLine(
  context: CanvasRenderingContext2D,
  x: number,
  height: number,
  devicePixelRatio: number,
  color: string,
): void {
  const lineWidth = 1 / devicePixelRatio;
  const alignedX =
    Math.round(x * devicePixelRatio) / devicePixelRatio;

  context.fillStyle = color;
  context.fillRect(alignedX, 0, lineWidth, height);
}

function fillHorizontalDeviceLine(
  context: CanvasRenderingContext2D,
  y: number,
  width: number,
  devicePixelRatio: number,
  color: string,
): void {
  const lineHeight = 1 / devicePixelRatio;
  const alignedY =
    Math.round(y * devicePixelRatio) / devicePixelRatio;

  context.fillStyle = color;
  context.fillRect(0, alignedY, width, lineHeight);
}

function compareNotesByVoice(left: Note, right: Note): number {
  if (left.voiceId < right.voiceId) {
    return -1;
  }

  if (left.voiceId > right.voiceId) {
    return 1;
  }

  const startDifference = left.startTick - right.startTick;

  if (startDifference !== 0) {
    return startDifference;
  }

  if (left.id < right.id) {
    return -1;
  }

  if (left.id > right.id) {
    return 1;
  }

  return 0;
}

function compareNotesByPitch(left: Note, right: Note): number {
  if (left.pitch !== right.pitch) {
    return left.pitch - right.pitch;
  }

  return compareNotesByVoice(left, right);
}

export function getNoteFillStyle(
  note: Note,
  stylesByVoiceId: Readonly<Record<VoiceId, VoiceRenderStyle>>,
  colorMode: NoteColorMode,
): string {
  return colorMode === "pitch"
    ? getPitchNoteColor(note.pitch)
    : stylesByVoiceId[note.voiceId]?.fillStyle
      ?? DEFAULT_NOTE_COLOR;
}

export function getPitchNoteColor(pitch: number): string {
  const pitchClass = ((pitch % 12) + 12) % 12;

  return PITCH_CLASS_NOTE_COLORS[pitchClass]
    ?? DEFAULT_NOTE_COLOR;
}

function isBlackKey(pitch: number): boolean {
  const pitchClass = pitch % 12;

  return (
    pitchClass === 1
    || pitchClass === 3
    || pitchClass === 6
    || pitchClass === 8
    || pitchClass === 10
  );
}
