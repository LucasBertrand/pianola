import type {
  PianoRollCommand,
} from "./commands/command-types";
import {
  type Note,
} from "./notes/note";
import {
  type NoteId,
  type ClipId,
  type InstrumentId,
} from "./identifiers";
import {
  type Clip,
} from "./clips/clip";
import {
  type ProjectDocument,
} from "./project/project-document";
import {
  getClip,
} from "./project/project-document";

export type NoteCollisionResolutionMode = "merge" | "slice";

export interface NoteEditIntent {
  readonly originalNotes: readonly Note[];
  readonly proposedNotes: readonly Note[];
}

export interface NoteCollisionResolutionPlan {
  readonly commands: readonly PianoRollCommand[];
  readonly resultingSelectionNoteIds: readonly NoteId[];
}

interface NoteGroup {
  readonly proposedNotes: Note[];
  readonly existingNotes: Note[];
}

interface NoteInterval {
  readonly startTick: number;
  readonly endTick: number;
}

export function countNoteEditCollisions(
  state: ProjectDocument,
  clipId: ClipId,
  intent: NoteEditIntent,
): number {
  const clip = getClip(state, clipId);
  const originalNoteIds = createNoteIdSet(intent.originalNotes);
  let collisionCount = 0;

  for (
    let proposedIndex = 0;
    proposedIndex < intent.proposedNotes.length;
    proposedIndex += 1
  ) {
    const proposedNote = intent.proposedNotes[proposedIndex];

    if (proposedNote === undefined) {
      continue;
    }

    const track = clip.tracksByInstrumentId[proposedNote.instrumentId];

    if (track !== undefined) {
      for (const existingNoteId in track.notesById) {
        const existingNote = track.notesById[existingNoteId];

        if (
          existingNote !== undefined
          && !originalNoteIds.has(existingNote.id)
          && notesOverlap(proposedNote, existingNote)
        ) {
          collisionCount += 1;
        }
      }
    }

    for (
      let candidateIndex = 0;
      candidateIndex < proposedIndex;
      candidateIndex += 1
    ) {
      const candidate = intent.proposedNotes[candidateIndex];

      if (
        candidate !== undefined
        && notesOverlap(proposedNote, candidate)
      ) {
        collisionCount += 1;
      }
    }
  }

  return collisionCount;
}

export function hasNoteEditCollisions(
  state: ProjectDocument,
  clipId: ClipId,
  intent: NoteEditIntent,
): boolean {
  return countNoteEditCollisions(state, clipId, intent) > 0;
}

export function createNoteCollisionResolutionPlan(
  state: ProjectDocument,
  clipId: ClipId,
  intent: NoteEditIntent,
  mode: NoteCollisionResolutionMode,
  fragmentIdNamespace: string,
): NoteCollisionResolutionPlan {
  const originalNoteIds = createNoteIdSet(intent.originalNotes);
  const clip = getClip(state, clipId);
  const groups = createAffectedNoteGroups(
    clip,
    intent.proposedNotes,
    originalNoteIds,
  );
  const deletedNotesByInstrument = new Map<InstrumentId, Set<NoteId>>();
  const addedNotes: Note[] = [];
  const resultingSelectionNoteIds: NoteId[] = [];
  const reservedNoteIds = collectClipNoteIds(state, clip);
  let fragmentSequence = 0;

  for (const originalNote of intent.originalNotes) {
    const storedNote =
      clip
        .tracksByInstrumentId[originalNote.instrumentId]
        ?.notesById[originalNote.id];

    if (storedNote !== undefined) {
      addDeletedNoteId(
        deletedNotesByInstrument,
        storedNote.instrumentId,
        storedNote.id,
      );
    }
  }

  for (const [, pitchGroups] of groups) {
    for (const [, group] of pitchGroups) {
      if (mode === "merge") {
        appendMergedGroup(
          group,
          deletedNotesByInstrument,
          addedNotes,
          resultingSelectionNoteIds,
        );
        continue;
      }

      const consolidatedProposals =
        consolidateProposedNotes(group.proposedNotes);

      for (const proposedNote of consolidatedProposals) {
        addedNotes.push(proposedNote);
        resultingSelectionNoteIds.push(proposedNote.id);
        reservedNoteIds.add(proposedNote.id);
      }

      for (const existingNote of group.existingNotes) {
        const fragments = subtractProposedIntervals(
          existingNote,
          consolidatedProposals,
        );

        if (
          fragments.length === 1
          && fragments[0]?.startTick === existingNote.startTick
          && fragments[0]?.endTick
            === existingNote.startTick + existingNote.durationTicks
        ) {
          continue;
        }

        addDeletedNoteId(
          deletedNotesByInstrument,
          existingNote.instrumentId,
          existingNote.id,
        );

        for (
          let fragmentIndex = 0;
          fragmentIndex < fragments.length;
          fragmentIndex += 1
        ) {
          const fragment = fragments[fragmentIndex];

          if (fragment === undefined) {
            continue;
          }

          let fragmentId = existingNote.id;

          if (fragmentIndex > 0) {
            fragmentSequence += 1;
            fragmentId = createUniqueFragmentId(
              existingNote.id,
              fragmentIdNamespace,
              fragmentSequence,
              reservedNoteIds,
            );
          }

          reservedNoteIds.add(fragmentId);
          addedNotes.push({
            ...existingNote,
            id: fragmentId,
            startTick: fragment.startTick,
            durationTicks: fragment.endTick - fragment.startTick,
          });
        }
      }
    }
  }

  return {
    commands: buildReplacementCommands(
      clip.id,
      deletedNotesByInstrument,
      addedNotes,
    ),
    resultingSelectionNoteIds,
  };
}

function createAffectedNoteGroups(
  clip: Clip,
  proposedNotes: readonly Note[],
  originalNoteIds: ReadonlySet<NoteId>,
): Map<InstrumentId, Map<number, NoteGroup>> {
  const groups = new Map<InstrumentId, Map<number, NoteGroup>>();

  for (const proposedNote of proposedNotes) {
    const group = getOrCreateNoteGroup(
      groups,
      proposedNote.instrumentId,
      proposedNote.pitch,
    );

    group.proposedNotes.push(proposedNote);
  }

  for (const [instrumentId, pitchGroups] of groups) {
    const track = clip.tracksByInstrumentId[instrumentId];

    if (track === undefined) {
      continue;
    }

    for (const existingNoteId in track.notesById) {
      const existingNote = track.notesById[existingNoteId];

      if (
        existingNote === undefined
        || originalNoteIds.has(existingNote.id)
      ) {
        continue;
      }

      const group = pitchGroups.get(existingNote.pitch);

      if (group !== undefined) {
        group.existingNotes.push(existingNote);
      }
    }
  }

  return groups;
}

function getOrCreateNoteGroup(
  groups: Map<InstrumentId, Map<number, NoteGroup>>,
  instrumentId: InstrumentId,
  pitch: number,
): NoteGroup {
  let pitchGroups = groups.get(instrumentId);

  if (pitchGroups === undefined) {
    pitchGroups = new Map<number, NoteGroup>();
    groups.set(instrumentId, pitchGroups);
  }

  let group = pitchGroups.get(pitch);

  if (group === undefined) {
    group = {
      proposedNotes: [],
      existingNotes: [],
    };
    pitchGroups.set(pitch, group);
  }

  return group;
}

function appendMergedGroup(
  group: NoteGroup,
  deletedNotesByInstrument: Map<InstrumentId, Set<NoteId>>,
  addedNotes: Note[],
  resultingSelectionNoteIds: NoteId[],
): void {
  const sortedNotes = group.proposedNotes
    .map((note, proposalIndex) => ({
      note,
      proposalIndex,
      proposed: true,
    }))
    .concat(
      group.existingNotes.map((note) => ({
        note,
        proposalIndex: Number.POSITIVE_INFINITY,
        proposed: false,
      })),
    )
    .sort((left, right) =>
      left.note.startTick - right.note.startTick
      || (
        left.note.startTick + left.note.durationTicks
        - right.note.startTick
        - right.note.durationTicks
      )
      || left.note.id.localeCompare(right.note.id));

  let componentStartIndex = 0;

  while (componentStartIndex < sortedNotes.length) {
    const firstEntry = sortedNotes[componentStartIndex];

    if (firstEntry === undefined) {
      componentStartIndex += 1;
      continue;
    }

    let componentEndIndex = componentStartIndex + 1;
    let componentEndTick =
      firstEntry.note.startTick + firstEntry.note.durationTicks;
    let primaryProposal = firstEntry.proposed
      ? firstEntry
      : undefined;

    while (componentEndIndex < sortedNotes.length) {
      const entry = sortedNotes[componentEndIndex];

      if (
        entry === undefined
        || entry.note.startTick >= componentEndTick
      ) {
        break;
      }

      componentEndTick = Math.max(
        componentEndTick,
        entry.note.startTick + entry.note.durationTicks,
      );

      if (
        entry.proposed
        && (
          primaryProposal === undefined
          || entry.proposalIndex < primaryProposal.proposalIndex
        )
      ) {
        primaryProposal = entry;
      }

      componentEndIndex += 1;
    }

    if (primaryProposal !== undefined) {
      let componentStartTick = Number.POSITIVE_INFINITY;

      for (
        let entryIndex = componentStartIndex;
        entryIndex < componentEndIndex;
        entryIndex += 1
      ) {
        const entry = sortedNotes[entryIndex];

        if (entry === undefined) {
          continue;
        }

        componentStartTick = Math.min(
          componentStartTick,
          entry.note.startTick,
        );

        if (!entry.proposed) {
          addDeletedNoteId(
            deletedNotesByInstrument,
            entry.note.instrumentId,
            entry.note.id,
          );
        }
      }

      const mergedNote: Note = {
        ...primaryProposal.note,
        startTick: componentStartTick,
        durationTicks: componentEndTick - componentStartTick,
      };

      addedNotes.push(mergedNote);
      resultingSelectionNoteIds.push(mergedNote.id);
    }

    componentStartIndex = componentEndIndex;
  }
}

function consolidateProposedNotes(
  proposedNotes: readonly Note[],
): readonly Note[] {
  const sortedNotes = proposedNotes
    .map((note, proposalIndex) => ({
      note,
      proposalIndex,
    }))
    .sort((left, right) =>
      left.note.startTick - right.note.startTick
      || left.note.id.localeCompare(right.note.id));
  const consolidatedNotes: Note[] = [];
  let entryIndex = 0;

  while (entryIndex < sortedNotes.length) {
    const firstEntry = sortedNotes[entryIndex];

    if (firstEntry === undefined) {
      entryIndex += 1;
      continue;
    }

    let endTick =
      firstEntry.note.startTick + firstEntry.note.durationTicks;
    let primaryEntry = firstEntry;
    let nextIndex = entryIndex + 1;

    while (nextIndex < sortedNotes.length) {
      const entry = sortedNotes[nextIndex];

      if (
        entry === undefined
        || entry.note.startTick >= endTick
      ) {
        break;
      }

      endTick = Math.max(
        endTick,
        entry.note.startTick + entry.note.durationTicks,
      );

      if (entry.proposalIndex < primaryEntry.proposalIndex) {
        primaryEntry = entry;
      }

      nextIndex += 1;
    }

    consolidatedNotes.push({
      ...primaryEntry.note,
      startTick: firstEntry.note.startTick,
      durationTicks: endTick - firstEntry.note.startTick,
    });
    entryIndex = nextIndex;
  }

  return consolidatedNotes;
}

function subtractProposedIntervals(
  existingNote: Note,
  proposedNotes: readonly Note[],
): readonly NoteInterval[] {
  const existingEndTick =
    existingNote.startTick + existingNote.durationTicks;
  const intervals = proposedNotes
    .filter((note) => notesOverlap(existingNote, note))
    .map((note) => ({
      startTick: note.startTick,
      endTick: note.startTick + note.durationTicks,
    }))
    .sort((left, right) =>
      left.startTick - right.startTick
      || left.endTick - right.endTick);
  const fragments: NoteInterval[] = [];
  let cursorTick = existingNote.startTick;

  for (const interval of intervals) {
    const clippedStartTick = Math.max(
      existingNote.startTick,
      interval.startTick,
    );
    const clippedEndTick = Math.min(
      existingEndTick,
      interval.endTick,
    );

    if (clippedStartTick > cursorTick) {
      fragments.push({
        startTick: cursorTick,
        endTick: clippedStartTick,
      });
    }

    cursorTick = Math.max(cursorTick, clippedEndTick);

    if (cursorTick >= existingEndTick) {
      break;
    }
  }

  if (cursorTick < existingEndTick) {
    fragments.push({
      startTick: cursorTick,
      endTick: existingEndTick,
    });
  }

  return fragments;
}

function buildReplacementCommands(
  clipId: string,
  deletedNotesByInstrument: ReadonlyMap<InstrumentId, ReadonlySet<NoteId>>,
  addedNotes: readonly Note[],
): readonly PianoRollCommand[] {
  const commands: PianoRollCommand[] = [];

  for (const [instrumentId, noteIds] of deletedNotesByInstrument) {
    if (noteIds.size > 0) {
      commands.push({
        type: "DeleteNotes",
        clipId,
        trackInstrumentId: instrumentId,
        noteIds: Array.from(noteIds),
      });
    }
  }

  const addedNotesByInstrument = new Map<InstrumentId, Note[]>();

  for (const note of addedNotes) {
    let instrumentNotes = addedNotesByInstrument.get(note.instrumentId);

    if (instrumentNotes === undefined) {
      instrumentNotes = [];
      addedNotesByInstrument.set(note.instrumentId, instrumentNotes);
    }

    instrumentNotes.push(note);
  }

  for (const [instrumentId, instrumentNotes] of addedNotesByInstrument) {
    commands.push({
      type: "AddNotes",
      clipId,
      trackInstrumentId: instrumentId,
      notes: instrumentNotes,
    });
  }

  return commands;
}

function addDeletedNoteId(
  deletedNotesByInstrument: Map<InstrumentId, Set<NoteId>>,
  instrumentId: InstrumentId,
  noteId: NoteId,
): void {
  let noteIds = deletedNotesByInstrument.get(instrumentId);

  if (noteIds === undefined) {
    noteIds = new Set<NoteId>();
    deletedNotesByInstrument.set(instrumentId, noteIds);
  }

  noteIds.add(noteId);
}

function createNoteIdSet(notes: readonly Note[]): Set<NoteId> {
  const noteIds = new Set<NoteId>();

  for (const note of notes) {
    noteIds.add(note.id);
  }

  return noteIds;
}

function collectClipNoteIds(
  state: ProjectDocument,
  clip: Clip,
): Set<NoteId> {
  const noteIds = new Set<NoteId>();

  for (const instrumentId of state.instrumentOrder) {
    const track = clip.tracksByInstrumentId[instrumentId];

    if (track === undefined) {
      continue;
    }

    for (const noteId in track.notesById) {
      noteIds.add(noteId);
    }
  }

  return noteIds;
}

function createUniqueFragmentId(
  sourceNoteId: NoteId,
  namespace: string,
  sequence: number,
  reservedNoteIds: ReadonlySet<NoteId>,
): NoteId {
  const sourcePrefix = sourceNoteId.slice(0, 64);
  const namespacePrefix = namespace.slice(0, 48);
  let suffix = sequence;
  let noteId =
    `${sourcePrefix}-slice-${namespacePrefix}-${suffix}`;

  while (reservedNoteIds.has(noteId)) {
    suffix += 1;
    noteId =
      `${sourcePrefix}-slice-${namespacePrefix}-${suffix}`;
  }

  return noteId;
}

function notesOverlap(left: Note, right: Note): boolean {
  return (
    left.instrumentId === right.instrumentId
    && left.pitch === right.pitch
    && left.startTick
      < right.startTick + right.durationTicks
    && right.startTick
      < left.startTick + left.durationTicks
  );
}
