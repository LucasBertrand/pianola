import {
  type Note,
} from "../../../domain/notes/note";
import {
  type InstrumentId,
} from "../../../domain/identifiers";
import type {
  CoordinateConverter,
} from "../../../editor-core/geometry/converter";
import type {
  InstrumentRenderStyle,
} from "../../../editor-core/model/instrument-render-style";
import type {
  PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";
import type {
  ResizeEdge,
} from "../../../editor-core/interactions/gestures/gesture-draft";
import type {
  ScaleMarker,
} from "../../../domain/transport/time-map";

export interface InteractionVisualController {
  beginDrag(
    notes: readonly Note[],
    converter: CoordinateConverter,
    stylesByInstrumentId: Readonly<Record<InstrumentId, InstrumentRenderStyle>>,
    getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
    scaleMarkers: readonly ScaleMarker[],
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
    getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
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
    getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
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
