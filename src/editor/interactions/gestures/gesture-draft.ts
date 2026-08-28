import {
  type NoteId,
  type InstrumentId,
} from "../../../domain/identifiers";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
  type PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";

export type SelectionMode = "replace" | "add" | "subtract";

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

/** Mutable high-frequency data owned exclusively by the gesture state machine. */
export interface InteractionDraft {
  mode: InteractionMode;
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
  drawInstrumentId: InstrumentId | null;
  snapResolutionTicks: number;
  snapAbsoluteTick: (tick: number) => number;
  getSnapSettingsAtTick: (tick: number) => PitchSnapSettings;
  selectionMode: SelectionMode;
}

export function createInteractionDraft(): InteractionDraft {
  return {
    mode: "IDLE",
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
    drawInstrumentId: null,
    snapResolutionTicks: 240,
    snapAbsoluteTick: (tick) => tick,
    getSnapSettingsAtTick: () => DEFAULT_PITCH_SNAP_SETTINGS,
    selectionMode: "replace",
  };
}
