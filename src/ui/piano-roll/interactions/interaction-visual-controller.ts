import {
  type Note,
} from "../../../domain/notes/note";
import {
  type InstrumentId,
} from "../../../domain/identifiers";
import type {
  CoordinateConverter,
} from "../../../editor/geometry/converter";
import type {
  InstrumentRenderStyle,
} from "../../../editor/model/instrument-render-style";
import type {
  PitchSnapSettings,
} from "../../../music/pitch-snap";
import type {
  ResizeEdge,
} from "../../../editor/interactions/gestures/gesture-draft";

export interface InteractionVisualController {
  beginDrag(
    notes: readonly Note[],
    converter: CoordinateConverter,
    stylesByInstrumentId: Readonly<Record<InstrumentId, InstrumentRenderStyle>>,
  ): void;
  updateDrag(
    deltaXCssPixels: number,
    pitchStepCssPixels: number,
    deltaTicks: number,
    deltaPitch: number,
    getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
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
