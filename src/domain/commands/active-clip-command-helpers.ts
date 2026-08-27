import {
  type Clip,
  type InstrumentTrack,
} from "../clips/clip";
import {
  type LoopRegion,
  type TransportState,
} from "../transport/transport";
import {
  type Note,
} from "../notes/note";
import {
  type NoteId,
} from "../identifiers";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import type { PianoRollCommand } from "./command-types";
import { reject } from "./command-context";

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
    const track =
      instrumentId === undefined
        ? undefined
        : state.tracksByInstrumentId[instrumentId];

    if (instrumentId === undefined || track === undefined) {
      continue;
    }

    let notesById: Record<NoteId, Note> | null = null;

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];

      if (note === undefined) {
        continue;
      }

      let updatedNote: Note | null = null;

      if (note.startTick >= insertionTick) {
        updatedNote = {
          ...note,
          startTick: note.startTick + insertedTicks,
        };
      } else if (
        note.startTick + note.durationTicks > insertionTick
      ) {
        updatedNote = {
          ...note,
          durationTicks: note.durationTicks + insertedTicks,
        };
      }

      if (updatedNote === null) {
        continue;
      }

      if (notesById === null) {
        notesById = {
          ...track.notesById,
        };
      }

      notesById[noteId] = updatedNote;
    }

    if (notesById === null) {
      continue;
    }

    if (tracksByInstrumentId === state.tracksByInstrumentId) {
      tracksByInstrumentId = {
        ...state.tracksByInstrumentId,
      };
    }

    tracksByInstrumentId = {
      ...tracksByInstrumentId,
      [instrumentId]: {
        ...track,
        notesById,
      },
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
    const track =
      instrumentId === undefined
        ? undefined
        : state.tracksByInstrumentId[instrumentId];

    if (instrumentId === undefined || track === undefined) {
      continue;
    }

    let notesById: Record<NoteId, Note> | null = null;

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];

      if (note === undefined) {
        continue;
      }

      const originalEndTick =
        note.startTick + note.durationTicks;
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

      if (
        startTick === note.startTick
        && endTick === originalEndTick
      ) {
        continue;
      }

      if (notesById === null) {
        notesById = {
          ...track.notesById,
        };
      }

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

    if (notesById === null) {
      continue;
    }

    if (tracksByInstrumentId === state.tracksByInstrumentId) {
      tracksByInstrumentId = {
        ...state.tracksByInstrumentId,
      };
    }

    tracksByInstrumentId = {
      ...tracksByInstrumentId,
      [instrumentId]: {
        ...track,
        notesById,
      },
    };
  }

  return tracksByInstrumentId;
}

export function insertTimeIntoTransport(
  transport: TransportState,
  insertionTick: number,
  insertedTicks: number,
): TransportState {
  const loop = {
    startTick: transport.loop.startTick >= insertionTick
      ? transport.loop.startTick + insertedTicks
      : transport.loop.startTick,
    endTick: transport.loop.endTick >= insertionTick
      ? transport.loop.endTick + insertedTicks
      : transport.loop.endTick,
  };

  if (
    loop.startTick === transport.loop.startTick
    && loop.endTick === transport.loop.endTick
  ) {
    return transport;
  }

  return {
    ...transport,
    loop,
  };
}

export function removeTimeFromTransport(
  transport: TransportState,
  removalStartTick: number,
  removalEndTick: number,
  projectDurationTicks: number,
): TransportState {
  const collapsedLoop = {
    startTick: collapseTickForRemovedTime(
      transport.loop.startTick,
      removalStartTick,
      removalEndTick,
    ),
    endTick: collapseTickForRemovedTime(
      transport.loop.endTick,
      removalStartTick,
      removalEndTick,
    ),
  };
  const loop = collapsedLoop.endTick > collapsedLoop.startTick
    ? fitLoopRegionToProject(collapsedLoop, projectDurationTicks)
    : createFallbackLoopRegion(
        removalStartTick,
        transport.loop.endTick - transport.loop.startTick,
        projectDurationTicks,
      );

  if (
    loop.startTick === transport.loop.startTick
    && loop.endTick === transport.loop.endTick
  ) {
    return transport;
  }

  return {
    ...transport,
    loop,
  };
}

function collapseTickForRemovedTime(
  tick: number,
  removalStartTick: number,
  removalEndTick: number,
): number {
  if (tick <= removalStartTick) {
    return tick;
  }

  if (tick >= removalEndTick) {
    return tick - removalEndTick + removalStartTick;
  }

  return removalStartTick;
}

function createFallbackLoopRegion(
  preferredStartTick: number,
  preferredDurationTicks: number,
  projectDurationTicks: number,
): LoopRegion {
  const durationTicks = Math.max(
    1,
    Math.min(preferredDurationTicks, projectDurationTicks),
  );
  const startTick = Math.min(
    preferredStartTick,
    projectDurationTicks - durationTicks,
  );

  return {
    startTick,
    endTick: startTick + durationTicks,
  };
}

export function fitLoopRegionToProject(
  loop: LoopRegion,
  projectDurationTicks: number,
): LoopRegion {
  if (loop.endTick <= projectDurationTicks) {
    return loop;
  }

  if (loop.startTick < projectDurationTicks) {
    return {
      startTick: loop.startTick,
      endTick: projectDurationTicks,
    };
  }

  return createFallbackLoopRegion(
    projectDurationTicks,
    loop.endTick - loop.startTick,
    projectDurationTicks,
  );
}

export function assertMeasureIndex(
  measureIndex: number,
  measureCount: number,
  commandType: PianoRollCommand["type"],
): void {
  if (
    !Number.isSafeInteger(measureIndex)
    || measureIndex < 0
    || measureIndex >= measureCount
  ) {
    reject(
      "INVALID_COMMAND",
      `Measure index must be between 0 and ${measureCount - 1}.`,
      commandType,
    );
  }
}

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
  const projectDurationTicks = getClipContextDurationTicks(state);

  if (
    note.startTick + note.durationTicks
      > projectDurationTicks
  ) {
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
    && left.startTick
      < right.startTick + right.durationTicks
    && right.startTick
      < left.startTick + left.durationTicks
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

    if (instrumentId === undefined) {
      continue;
    }

    const track = state.tracksByInstrumentId[instrumentId];

    if (track === undefined) {
      continue;
    }

    let notesChanged = false;
    const notesById: Record<NoteId, Note> = {};

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];

      if (note === undefined) {
        continue;
      }

      if (
        note.startTick + note.durationTicks
        <= projectDurationTicks
      ) {
        notesById[note.id] = note;
      } else {
        notesChanged = true;
      }
    }

    if (!notesChanged) {
      continue;
    }

    if (!tracksChanged) {
      tracksByInstrumentId = {
        ...state.tracksByInstrumentId,
      };
      tracksChanged = true;
    }

    tracksByInstrumentId = {
      ...tracksByInstrumentId,
      [instrumentId]: {
        ...track,
        notesById,
      },
    };
  }

  const transport = state.transportSettings;
  const loop = fitLoopRegionToProject(
    transport.loop,
    projectDurationTicks,
  );
  const transportChanged =
    loop.startTick !== transport.loop.startTick
    || loop.endTick !== transport.loop.endTick;

  if (!tracksChanged && !transportChanged) {
    return state;
  }

  return {
    ...state,
    tracksByInstrumentId,
    transportSettings: transportChanged
      ? {
          ...transport,
          loop,
        }
      : transport,
  };
}
