import type { Clip } from "../clips/clip";
import type { Note } from "../notes/note";
import type { NoteId } from "../identifiers";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import { collapseTickForRemovedTime } from "./removed-time-tick";

export function transformInstrumentTracksForInsertedTime(
  state: ActiveClipProjectState,
  insertionTick: number,
  insertedTicks: number,
): Clip["tracksByInstrumentId"] {
  let tracksByInstrumentId = state.tracksByInstrumentId;

  for (
    let instrumentIndex = 0;
    instrumentIndex < state.instrumentOrder.length;
    instrumentIndex += 1
  ) {
    const instrumentId = state.instrumentOrder[instrumentIndex];
    const track = instrumentId === undefined
      ? undefined
      : state.tracksByInstrumentId[instrumentId];
    if (instrumentId === undefined || track === undefined) continue;
    let notesById: Record<NoteId, Note> | null = null;

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];
      if (note === undefined) continue;
      let updatedNote: Note | null = null;

      if (note.startTick >= insertionTick) {
        updatedNote = { ...note, startTick: note.startTick + insertedTicks };
      } else if (note.startTick + note.durationTicks > insertionTick) {
        updatedNote = { ...note, durationTicks: note.durationTicks + insertedTicks };
      }

      if (updatedNote === null) continue;
      notesById ??= { ...track.notesById };
      notesById[noteId] = updatedNote;
    }

    if (notesById === null) continue;
    if (tracksByInstrumentId === state.tracksByInstrumentId) {
      tracksByInstrumentId = { ...state.tracksByInstrumentId };
    }
    tracksByInstrumentId = {
      ...tracksByInstrumentId,
      [instrumentId]: { ...track, notesById },
    };
  }

  return tracksByInstrumentId;
}

export function transformInstrumentTracksForRemovedTime(
  state: ActiveClipProjectState,
  removalStartTick: number,
  removalEndTick: number,
): Clip["tracksByInstrumentId"] {
  let tracksByInstrumentId = state.tracksByInstrumentId;

  for (
    let instrumentIndex = 0;
    instrumentIndex < state.instrumentOrder.length;
    instrumentIndex += 1
  ) {
    const instrumentId = state.instrumentOrder[instrumentIndex];
    const track = instrumentId === undefined
      ? undefined
      : state.tracksByInstrumentId[instrumentId];
    if (instrumentId === undefined || track === undefined) continue;
    let notesById: Record<NoteId, Note> | null = null;

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];
      if (note === undefined) continue;
      const originalEndTick = note.startTick + note.durationTicks;
      const startTick = collapseTickForRemovedTime(
        note.startTick,
        removalStartTick,
        removalEndTick,
      );
      const endTick = collapseTickForRemovedTime(
        originalEndTick,
        removalStartTick,
        removalEndTick,
      );
      if (startTick === note.startTick && endTick === originalEndTick) continue;
      notesById ??= { ...track.notesById };

      if (endTick <= startTick) {
        delete notesById[noteId];
      } else {
        notesById[noteId] = {
          ...note,
          startTick,
          durationTicks: endTick - startTick,
        };
      }
    }

    if (notesById === null) continue;
    if (tracksByInstrumentId === state.tracksByInstrumentId) {
      tracksByInstrumentId = { ...state.tracksByInstrumentId };
    }
    tracksByInstrumentId = {
      ...tracksByInstrumentId,
      [instrumentId]: { ...track, notesById },
    };
  }

  return tracksByInstrumentId;
}
