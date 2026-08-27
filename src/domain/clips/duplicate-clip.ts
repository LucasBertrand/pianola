import type {
  Clip,
  InstrumentTrack,
} from "./clip";
import type {
  ClipId,
  InstrumentId,
} from "../identifiers";

/** Creates an independent clip value while preserving its musical contents. */
export function duplicateClipValue(
  source: Clip,
  id: ClipId,
  name: string,
): Clip {
  return {
    ...source,
    id,
    name,
    tracksByInstrumentId: cloneInstrumentTracks(source.tracksByInstrumentId),
    transportSettings: {
      ...source.transportSettings,
      loop: { ...source.transportSettings.loop },
    },
    timeline: {
      ...source.timeline,
      timeMap: {
        meterMarkers: source.timeline.timeMap.meterMarkers.map((marker) => ({
          startTick: marker.startTick,
          timeSignature: marker.timeSignature.beatGroups === undefined
            ? {
                numerator: marker.timeSignature.numerator,
                denominator: marker.timeSignature.denominator,
              }
            : {
                numerator: marker.timeSignature.numerator,
                denominator: marker.timeSignature.denominator,
                beatGroups: [...marker.timeSignature.beatGroups],
              },
        })),
        tempoMarkers: source.timeline.timeMap.tempoMarkers.map(
          (marker) => ({ ...marker }),
        ),
        scaleMarkers: source.timeline.timeMap.scaleMarkers.map(
          (marker) => ({ ...marker }),
        ),
        sectionMarkers: source.timeline.timeMap.sectionMarkers.map(
          (marker) => ({ ...marker }),
        ),
      },
    },
  };
}

function cloneInstrumentTracks(
  sourceTracks: Readonly<Record<InstrumentId, InstrumentTrack>>,
): Record<InstrumentId, InstrumentTrack> {
  const tracks: Record<InstrumentId, InstrumentTrack> = {};

  for (const [instrumentId, track] of Object.entries(sourceTracks)) {
    tracks[instrumentId] = {
      instrumentId,
      notesById: { ...track.notesById },
    };
  }

  return tracks;
}
