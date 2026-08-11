import type {
  Note,
  InstrumentId,
} from "../../domain/model";
import type {
  CoordinateConverter,
} from "../../geometry/converter";
import type {
  InstrumentRenderStyle,
} from "../rendering/note-style";
import type {
  PitchSnapSettings,
} from "../../music/pitch-snap";
import type {
  ResizeEdge,
} from "../../interaction/core/state";

export interface InteractionVisualController {
  beginDrag(
    notes: readonly Note[],
    converter: CoordinateConverter,
    stylesByInstrumentId: Readonly<Record<InstrumentId, InstrumentRenderStyle>>,
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
    stylesByInstrumentId: Readonly<Record<InstrumentId, InstrumentRenderStyle>>,
    edge: ResizeEdge,
  ): void;
  updateResize(edge: ResizeEdge, deltaXCssPixels: number): void;
  endResize(): void;
  beginDraw(
    startTick: number,
    pitch: number,
    durationTicks: number,
    instrumentId: InstrumentId,
    converter: CoordinateConverter,
    style: InstrumentRenderStyle | undefined,
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
