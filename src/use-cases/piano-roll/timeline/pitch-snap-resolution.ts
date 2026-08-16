import type {
  TimeMap,
} from "../../../domain/transport/time-map";
import {
  getScaleMarkerAtTick,
} from "../../../domain/transport/time-map";
import type {
  PitchSnapSettings,
} from "../../../music/pitch-snap";

export function resolvePitchSnapSettings(
  timeMap: TimeMap,
  globalSettings: PitchSnapSettings,
  tick: number,
): PitchSnapSettings {
  if (!globalSettings.enabled) {
    return globalSettings;
  }
  const scaleMarker = getScaleMarkerAtTick(timeMap, tick);
  return {
    ...globalSettings,
    tonicPitchClass: scaleMarker.tonicPitchClass,
    patternId: scaleMarker.patternId,
    scaleDegreeIndex: scaleMarker.scaleDegreeIndex,
  };
}
