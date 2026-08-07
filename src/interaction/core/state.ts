import type {
  NoteId,
  VoiceId,
} from "../../domain/model";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
  type PitchSnapSettings,
} from "../../music/pitch-snap";

export type InteractionTool = "select";
export type SelectionMode = "replace" | "add" | "subtract";

export interface InteractionModeState {
  readonly activeTool: InteractionTool;
}

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

/**
 * Mutable high-frequency gesture data. This is now independent from React and
 * the DOM; converting it to a discriminated state union can therefore happen
 * behind focused unit tests in a later refactoring step.
 */
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

export function createInteractionDraft(): InteractionDraft {
  return {
    mode: "IDLE",
    activeTool: "select",
    pointerId: -1,
    overlayLeft: 0,
    overlayTop: 0,
    currentLocalX: 0,
    currentLocalY: 0,
    originLocalX: 0,
    originLocalY: 0,
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
