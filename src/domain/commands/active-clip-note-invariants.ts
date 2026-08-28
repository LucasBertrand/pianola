import type { InstrumentTrack } from "../clips/clip";
import type { Note } from "../notes/note";
import type { NoteId } from "../identifiers";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import type { PianoRollCommand } from "./command-types";
import { reject } from "./command-context";
import { fitLoopRegionToProject } from "./clip-transport-time-transforms";

export function replaceInstrumentTrack(
  state: ActiveClipProjectState,
  track: InstrumentTrack,
): ActiveClipProjectState {
  return {
    ...state,
    tracksByInstrumentId: {
      ...state.tracksByInstrumentId,
      [track.instrumentId]: track,
    },
  };
}

export function assertNoteWithinProject(
  state: ActiveClipProjectState,
  note: Note,
  commandType: PianoRollCommand["type"],
): void {
  if (note.startTick + note.durationTicks > getClipContextDurationTicks(state)) {
    reject(
      "INVALID_COMMAND",
      `Note "${note.id}" exceeds the clip duration.`,
      commandType,
    );
  }
}

export function notesOverlapInInstrument(left: Note, right: Note): boolean {
  return (
    left.instrumentId === right.instrumentId
    && left.pitch === right.pitch
    && left.startTick < right.startTick + right.durationTicks
    && right.startTick < left.startTick + left.durationTicks
  );
}

export function getClipContextDurationTicks(
  state: ActiveClipProjectState,
): number {
  return state.timeline.durationTicks;
}

export function trimProjectToDuration(
  state: ActiveClipProjectState,
): ActiveClipProjectState {
  const projectDurationTicks = getClipContextDurationTicks(state);
  let tracksByInstrumentId = state.tracksByInstrumentId;
  let tracksChanged = false;

  for (
    let instrumentIndex = 0;
    instrumentIndex < state.instrumentOrder.length;
    instrumentIndex += 1
  ) {
    const instrumentId = state.instrumentOrder[instrumentIndex];
    if (instrumentId === undefined) continue;
    const track = state.tracksByInstrumentId[instrumentId];
    if (track === undefined) continue;
    let notesChanged = false;
    const notesById: Record<NoteId, Note> = {};

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];
      if (note === undefined) continue;
      if (note.startTick + note.durationTicks <= projectDurationTicks) {
        notesById[note.id] = note;
      } else {
        notesChanged = true;
      }
    }

    if (!notesChanged) continue;
    if (!tracksChanged) {
      tracksByInstrumentId = { ...state.tracksByInstrumentId };
      tracksChanged = true;
    }
    tracksByInstrumentId = {
      ...tracksByInstrumentId,
      [instrumentId]: { ...track, notesById },
    };
  }

  const transport = state.transportSettings;
  const loop = fitLoopRegionToProject(transport.loop, projectDurationTicks);
  const transportChanged =
    loop.startTick !== transport.loop.startTick
    || loop.endTick !== transport.loop.endTick;
  if (!tracksChanged && !transportChanged) return state;

  return {
    ...state,
    tracksByInstrumentId,
    transportSettings: transportChanged ? { ...transport, loop } : transport,
  };
}
