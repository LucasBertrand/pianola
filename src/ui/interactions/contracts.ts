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
} from "../components/PianoRollLayers";

export type InteractionMode =
  | "IDLE"
  | "DRAGGING"
  | "LASSO_SELECTING";

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
  deltaTicks: number;
  deltaPitch: number;
  minimumSelectedStartTick: number;
  minimumSelectedPitch: number;
  maximumSelectedPitch: number;
  additiveSelection: boolean;
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
  updateDrag(deltaXCssPixels: number, deltaYCssPixels: number): void;
  endDrag(): void;
  beginLasso(localX: number, localY: number): void;
  updateLasso(
    startX: number,
    startY: number,
    currentX: number,
    currentY: number,
  ): void;
  endLasso(): void;
}

export function createInteractionDraft(): InteractionDraft {
  return {
    mode: "IDLE",
    pointerId: -1,
    overlayLeft: 0,
    overlayTop: 0,
    originLocalX: 0,
    originLocalY: 0,
    currentLocalX: 0,
    currentLocalY: 0,
    originPointerTick: 0,
    originPointerPitch: 0,
    deltaTicks: 0,
    deltaPitch: 0,
    minimumSelectedStartTick: 0,
    minimumSelectedPitch: 0,
    maximumSelectedPitch: 127,
    additiveSelection: false,
  };
}
