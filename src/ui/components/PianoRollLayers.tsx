import React, {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import type {
  Note,
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
}

export interface GridCanvasProps extends CanvasLayerProps {
  readonly gridResolutionTicks: number;
}

export interface NotesCanvasProps extends CanvasLayerProps {
  readonly spatialIndex: SpatialIndex;
  readonly voiceStyles: ReadonlyRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
}

export interface PianoRollLayersProps extends CanvasLayerProps {
  readonly spatialIndex: SpatialIndex;
  readonly voiceStyles: ReadonlyRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
  readonly playheadTick: ReadonlyRenderSignal<number>;
  readonly projectStore: ProjectStorePort;
  readonly activeVoiceId: VoiceId;
  readonly gridResolutionTicks: number;
}

type GridSurface = OffscreenCanvas | HTMLCanvasElement;
type GridRenderingContext =
  | OffscreenCanvasRenderingContext2D
  | CanvasRenderingContext2D;

interface GridCache {
  surface: GridSurface | null;
  context: GridRenderingContext | null;
  widthDevicePixels: number;
  heightDevicePixels: number;
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
  desynchronized: true,
};

const TRANSPARENT_CONTEXT_ATTRIBUTES: CanvasRenderingContext2DSettings = {
  alpha: true,
  desynchronized: true,
};

const GRID_BACKGROUND_COLOR = "#16181d";
const BLACK_KEY_ROW_COLOR = "#121419";
const PITCH_LINE_COLOR = "#252a33";
const MINOR_TICK_LINE_COLOR = "#242933";
const MAJOR_TICK_LINE_COLOR = "#394252";
const DEFAULT_NOTE_COLOR = "#6ea8fe";
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
    playheadTick,
    projectStore,
    activeVoiceId,
    gridResolutionTicks,
  } = props;

  return (
    <div style={LAYER_STACK_STYLE}>
      <GridCanvas
        viewport={viewport}
        visibleRegion={visibleRegion}
        gridResolutionTicks={gridResolutionTicks}
      />
      <NotesCanvas
        viewport={viewport}
        visibleRegion={visibleRegion}
        spatialIndex={spatialIndex}
        voiceStyles={voiceStyles}
      />
      <InteractionOverlay
        viewport={viewport}
        playheadTick={playheadTick}
        spatialIndex={spatialIndex}
        voiceStyles={voiceStyles}
        projectStore={projectStore}
        activeVoiceId={activeVoiceId}
        gridResolutionTicks={gridResolutionTicks}
        defaultNoteDurationTicks={gridResolutionTicks * 2}
      />
    </div>
  );
}

export function GridCanvas(props: GridCanvasProps): React.JSX.Element {
  const {
    viewport,
    visibleRegion,
    gridResolutionTicks,
  } = props;
  const converterRef = useRef<CoordinateConverter | null>(null);
  const converterVersionRef = useRef(-1);
  const cacheRef = useRef<GridCache | null>(null);

  if (converterRef.current === null) {
    converterRef.current = new CoordinateConverter(viewport.get());
    converterVersionRef.current = viewport.version;
  }

  if (cacheRef.current === null) {
    cacheRef.current = {
      surface: null,
      context: null,
      widthDevicePixels: 0,
      heightDevicePixels: 0,
    };
  }

  const renderGrid = useCallback(
    (frame: CanvasFrame): void => {
      const converter = converterRef.current;
      const cache = cacheRef.current;

      if (converter === null || cache === null) {
        return;
      }

      if (converterVersionRef.current !== viewport.version) {
        converter.setViewportState(viewport.get());
        converterVersionRef.current = viewport.version;
      }

      const cacheContext = prepareGridCache(cache, frame);
      renderGridCache(
        cacheContext,
        frame,
        converter,
        visibleRegion.get(),
        gridResolutionTicks,
      );

      if (cache.surface !== null) {
        frame.context.drawImage(
          cache.surface,
          0,
          0,
          cache.widthDevicePixels,
          cache.heightDevicePixels,
          0,
          0,
          frame.widthCssPixels,
          frame.heightCssPixels,
        );
      }
    },
    [
      gridResolutionTicks,
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

  useEffect(() => {
    renderer.invalidate();
  }, [
    gridResolutionTicks,
    renderer,
  ]);

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

      spatialIndex.queryRect(
        region.startTick,
        region.endTick,
        region.minPitch,
        region.maxPitch,
        visibleNotes,
      );
      visibleNotes.sort(compareNotesByVoice);

      let currentVoiceId: VoiceId | null = null;
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

        if (note.voiceId !== currentVoiceId) {
          const voiceStyle = stylesByVoiceId[note.voiceId];
          context.fillStyle =
            voiceStyle?.fillStyle ?? DEFAULT_NOTE_COLOR;
          currentVoiceId = note.voiceId;
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
      viewport,
      visibleRegion,
      voiceStyles,
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

function prepareGridCache(
  cache: GridCache,
  frame: CanvasFrame,
): GridRenderingContext {
  const widthDevicePixels = Math.max(
    1,
    Math.round(frame.widthCssPixels * frame.devicePixelRatio),
  );
  const heightDevicePixels = Math.max(
    1,
    Math.round(frame.heightCssPixels * frame.devicePixelRatio),
  );

  if (cache.surface === null) {
    cache.surface = createGridSurface(
      widthDevicePixels,
      heightDevicePixels,
    );
    cache.context = getGridContext(cache.surface);
  } else if (
    cache.widthDevicePixels !== widthDevicePixels
    || cache.heightDevicePixels !== heightDevicePixels
  ) {
    cache.surface.width = widthDevicePixels;
    cache.surface.height = heightDevicePixels;
  }

  cache.widthDevicePixels = widthDevicePixels;
  cache.heightDevicePixels = heightDevicePixels;

  if (cache.context === null) {
    throw new Error("An offscreen 2D rendering context is required.");
  }

  return cache.context;
}

function createGridSurface(
  width: number,
  height: number,
): GridSurface {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getGridContext(
  surface: GridSurface,
): GridRenderingContext {
  const context = surface.getContext("2d", {
    alpha: false,
  });

  if (context === null) {
    throw new Error("An offscreen 2D rendering context is required.");
  }

  return context as GridRenderingContext;
}

function renderGridCache(
  context: GridRenderingContext,
  frame: CanvasFrame,
  converter: CoordinateConverter,
  region: Rect,
  gridResolutionTicks: number,
): void {
  const width = frame.widthCssPixels;
  const height = frame.heightCssPixels;
  const ratio = frame.devicePixelRatio;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(
    0,
    0,
    Math.round(width * ratio),
    Math.round(height * ratio),
  );
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
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

  context.beginPath();

  for (let pitch = firstPitch; pitch <= lastPitch; pitch += 1) {
    const y = converter.pitchToCssPixelY(pitch);
    context.moveTo(0, y);
    context.lineTo(width, y);
  }

  context.strokeStyle = PITCH_LINE_COLOR;
  context.lineWidth = 1;
  context.stroke();

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
    converter,
    region,
    height,
    effectiveResolutionTicks,
    false,
  );
  drawTickLines(
    context,
    converter,
    region,
    height,
    effectiveResolutionTicks * 4,
    true,
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
  context: GridRenderingContext,
  converter: CoordinateConverter,
  region: Rect,
  height: number,
  resolutionTicks: number,
  major: boolean,
): void {
  const firstTick =
    Math.floor(region.startTick / resolutionTicks) * resolutionTicks;

  context.beginPath();

  for (
    let tick = firstTick;
    tick <= region.endTick;
    tick += resolutionTicks
  ) {
    const x = converter.tickToCssPixelX(tick);
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }

  context.strokeStyle = major
    ? MAJOR_TICK_LINE_COLOR
    : MINOR_TICK_LINE_COLOR;
  context.lineWidth = major ? 1.5 : 1;
  context.stroke();
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
