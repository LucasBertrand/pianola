import type {
  PianoRollCommand,
} from "../../../domain/commands/command-types";
import {
  getClip,
  type ProjectDocument,
} from "../../../domain/project/project-document";
import {
  MAXIMUM_MEASURE_COUNT,
} from "../../../domain/clips/clip";
import {
  getMeasureCount,
  getMeasureCountCoveringTick,
} from "../../../domain/transport/time-map";
import {
  isNoteEditable,
  type Note,
} from "../../../domain/notes/note";
import {
  type ClipId,
  type NoteId,
  type InstrumentId,
  type Tick,
} from "../../../domain/identifiers";
import type {
  ScaleMarker,
  TimeMap,
} from "../../../domain/transport/time-map";
import type {
  SelectedTimeMapMarkerGroup,
} from "../../../editor/selection/editor-selection";
import type {
  TimeMapMarkerCollision,
} from "../timeline/marker-collision-resolution";

export interface PianoRollClipboardMarkerGroup {
  readonly startTick: Tick;
  readonly tempoBpm: number | null;
  readonly scaleMarker: Omit<ScaleMarker, "startTick"> | null;
}

export interface PianoRollClipboard {
  readonly notes: readonly Note[];
  readonly markerGroups: readonly PianoRollClipboardMarkerGroup[];
  readonly originTick: Tick;
}

export interface PastedMarkerCommandPlan {
  readonly commands: readonly PianoRollCommand[];
  readonly overwriteCommands: readonly PianoRollCommand[];
  readonly resultingMarkerGroups: readonly SelectedTimeMapMarkerGroup[];
  readonly collisions: readonly TimeMapMarkerCollision[];
}

export interface SliceCommandPlan {
  readonly commands: readonly PianoRollCommand[];
  readonly resultingNoteIds: readonly NoteId[];
}

export type InstrumentTransferPlan =
  | {
      readonly valid: true;
      readonly commands: readonly PianoRollCommand[];
      readonly originalNotes: readonly Note[];
      readonly proposedNotes: readonly Note[];
    }
  | {
      readonly valid: false;
      readonly message: string;
    };

export function buildTransformCommandsForNotes(
  clipId: ClipId,
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const notesByInstrument = new Map<InstrumentId, Note[]>();

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    let instrumentNotes = notesByInstrument.get(note.instrumentId);

    if (instrumentNotes === undefined) {
      instrumentNotes = [];
      notesByInstrument.set(note.instrumentId, instrumentNotes);
    }

    instrumentNotes.push(note);
  }

  const commands: PianoRollCommand[] = [];

  for (const [instrumentId, instrumentNotes] of notesByInstrument) {
    commands.push({
      type: "TransformNotes",
      clipId,
      trackInstrumentId: instrumentId,
      changes: instrumentNotes.map((note) => ({
        noteId: note.id,
        startTick: note.startTick,
        durationTicks: note.durationTicks,
        pitch: note.pitch,
      })),
    });
  }

  return commands;
}

export function buildSliceCommandsForNotes(
  clipId: ClipId,
  notes: readonly Note[],
  sliceTick: number,
  timestamp: number,
  transactionSequence: number,
): SliceCommandPlan {
  return buildSliceCommandsForNotesAtTicks(
    clipId,
    notes,
    [sliceTick],
    timestamp,
    transactionSequence,
  );
}

/**
 * Builds one atomic slice plan for any number of timeline anchors.
 *
 * Commands are ordered from left to right so a note crossing several anchors
 * can slice the right-hand segment created by the preceding command.
 */
export function buildSliceCommandsForNotesAtTicks(
  clipId: ClipId,
  notes: readonly Note[],
  sliceTicks: readonly number[],
  timestamp: number,
  transactionSequence: number,
): SliceCommandPlan {
  const orderedSliceTicks = [...new Set(sliceTicks)].sort(
    (left, right) => left - right,
  );
  const slicesByTick = new Map<
    number,
    Map<
      InstrumentId,
      Array<{ readonly noteId: NoteId; readonly rightNoteId: NoteId }>
    >
  >();
  const resultingNoteIds: NoteId[] = [];
  let sliceSequence = 0;

  for (const note of notes) {
    const noteEndTick = note.startTick + note.durationTicks;
    let currentSegmentId = note.id;

    resultingNoteIds.push(note.id);

    for (const sliceTick of orderedSliceTicks) {
      if (
        sliceTick <= note.startTick
        || sliceTick >= noteEndTick
      ) {
        continue;
      }

      let slicesByInstrument = slicesByTick.get(sliceTick);

      if (slicesByInstrument === undefined) {
        slicesByInstrument = new Map();
        slicesByTick.set(sliceTick, slicesByInstrument);
      }

      let slices = slicesByInstrument.get(note.instrumentId);

      if (slices === undefined) {
        slices = [];
        slicesByInstrument.set(note.instrumentId, slices);
      }

      const rightNoteId =
        `slice-${timestamp}-${transactionSequence}-${sliceSequence}`;

      sliceSequence += 1;
      slices.push({
        noteId: currentSegmentId,
        rightNoteId,
      });
      currentSegmentId = rightNoteId;
      resultingNoteIds.push(rightNoteId);
    }
  }

  const commands: PianoRollCommand[] = [];

  for (const sliceTick of orderedSliceTicks) {
    const slicesByInstrument = slicesByTick.get(sliceTick);

    if (slicesByInstrument === undefined) {
      continue;
    }

    for (const [instrumentId, slices] of slicesByInstrument) {
      commands.push({
        type: "SliceNotes",
        clipId,
        trackInstrumentId: instrumentId,
        sliceTick,
        slices,
      });
    }
  }

  return {
    commands,
    resultingNoteIds,
  };
}

export function createPastedNotes(
  clipboard: PianoRollClipboard,
  pasteTick: number,
  timestamp: number,
  sequence: number,
): readonly Note[] {
  const notes: Note[] = [];

  for (
    let noteIndex = 0;
    noteIndex < clipboard.notes.length;
    noteIndex += 1
  ) {
    const sourceNote = clipboard.notes[noteIndex];

    if (sourceNote === undefined) {
      continue;
    }

    notes.push({
      ...sourceNote,
      id:
        `note-copy-${timestamp}-${sequence}-${noteIndex}`,
      startTick:
        pasteTick
        + sourceNote.startTick
        - clipboard.originTick,
    });
  }

  return notes;
}

/**
 * Captures selected notes and only the selected movable marker components.
 * Meter markers never enter the clipboard because they are not represented by
 * SelectedTimeMapMarkerGroup.
 */
export function createPianoRollClipboard(
  notes: readonly Note[],
  selectedMarkerGroups: readonly SelectedTimeMapMarkerGroup[],
  timeMap: TimeMap,
): PianoRollClipboard | null {
  const clipboardNotes = notes
    .filter(isNoteEditable)
    .map((note) => ({ ...note }));
  const markerGroups: PianoRollClipboardMarkerGroup[] = [];
  let originTick = Number.POSITIVE_INFINITY;

  for (const note of clipboardNotes) {
    originTick = Math.min(originTick, note.startTick);
  }

  for (const selectedGroup of selectedMarkerGroups) {
    const tempoMarker = selectedGroup.kinds.includes("tempo")
      ? timeMap.tempoMarkers.find(
          (marker) => marker.startTick === selectedGroup.startTick,
        )
      : undefined;
    const scaleMarker = selectedGroup.kinds.includes("scale")
      ? timeMap.scaleMarkers.find(
          (marker) => marker.startTick === selectedGroup.startTick,
        )
      : undefined;

    if (tempoMarker === undefined && scaleMarker === undefined) {
      continue;
    }

    markerGroups.push({
      startTick: selectedGroup.startTick,
      tempoBpm: tempoMarker?.bpm ?? null,
      scaleMarker: scaleMarker === undefined
        ? null
        : {
            rootNote: scaleMarker.rootNote,
            patternType: scaleMarker.patternType,
            patternId: scaleMarker.patternId,
          },
    });
    originTick = Math.min(originTick, selectedGroup.startTick);
  }

  if (
    !Number.isFinite(originTick)
    || (clipboardNotes.length === 0 && markerGroups.length === 0)
  ) {
    return null;
  }

  return {
    notes: clipboardNotes,
    markerGroups,
    originTick,
  };
}

export function createPastedMarkerGroups(
  clipboard: PianoRollClipboard,
  pasteTick: Tick,
): readonly PianoRollClipboardMarkerGroup[] {
  return clipboard.markerGroups.map((group) => ({
    startTick: pasteTick + group.startTick - clipboard.originTick,
    tempoBpm: group.tempoBpm,
    scaleMarker: group.scaleMarker === null
      ? null
      : { ...group.scaleMarker },
  }));
}

/** Builds normal and destructive marker-paste variants for one destination. */
export function planPastedMarkerCommands(
  state: ProjectDocument,
  clipId: ClipId,
  markerGroups: readonly PianoRollClipboardMarkerGroup[],
): PastedMarkerCommandPlan {
  const { timeMap } = getClip(state, clipId).timeline;
  const commands: PianoRollCommand[] = [];
  const overwriteCommands: PianoRollCommand[] = [];
  const collisions: TimeMapMarkerCollision[] = [];
  const resultingMarkerGroups: SelectedTimeMapMarkerGroup[] = [];
  const tempoTicks = new Set<Tick>();
  const scaleTicks = new Set<Tick>();

  for (const group of markerGroups) {
    if (!Number.isSafeInteger(group.startTick) || group.startTick < 0) {
      throw new Error(
        "Pasted markers cannot be positioned before tick 0.",
      );
    }

    const kinds: Array<"tempo" | "scale"> = [];

    if (group.tempoBpm !== null) {
      if (tempoTicks.has(group.startTick)) {
        throw new Error(
          "The clipboard contains duplicate tempo markers.",
        );
      }

      tempoTicks.add(group.startTick);
      kinds.push("tempo");
      const addTempoCommand = {
        type: "AddTempoMarker",
        clipId,
        startTick: group.startTick,
        bpm: group.tempoBpm,
      } as const;
      commands.push(addTempoCommand);

      const hasTempoCollision = timeMap.tempoMarkers.some(
        (marker) => marker.startTick === group.startTick,
      );

      if (hasTempoCollision) {
        collisions.push({ kind: "tempo", targetTick: group.startTick });
        overwriteCommands.push({
          type: "UpdateTempoMarker",
          clipId,
          startTick: group.startTick,
          bpm: group.tempoBpm,
        });
      } else {
        overwriteCommands.push(addTempoCommand);
      }
    }

    if (group.scaleMarker !== null) {
      if (scaleTicks.has(group.startTick)) {
        throw new Error(
          "The clipboard contains duplicate scale markers.",
        );
      }

      scaleTicks.add(group.startTick);
      kinds.push("scale");
      const addScaleCommand = {
        type: "AddScaleMarker",
        clipId,
        marker: {
          startTick: group.startTick,
          ...group.scaleMarker,
        },
      } as const;
      commands.push(addScaleCommand);

      const hasScaleCollision = timeMap.scaleMarkers.some(
        (marker) => marker.startTick === group.startTick,
      );

      if (hasScaleCollision) {
        collisions.push({ kind: "scale", targetTick: group.startTick });
        overwriteCommands.push({
          type: "UpdateScaleMarker",
          clipId,
          startTick: group.startTick,
          changes: { ...group.scaleMarker },
        });
      } else {
        overwriteCommands.push(addScaleCommand);
      }
    }

    // Tick-0 markers are editable but intentionally not movable/selectable.
    if (kinds.length > 0 && group.startTick > 0) {
      resultingMarkerGroups.push({
        startTick: group.startTick,
        kinds,
      });
    }
  }

  return {
    commands,
    overwriteCommands,
    resultingMarkerGroups,
    collisions,
  };
}

export function buildDeleteClipboardMarkerCommands(
  clipId: ClipId,
  markerGroups: readonly PianoRollClipboardMarkerGroup[],
): readonly PianoRollCommand[] {
  const commands: PianoRollCommand[] = [];

  for (const group of markerGroups) {
    if (group.startTick <= 0) {
      continue;
    }

    if (group.tempoBpm !== null) {
      commands.push({
        type: "DeleteTempoMarker",
        clipId,
        startTick: group.startTick,
      });
    }

    if (group.scaleMarker !== null) {
      commands.push({
        type: "DeleteScaleMarker",
        clipId,
        startTick: group.startTick,
      });
    }
  }

  return commands;
}

/** Deletes only the explicitly selected movable marker components. */
export function buildDeleteSelectedMarkerCommands(
  clipId: ClipId,
  markerGroups: readonly SelectedTimeMapMarkerGroup[],
): readonly PianoRollCommand[] {
  const commands: PianoRollCommand[] = [];

  for (const group of markerGroups) {
    if (group.startTick <= 0) {
      continue;
    }

    if (group.kinds.includes("tempo")) {
      commands.push({
        type: "DeleteTempoMarker",
        clipId,
        startTick: group.startTick,
      });
    }

    if (group.kinds.includes("scale")) {
      commands.push({
        type: "DeleteScaleMarker",
        clipId,
        startTick: group.startTick,
      });
    }
  }

  return commands;
}

export function canPlacePastedNotes(
  state: ProjectDocument,
  clipId: ClipId,
  notes: readonly Note[],
): boolean {
  const clip = getClip(state, clipId);

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    const instrument = state.projectInstrumentsById[note.instrumentId];
    const track = clip.tracksByInstrumentId[note.instrumentId];

    if (
      instrument === undefined
      || track === undefined
      || note.startTick < 0
    ) {
      return false;
    }
  }

  return (
    notes.length > 0
    && getRequiredMeasureCountForNotes(state, clipId, notes)
      <= MAXIMUM_MEASURE_COUNT
  );
}

export function canPlacePastedTimelineContent(
  state: ProjectDocument,
  clipId: ClipId,
  notes: readonly Note[],
  markerGroups: readonly PianoRollClipboardMarkerGroup[],
): boolean {
  const clip = getClip(state, clipId);

  if (notes.length === 0 && markerGroups.length === 0) {
    return false;
  }

  for (const note of notes) {
    const instrument = state.projectInstrumentsById[note.instrumentId];
    const track = clip.tracksByInstrumentId[note.instrumentId];

    if (
      instrument === undefined
      || track === undefined
      || note.startTick < 0
    ) {
      return false;
    }
  }

  for (const group of markerGroups) {
    if (
      !Number.isSafeInteger(group.startTick)
      || group.startTick < 0
      || (group.tempoBpm === null && group.scaleMarker === null)
    ) {
      return false;
    }
  }

  return getRequiredMeasureCountForTimelineContent(
    state,
    clipId,
    notes,
    markerGroups,
  ) <= MAXIMUM_MEASURE_COUNT;
}

export function getRequiredMeasureCountForNotes(
  state: ProjectDocument,
  clipId: ClipId,
  notes: readonly Note[],
): number {
  return getRequiredMeasureCountForTimelineContent(
    state,
    clipId,
    notes,
    [],
  );
}

export function getRequiredMeasureCountForTimelineContent(
  state: ProjectDocument,
  clipId: ClipId,
  notes: readonly Note[],
  markerGroups: readonly PianoRollClipboardMarkerGroup[],
): number {
  const clip = getClip(state, clipId);
  let maximumEndTick = 0;

  for (const note of notes) {
    const noteEndTick = note.startTick + note.durationTicks;

    if (!Number.isSafeInteger(noteEndTick) || noteEndTick <= 0) {
      return MAXIMUM_MEASURE_COUNT + 1;
    }

    maximumEndTick = Math.max(maximumEndTick, noteEndTick);
  }

  for (const group of markerGroups) {
    if (!Number.isSafeInteger(group.startTick) || group.startTick < 0) {
      return MAXIMUM_MEASURE_COUNT + 1;
    }

    if (group.startTick === 0) {
      continue;
    }

    const markerEndTick = group.startTick + 1;

    if (!Number.isSafeInteger(markerEndTick)) {
      return MAXIMUM_MEASURE_COUNT + 1;
    }

    maximumEndTick = Math.max(maximumEndTick, markerEndTick);
  }

  const { timeMap, durationTicks } = clip.timeline;

  return Math.max(
    getMeasureCount(state.clock.ppqn, timeMap, durationTicks),
    getMeasureCountCoveringTick(
      state.clock.ppqn,
      timeMap.meterMarkers,
      maximumEndTick,
    ),
  );
}

export function createInstrumentTransferPlan(
  state: ProjectDocument,
  clipId: ClipId,
  selectedNotes: readonly Note[],
  targetInstrumentId: InstrumentId,
): InstrumentTransferPlan {
  const clip = getClip(state, clipId);
  const targetInstrument = state.projectInstrumentsById[targetInstrumentId];
  const targetTrack = clip.tracksByInstrumentId[targetInstrumentId];

  if (targetInstrument === undefined || targetTrack === undefined) {
    return {
      valid: false,
      message: "The selected target instrument is unavailable.",
    };
  }

  const transferredNotes: Note[] = [];
  const originalNotes: Note[] = [];
  const noteIdsBySourceInstrument = new Map<InstrumentId, NoteId[]>();

  for (
    let noteIndex = 0;
    noteIndex < selectedNotes.length;
    noteIndex += 1
  ) {
    const selectedNote = selectedNotes[noteIndex];

    if (selectedNote === undefined) {
      continue;
    }

    const sourceInstrument = state.projectInstrumentsById[selectedNote.instrumentId];
    const sourceTrack = clip.tracksByInstrumentId[selectedNote.instrumentId];

    if (
      sourceInstrument === undefined
      || sourceTrack?.notesById[selectedNote.id] === undefined
    ) {
      return {
        valid: false,
        message: "The selection contains a note that is no longer available.",
      };
    }

    if (!isNoteEditable(selectedNote)) {
      return {
        valid: false,
        message: `Unlock note "${selectedNote.id}" before transferring it.`,
      };
    }

    if (selectedNote.instrumentId === targetInstrumentId) {
      continue;
    }

    if (targetTrack.notesById[selectedNote.id] !== undefined) {
      return {
        valid: false,
        message: `Transfer cancelled because note ID "${selectedNote.id}" already exists in the target instrument.`,
      };
    }

    originalNotes.push(selectedNote);
    transferredNotes.push({
      ...selectedNote,
      instrumentId: targetInstrumentId,
    });
    let sourceNoteIds = noteIdsBySourceInstrument.get(
      selectedNote.instrumentId,
    );

    if (sourceNoteIds === undefined) {
      sourceNoteIds = [];
      noteIdsBySourceInstrument.set(
        selectedNote.instrumentId,
        sourceNoteIds,
      );
    }

    sourceNoteIds.push(selectedNote.id);
  }

  const commands: PianoRollCommand[] = [];

  for (const [sourceInstrumentId, noteIds] of noteIdsBySourceInstrument) {
    commands.push({
      type: "MoveNotes",
      clipId: clip.id,
      sourceInstrumentId,
      targetInstrumentId,
      noteIds,
      deltaTicks: 0,
      deltaPitch: 0,
    });
  }

  return {
    valid: true,
    commands,
    originalNotes,
    proposedNotes: transferredNotes,
  };
}

export function findNotesByIds(
  state: ProjectDocument,
  clipId: ClipId,
  noteIds: readonly NoteId[],
): readonly Note[] {
  const clip = getClip(state, clipId);
  const notes: Note[] = [];
  const acceptedNoteIds = new Set<NoteId>();

  for (const noteId of noteIds) {
    if (acceptedNoteIds.has(noteId)) {
      continue;
    }

    for (const instrumentId of state.instrumentOrder) {
      const note = clip.tracksByInstrumentId[instrumentId]?.notesById[noteId];

      if (note !== undefined) {
        acceptedNoteIds.add(note.id);
        notes.push(note);
        break;
      }
    }
  }

  return notes;
}
