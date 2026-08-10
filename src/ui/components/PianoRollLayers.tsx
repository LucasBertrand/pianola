import React, {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import {
  APPLICATION_COLORS,
} from "../../config/application-colors";
import {
  RENDERING_CONSTANTS,
} from "../../config/program-constants";
import {
  getActiveClip,
  type Note,
  type TransportState,
  type VoiceId,
} from "../../domain/model";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  NoteCollisionResolutionRequest,
} from "../../application/note-collision-resolution";
import {
  CoordinateConverter,
  MAX_MIDI_PITCH,
  MIN_MIDI_PITCH,
  type ViewportState,
} from "../../geometry/converter";
import {
  SpatialIndex,
} from "../../geometry/spatial-index";
import type {
  Rect,
} from "../../geometry/rect";
import {
  EditingNoteMask,
  type ReadonlyEditingNoteMask,
} from "../../interaction/core/editing-note-mask";
import {
  useCanvasRenderer,
  type CanvasFrame,
} from "../hooks/useCanvasRenderer";
import type {
  PianoRollEventController,
} from "../../interaction/piano-roll-event-controller";
import type {
  SelectionMode,
} from "../../interaction/core/state";
import type {
  PianoRollRuntimePort,
} from "../contracts/piano-roll-runtime";
import {
  getPitchScaleDegreeColorIndex,
  getPitchSnapRootPitchClass,
  isPitchAllowedByTonalPattern,
  type PitchSnapSettings,
} from "../../music/pitch-snap";
import type {
  ReadonlyRenderSignal,
} from "../rendering/render-signal";
import {
  compareNotesByPitchRenderOrder,
  compareNotesByVoiceRenderOrder,
  getNoteFillStyle,
  type NoteColorMode,
  type VoiceRenderStyle,
} from "../rendering/note-style";
import {
  APPLICATION_SURFACE_COLOR,
} from "../rendering/theme";
import {
  getMidiNoteLabel,
  getPitchLabelContextKey,
} from "../rendering/pitch-label";
import {
  InteractionOverlay,
} from "./InteractionOverlay";

export interface CanvasLayerProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly visibleRegion: ReadonlyRenderSignal<Rect>;
}

export interface GridCanvasProps extends CanvasLayerProps {
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly projectStore: ProjectStorePort;
  readonly highlightedPitch: ReadonlyRenderSignal<number | null>;
}

export interface NotesCanvasProps extends CanvasLayerProps {
  readonly spatialIndex: SpatialIndex;
  readonly projectStore: ProjectStorePort;
  readonly voiceStyles: ReadonlyRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
  readonly noteColorMode: ReadonlyRenderSignal<NoteColorMode>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly editingNoteMask: ReadonlyEditingNoteMask;
}

export interface PianoRollLayersProps {
  readonly runtime: PianoRollRuntimePort;
  readonly selectionMode: SelectionMode;
  readonly activeVoiceId: VoiceId;
  readonly totalTicks: number;
  readonly setViewport: (viewport: ViewportState) => void;
  readonly eventControllerRef: MutableRefObject<
    PianoRollEventController | null
  >;
  readonly onSelectionChange: (
    hasSelection: boolean,
    soleVoiceId: VoiceId | null,
  ) => void;
  readonly onGridSeek: (tick: number) => void;
  readonly onNoteCollision: (
    request: NoteCollisionResolutionRequest,
  ) => void;
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
  alpha: false,
};

const TRANSPARENT_CONTEXT_ATTRIBUTES: CanvasRenderingContext2DSettings = {
  alpha: true,
};

const GRID_BACKGROUND_COLOR = APPLICATION_SURFACE_COLOR;
const BLACK_KEY_ROW_COLOR =
  RENDERING_CONSTANTS.gridBlackKeyRowColor;
const PITCH_LINE_COLOR =
  RENDERING_CONSTANTS.gridPitchLineColor;
const SUBDIVISION_LINE_COLOR =
  RENDERING_CONSTANTS.gridSubdivisionLineColor;
const BEAT_LINE_COLOR =
  RENDERING_CONSTANTS.gridBeatLineColor;
const BAR_LINE_COLOR =
  RENDERING_CONSTANTS.gridBarLineColor;
const MIN_GRID_LINE_SPACING_CSS_PIXELS =
  RENDERING_CONSTANTS.minimumGridLineSpacingCssPixels;
const MAX_GRID_LINES_PER_PASS =
  RENDERING_CONSTANTS.maximumGridLinesPerPass;
const NOTE_LABEL_MINIMUM_HEIGHT =
  RENDERING_CONSTANTS.noteLabelMinimumHeightCssPixels;
const NOTE_LABEL_HORIZONTAL_PADDING =
  RENDERING_CONSTANTS.noteLabelHorizontalPaddingCssPixels;
const NOTE_LABEL_FONT_SIZE =
  RENDERING_CONSTANTS.noteLabelFontSizeCssPixels;
const NOTE_LABEL_COLOR =
  RENDERING_CONSTANTS.noteLabelColor;
const TONAL_SNAP_PITCH_ROW_COLOR =
  RENDERING_CONSTANTS.tonalSnapPitchRowColor;
const TONAL_SNAP_TONIC_ROW_COLOR =
  RENDERING_CONSTANTS.tonalSnapTonicRowColor;
const ACTIVE_PITCH_LANE_COLOR =
  RENDERING_CONSTANTS.activePitchLaneColor;

export function PianoRollLayers(
  props: PianoRollLayersProps,
): React.JSX.Element {
  const {
    runtime,
    selectionMode,
    activeVoiceId,
    totalTicks,
    setViewport,
    eventControllerRef,
    onSelectionChange,
    onGridSeek,
    onNoteCollision,
  } = props;
  const {
    viewport,
    visibleRegion,
    spatialIndex,
    voiceStyles,
    noteColorMode,
    projectStore,
    gridResolutionTicks,
    pitchSnapSettings,
    highlightedPitch,
  } = runtime;
  const editingNoteMaskRef = useRef<EditingNoteMask | null>(null);

  if (editingNoteMaskRef.current === null) {
    editingNoteMaskRef.current = new EditingNoteMask();
  }

  const editingNoteMask = editingNoteMaskRef.current;

  return (
    <div style={LAYER_STACK_STYLE}>
      <GridCanvas
        viewport={viewport}
        visibleRegion={visibleRegion}
        gridResolutionTicks={gridResolutionTicks}
        pitchSnapSettings={pitchSnapSettings}
        highlightedPitch={highlightedPitch}
        projectStore={projectStore}
      />
      <NotesCanvas
        viewport={viewport}
        visibleRegion={visibleRegion}
        spatialIndex={spatialIndex}
        projectStore={projectStore}
        voiceStyles={voiceStyles}
        noteColorMode={noteColorMode}
        pitchSnapSettings={pitchSnapSettings}
        editingNoteMask={editingNoteMask}
      />
      <InteractionOverlay
        runtime={runtime}
        selectionMode={selectionMode}
        activeVoiceId={activeVoiceId}
        totalTicks={totalTicks}
        setViewport={setViewport}
        editingNoteMask={editingNoteMask}
        eventControllerRef={eventControllerRef}
        onSelectionChange={onSelectionChange}
        onGridSeek={onGridSeek}
        onNoteCollision={onNoteCollision}
      />
    </div>
  );
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

      paintGrid(
        frame.context,
        frame,
        converter,
        visibleRegion.get(),
        gridResolutionTicks.get(),
        pitchSnapSettings.get(),
        highlightedPitch.get(),
        getActiveClip(projectStore.getState()).transportSettings,
      );
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
    projectStore,
    voiceStyles,
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
      const stylesByVoiceId = voiceStyles.get();
      const colorMode = noteColorMode.get();
      const labelSettings = pitchSnapSettings.get();
      const editingNoteIds = editingNoteMask.get();

      spatialIndex.queryRect(
        region.startTick,
        region.endTick,
        region.minPitch,
        region.maxPitch,
        visibleNotes,
      );
      visibleNotes.sort(
        colorMode === "voice"
          ? compareNotesByVoiceRenderOrder
          : compareNotesByPitchRenderOrder,
      );

      let currentVoiceId: VoiceId | null = null;
      let currentPitch = -1;
      let currentOpacity = -1;
      let hasVisibleLockedNote = false;
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
              labelSettings,
            );
          currentVoiceId = note.voiceId;
          currentPitch = note.pitch;
        }

        const opacity =
          (voiceStyle?.opacity ?? 1)
          * (note.enabled ? 1 : 0.36);

        if (voiceStyle?.locked === true) {
          hasVisibleLockedNote = true;
        }

        if (opacity !== currentOpacity) {
          context.globalAlpha = opacity;
          currentOpacity = opacity;
        }

        const x = converter.tickToCssPixelX(note.startTick);
        const endX = converter.tickToCssPixelX(
          note.startTick + note.durationTicks,
        );
        const y = converter.pitchToCssPixelY(note.pitch);
        const nextRowY = converter.pitchToCssPixelY(note.pitch - 1);
        const width = Math.max(1, endX - x - 1);
        const height = Math.max(1, nextRowY - y - 1);

        context.fillRect(x, y, width, height);
      }

      const lockedPattern =
        hasVisibleLockedNote
          ? getLockedNotePattern(context)
          : null;

      if (lockedPattern !== null) {
        context.fillStyle = lockedPattern;

        for (
          let noteIndex = 0;
          noteIndex < visibleNotes.length;
          noteIndex += 1
        ) {
          const note = visibleNotes[noteIndex];

          if (
            note === undefined
            || editingNoteIds.has(note.id)
          ) {
            continue;
          }

          const voiceStyle = stylesByVoiceId[note.voiceId];

          if (voiceStyle?.locked !== true) {
            continue;
          }

          const x = converter.tickToCssPixelX(note.startTick);
          const endX = converter.tickToCssPixelX(
            note.startTick + note.durationTicks,
          );
          const y = converter.pitchToCssPixelY(note.pitch);
          const nextRowY =
            converter.pitchToCssPixelY(note.pitch - 1);

          context.globalAlpha =
            Math.min(1, voiceStyle.opacity * 0.68);
          context.fillRect(
            x,
            y,
            Math.max(1, endX - x - 1),
            Math.max(1, nextRowY - y - 1),
          );
        }
      }

      context.fillStyle = NOTE_LABEL_COLOR;
      context.font =
        `600 ${NOTE_LABEL_FONT_SIZE}px `
        + '"SFMono-Regular", Consolas, monospace';
      context.textAlign = "left";
      context.textBaseline = "middle";
      const noteLabelWidths =
        getNoteLabelWidths(context, labelSettings);

      for (
        let noteIndex = 0;
        noteIndex < visibleNotes.length;
        noteIndex += 1
      ) {
        const note = visibleNotes[noteIndex];

        if (
          note === undefined
          || editingNoteIds.has(note.id)
        ) {
          continue;
        }

        const x = converter.tickToCssPixelX(note.startTick);
        const endX = converter.tickToCssPixelX(
          note.startTick + note.durationTicks,
        );
        const y = converter.pitchToCssPixelY(note.pitch);
        const nextRowY =
          converter.pitchToCssPixelY(note.pitch - 1);
        const width = Math.max(1, endX - x - 1);
        const height = Math.max(1, nextRowY - y - 1);
        const label = getMidiNoteLabel(
          note.pitch,
          labelSettings,
        );
        const labelWidth =
          noteLabelWidths[note.pitch] ?? 0;

        if (
          label.length === 0
          || width
            < labelWidth
              + NOTE_LABEL_HORIZONTAL_PADDING * 2
          || height < NOTE_LABEL_MINIMUM_HEIGHT
        ) {
          continue;
        }

        const voiceStyle = stylesByVoiceId[note.voiceId];

        context.globalAlpha =
          (voiceStyle?.opacity ?? 1)
          * (note.enabled ? 1 : 0.36);
        context.fillText(
          label,
          x + NOTE_LABEL_HORIZONTAL_PADDING,
          y + height / 2,
        );
      }

      context.globalAlpha = 1;
    },
    [
      spatialIndex,
      editingNoteMask,
      viewport,
      visibleRegion,
      voiceStyles,
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
  useSignalInvalidation(voiceStyles, renderer.invalidate);
  useSignalInvalidation(noteColorMode, renderer.invalidate);
  useSignalInvalidation(pitchSnapSettings, renderer.invalidate);
  useSignalInvalidation(editingNoteMask, renderer.invalidate);
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

const lockedNotePatterns =
  new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
const noteLabelWidthCaches =
  new WeakMap<CanvasRenderingContext2D, NoteLabelWidthCache>();

interface NoteLabelWidthCache {
  readonly contextKey: string;
  readonly widths: Float32Array;
}

function getNoteLabelWidths(
  context: CanvasRenderingContext2D,
  settings: PitchSnapSettings,
): Float32Array {
  const contextKey = getPitchLabelContextKey(settings);
  const cached = noteLabelWidthCaches.get(context);

  if (cached?.contextKey === contextKey) {
    return cached.widths;
  }

  const widths = new Float32Array(MAX_MIDI_PITCH + 1);

  for (
    let pitch = MIN_MIDI_PITCH;
    pitch <= MAX_MIDI_PITCH;
    pitch += 1
  ) {
    widths[pitch] =
      context.measureText(
        getMidiNoteLabel(pitch, settings),
      ).width;
  }

  noteLabelWidthCaches.set(context, {
    contextKey,
    widths,
  });
  return widths;
}

function getLockedNotePattern(
  context: CanvasRenderingContext2D,
): CanvasPattern | null {
  const cachedPattern = lockedNotePatterns.get(context);

  if (cachedPattern !== undefined) {
    return cachedPattern;
  }

  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = 8;
  patternCanvas.height = 8;
  const patternContext = patternCanvas.getContext("2d");

  if (patternContext === null) {
    return null;
  }

  patternContext.clearRect(0, 0, 8, 8);
  patternContext.strokeStyle =
    APPLICATION_COLORS.pianoRoll.lockedNoteHatch;
  patternContext.lineWidth = 2;
  patternContext.beginPath();
  patternContext.moveTo(-2, 8);
  patternContext.lineTo(8, -2);
  patternContext.moveTo(4, 10);
  patternContext.lineTo(10, 4);
  patternContext.stroke();

  const pattern = context.createPattern(patternCanvas, "repeat");

  if (pattern !== null) {
    lockedNotePatterns.set(context, pattern);
  }

  return pattern;
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
  pitchSnapSettings: PitchSnapSettings,
  highlightedPitch: number | null,
  transport: TransportState,
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

  if (pitchSnapSettings.visualGuideEnabled) {
    for (
      let pitch = firstPitch;
      pitch <= lastPitch;
      pitch += 1
    ) {
      if (
        !isPitchAllowedByTonalPattern(
          pitch,
          pitchSnapSettings,
        )
      ) {
        continue;
      }

      const y = converter.pitchToCssPixelY(pitch);
      const nextY = converter.pitchToCssPixelY(pitch - 1);
      const pitchClass = ((pitch % 12) + 12) % 12;
      const degreeColorIndex = getPitchScaleDegreeColorIndex(
        pitch,
        pitchSnapSettings,
      );
      const degreePitchRowColor =
        degreeColorIndex === null
          ? undefined
          : APPLICATION_COLORS.pianoRoll.degreePitchRows[
              degreeColorIndex
            ];
      const degreeRootRowColor =
        degreeColorIndex === null
          ? undefined
          : APPLICATION_COLORS.pianoRoll.degreeRootRows[
              degreeColorIndex
            ];

      context.fillStyle =
        pitchClass
          === getPitchSnapRootPitchClass(pitchSnapSettings)
          ? degreeRootRowColor ?? TONAL_SNAP_TONIC_ROW_COLOR
          : degreePitchRowColor ?? TONAL_SNAP_PITCH_ROW_COLOR;
      context.fillRect(0, y, width, nextY - y);
    }
  }

  if (
    highlightedPitch !== null
    && highlightedPitch >= firstPitch
    && highlightedPitch <= lastPitch
  ) {
    const y = converter.pitchToCssPixelY(highlightedPitch);
    const nextY = converter.pitchToCssPixelY(
      highlightedPitch - 1,
    );

    context.fillStyle = ACTIVE_PITCH_LANE_COLOR;
    context.fillRect(0, y, width, nextY - y);
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
