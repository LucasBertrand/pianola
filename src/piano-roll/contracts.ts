import type {
  MidiPitch,
  NoteId,
  Tick,
  VoiceId,
} from "../domain/model";

export interface ViewportState {
  readonly widthCssPixels: number;
  readonly heightCssPixels: number;
  readonly scrollXCssPixels: number;
  readonly scrollYCssPixels: number;
  readonly ticksPerCssPixel: number;
  readonly pitchHeightCssPixels: number;
  readonly minPitch: MidiPitch;
  readonly maxPitch: MidiPitch;
  readonly devicePixelRatio: number;
}

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface GridPoint {
  readonly tick: Tick;
  readonly pitch: MidiPitch;
}

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MusicalRect {
  readonly startTick: Tick;
  readonly endTick: Tick;
  readonly minPitch: MidiPitch;
  readonly maxPitch: MidiPitch;
}

export interface CoordinateConverter {
  pixelToGrid(point: PixelPoint, viewport: ViewportState): GridPoint;
  gridToPixel(point: GridPoint, viewport: ViewportState): PixelPoint;
  musicalRectToPixelRect(
    rect: MusicalRect,
    viewport: ViewportState,
  ): PixelRect;
  pixelRectToMusicalRect(
    rect: PixelRect,
    viewport: ViewportState,
  ): MusicalRect;
}

export type HitRegion = "body" | "resize-start" | "resize-end";

export interface HitTestResult {
  readonly noteId: NoteId;
  readonly voiceId: VoiceId;
  readonly region: HitRegion;
  readonly musicalBounds: MusicalRect;
  readonly pixelBounds: PixelRect;
  readonly distanceCssPixels: number;
}

export interface SpatialIndexEntry {
  readonly noteId: NoteId;
  readonly voiceId: VoiceId;
  readonly bounds: MusicalRect;
}

export interface PointQuery {
  readonly tick: Tick;
  readonly pitch: MidiPitch;
  readonly tickTolerance: Tick;
  readonly pitchTolerance: number;
}

export interface SpatialIndex {
  rebuild(entries: readonly SpatialIndexEntry[]): void;
  upsert(entry: SpatialIndexEntry): void;
  remove(noteId: NoteId, voiceId: VoiceId): boolean;
  queryPoint(
    query: PointQuery,
    target: SpatialIndexEntry[],
  ): number;
  queryRect(
    bounds: MusicalRect,
    target: SpatialIndexEntry[],
  ): number;
  clear(): void;
}

export type InteractionMode =
  | "idle"
  | "creating"
  | "dragging"
  | "resizing-start"
  | "resizing-end"
  | "lasso";

export interface InteractionDraft {
  mode: InteractionMode;
  pointerId: number | null;
  origin: GridPoint | null;
  current: GridPoint | null;
  hoveredNoteId: NoteId | null;
  selectedNoteIds: Set<NoteId>;
}

export type CanvasInvalidationReason =
  | "data"
  | "viewport"
  | "resize"
  | "theme"
  | "grid-resolution";

export interface CanvasInvalidationSource {
  subscribe(listener: (reason: CanvasInvalidationReason) => void): () => void;
}
