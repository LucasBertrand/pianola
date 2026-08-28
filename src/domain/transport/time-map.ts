/** Public time-map surface; implementations are grouped by responsibility. */
export type {
  MeasurePosition,
  MeasureSpan,
  MeterMarker,
  ScaleMarker,
  SectionMarker,
  TempoMarker,
  TimeMap,
  TimeSignature,
} from "./time-map-model";
export {
  createDefaultTimeMap,
  createDefaultTimeSignature,
} from "./time-map-model";
export {
  areTimeSignaturesEqual,
  getBeatGroups,
  getBeatTicks,
  getTicksPerBeatUnit,
  getTicksPerMeasure,
} from "./time-signature";
export {
  getDurationForMeasureCount,
  getMeasureBeatBoundaryTicks,
  getMeasureCount,
  getMeasureCountCoveringTick,
  getMeasurePosition,
  getMeasureSpanAtTick,
  getMeasureSpans,
  getMeasureSubdivisionTicks,
  getMeterAtTick,
  getScaleMarkerAtTick,
  getTempoAtTick,
  isMeasureBoundary,
  snapTickToMeasureCellStart,
  snapTickToMeasureGrid,
  tickToSeconds,
} from "./time-map-navigation";
export {
  normalizeMeterMarkers,
  normalizeScaleMarkers,
  normalizeSectionMarkers,
  normalizeTempoMarkers,
} from "./time-map-normalization";
export type { MeterMarkerEdit } from "./meter-marker-operations";
export {
  insertMeterMarker,
  removeMeterMarker,
  replaceInitialMeter,
  updateMeterMarker,
} from "./meter-marker-operations";
export {
  insertScaleMarker,
  insertSectionMarker,
  insertTempoMarker,
  moveScaleMarker,
  moveSectionMarker,
  moveTempoMarker,
  removeScaleMarker,
  removeSectionMarker,
  removeTempoMarker,
  updateScaleMarker,
  updateSectionMarker,
  updateTempoMarker,
} from "./point-marker-operations";
export {
  insertTimeIntoTimeMap,
  removeTimeFromTimeMap,
} from "./time-map-structural-edits";
