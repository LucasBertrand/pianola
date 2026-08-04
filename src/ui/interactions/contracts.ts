import type {
  Note,
  NoteId,
  VoiceId,
} from "../../domain/model";
import type {
  CoordinateConverter,
} from "../../geometry/converter";
import type {
  VoiceRenderStyle,
} from "../rendering/note-style";
import type {
  InteractionTool,
  SelectionMode,
} from "./types";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
  type PitchSnapSettings,
} from "./pitch-snap";

export type InteractionMode =
  | "IDLE"
  | "PENDING_LASSO"
  | "PENDING_NOTE_SELECTION"
  | "DRAGGING"
  | "LASSO_SELECTING"
  | "RESIZING_START"
  | "RESIZING_END"
  | "DRAWING";

export type ResizeEdge = "start" | "end";

export interface InteractionDraft {
  mode: InteractionMode;
  activeTool: InteractionTool;
  pointerId: number;
  overlayLeft: number;
  overlayTop: number;
  originLocalX: number;
  originLocalY: number;
  currentLocalX: number;
  currentLocalY: number;
  originPointerTick: number;
  originPointerPitch: number;
  originResizeTick: number;
  deltaTicks: number;
  deltaPitch: number;
  minimumResizeDeltaTicks: number;
  maximumResizeDeltaTicks: number;
  minimumSelectedStartTick: number;
  maximumSelectedEndTick: number;
  minimumSelectedPitch: number;
  maximumSelectedPitch: number;
  targetNoteId: NoteId | null;
  drawStartTick: number;
  drawPitch: number;
  drawDurationTicks: number;
  drawVoiceId: VoiceId | null;
  snapResolutionTicks: number;
  pitchSnapSettings: PitchSnapSettings;
  additiveSelection: boolean;
  selectionMode: SelectionMode;
}

export interface InteractionSelection {
  readonly noteIds: Set<NoteId>;
  readonly notes: Note[];
}

export interface InteractionVisualController {
  beginDrag(
    notes: readonly Note[],
    converter: CoordinateConverter,
    stylesByVoiceId: Readonly<Record<VoiceId, VoiceRenderStyle>>,
  ): void;
  updateDrag(
    deltaXCssPixels: number,
    pitchStepCssPixels: number,
    deltaPitch: number,
    pitchSnapSettings: PitchSnapSettings,
  ): void;
  endDrag(): void;
  beginResize(
    notes: readonly Note[],
    converter: CoordinateConverter,
    stylesByVoiceId: Readonly<Record<VoiceId, VoiceRenderStyle>>,
    edge: ResizeEdge,
  ): void;
  updateResize(edge: ResizeEdge, deltaXCssPixels: number): void;
  endResize(): void;
  beginDraw(
    startTick: number,
    pitch: number,
    durationTicks: number,
    voiceId: VoiceId,
    converter: CoordinateConverter,
    style: VoiceRenderStyle | undefined,
  ): void;
  updateDraw(widthCssPixels: number): void;
  endDraw(): void;
  beginLasso(localX: number, localY: number): void;
  updateLasso(
    startX: number,
    startY: number,
    currentX: number,
    currentY: number,
  ): void;
  endLasso(): void;
  showSelection(
    notes: readonly Note[],
    converter: CoordinateConverter,
  ): void;
  clearSelection(): void;
}

export function createInteractionDraft(): InteractionDraft {
  return {
    mode: "IDLE",
    activeTool: "select",
    pointerId: -1,
    overlayLeft: 0,
    overlayTop: 0,
    originLocalX: 0,
    originLocalY: 0,
    currentLocalX: 0,
    currentLocalY: 0,
    originPointerTick: 0,
    originPointerPitch: 0,
    originResizeTick: 0,
    deltaTicks: 0,
    deltaPitch: 0,
    minimumResizeDeltaTicks: Number.NEGATIVE_INFINITY,
    maximumResizeDeltaTicks: Number.POSITIVE_INFINITY,
    minimumSelectedStartTick: 0,
    maximumSelectedEndTick: 0,
    minimumSelectedPitch: 0,
    maximumSelectedPitch: 127,
    targetNoteId: null,
    drawStartTick: 0,
    drawPitch: 0,
    drawDurationTicks: 0,
    drawVoiceId: null,
    snapResolutionTicks: 240,
    pitchSnapSettings: DEFAULT_PITCH_SNAP_SETTINGS,
    additiveSelection: false,
    selectionMode: "replace",
  };
}
