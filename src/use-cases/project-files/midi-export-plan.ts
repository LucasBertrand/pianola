import {
  type Clip,
  getClipDurationTicks,
} from "../../domain/clips/clip";
import {
  type ProjectDocument,
} from "../../domain/project/project-document";
import type {
  MidiExportPlan,
} from "../../project-io/midi/midi-exporter";

/** Maps a named source to the neutral musical plan consumed by SMF I/O. */
export function createMidiExportPlan(
  state: ProjectDocument,
  clip: Clip,
): MidiExportPlan {
  const tracks = state.instrumentOrder.flatMap((instrumentId) => {
    const instrument = state.projectInstrumentsById[instrumentId];
    const track = clip.tracksByInstrumentId[instrumentId];

    if (instrument === undefined || track === undefined) {
      return [];
    }

    return [{
      name: instrument.name,
      notes: Object.values(track.notesById).map((note) => ({
        origin: { sourceId: clip.id, noteId: note.id },
        id: note.id,
        pitch: note.pitch,
        velocity: note.velocity,
        startTick: note.startTick,
        durationTicks: note.durationTicks,
        muted: note.muted,
      })),
    }];
  });

  return {
    sourceId: clip.id,
    title: state.title,
    ppqn: state.clock.ppqn,
    tempoMarkers: clip.timeline.timeMap.tempoMarkers.map(
      (marker) => ({ tick: marker.startTick, bpm: marker.bpm }),
    ),
    meterMarkers: clip.timeline.timeMap.meterMarkers.map(
      (marker) => ({
        tick: marker.startTick,
        numerator: marker.timeSignature.numerator,
        denominator: marker.timeSignature.denominator,
      }),
    ),
    durationTicks: getClipDurationTicks(clip),
    tracks,
  };
}
