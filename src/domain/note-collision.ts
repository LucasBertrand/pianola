import type {
  PianoRollCommand,
} from "./commands";
import type {
  Note,
  NoteId,
  ProjectState,
  VoiceId,
} from "./model";
import {
  getActiveClip,
} from "./model";

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
  state: ProjectState,
  intent: NoteEditIntent,
): number {
  const activeClip = getActiveClip(state);
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

    const track = activeClip.tracksByVoiceId[proposedNote.voiceId];

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
  state: ProjectState,
  intent: NoteEditIntent,
): boolean {
  return countNoteEditCollisions(state, intent) > 0;
}

export function createNoteCollisionResolutionPlan(
  state: ProjectState,
  intent: NoteEditIntent,
  mode: NoteCollisionResolutionMode,
  fragmentIdNamespace: string,
): NoteCollisionResolutionPlan {
  const originalNoteIds = createNoteIdSet(intent.originalNotes);
  const activeClip = getActiveClip(state);
  const groups = createAffectedNoteGroups(
    state,
    intent.proposedNotes,
    originalNoteIds,
  );
  const deletedNotesByVoice = new Map<VoiceId, Set<NoteId>>();
  const addedNotes: Note[] = [];
  const resultingSelectionNoteIds: NoteId[] = [];
  const reservedNoteIds = collectProjectNoteIds(state);
  let fragmentSequence = 0;

  for (const originalNote of intent.originalNotes) {
    const storedNote =
      activeClip
        .tracksByVoiceId[originalNote.voiceId]
        ?.notesById[originalNote.id];

    if (storedNote !== undefined) {
      addDeletedNoteId(
        deletedNotesByVoice,
        storedNote.voiceId,
        storedNote.id,
      );
    }
  }

  for (const [, pitchGroups] of groups) {
    for (const [, group] of pitchGroups) {
      if (mode === "merge") {
        appendMergedGroup(
          group,
          deletedNotesByVoice,
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
          deletedNotesByVoice,
          existingNote.voiceId,
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
      deletedNotesByVoice,
      addedNotes,
    ),
    resultingSelectionNoteIds,
  };
}

function createAffectedNoteGroups(
  state: ProjectState,
  proposedNotes: readonly Note[],
  originalNoteIds: ReadonlySet<NoteId>,
): Map<VoiceId, Map<number, NoteGroup>> {
  const groups = new Map<VoiceId, Map<number, NoteGroup>>();
  const activeClip = getActiveClip(state);

  for (const proposedNote of proposedNotes) {
    const group = getOrCreateNoteGroup(
      groups,
      proposedNote.voiceId,
      proposedNote.pitch,
    );

    group.proposedNotes.push(proposedNote);
  }

  for (const [voiceId, pitchGroups] of groups) {
    const track = activeClip.tracksByVoiceId[voiceId];

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
  groups: Map<VoiceId, Map<number, NoteGroup>>,
  voiceId: VoiceId,
  pitch: number,
): NoteGroup {
  let pitchGroups = groups.get(voiceId);

  if (pitchGroups === undefined) {
    pitchGroups = new Map<number, NoteGroup>();
    groups.set(voiceId, pitchGroups);
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
  deletedNotesByVoice: Map<VoiceId, Set<NoteId>>,
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
            deletedNotesByVoice,
            entry.note.voiceId,
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
  deletedNotesByVoice: ReadonlyMap<VoiceId, ReadonlySet<NoteId>>,
  addedNotes: readonly Note[],
): readonly PianoRollCommand[] {
  const commands: PianoRollCommand[] = [];

  for (const [voiceId, noteIds] of deletedNotesByVoice) {
    if (noteIds.size > 0) {
      commands.push({
        type: "DeleteNotes",
        trackVoiceId: voiceId,
        noteIds: Array.from(noteIds),
      });
    }
  }

  const addedNotesByVoice = new Map<VoiceId, Note[]>();

  for (const note of addedNotes) {
    let voiceNotes = addedNotesByVoice.get(note.voiceId);

    if (voiceNotes === undefined) {
      voiceNotes = [];
      addedNotesByVoice.set(note.voiceId, voiceNotes);
    }

    voiceNotes.push(note);
  }

  for (const [voiceId, voiceNotes] of addedNotesByVoice) {
    commands.push({
      type: "AddNotes",
      trackVoiceId: voiceId,
      notes: voiceNotes,
    });
  }

  return commands;
}

function addDeletedNoteId(
  deletedNotesByVoice: Map<VoiceId, Set<NoteId>>,
  voiceId: VoiceId,
  noteId: NoteId,
): void {
  let noteIds = deletedNotesByVoice.get(voiceId);

  if (noteIds === undefined) {
    noteIds = new Set<NoteId>();
    deletedNotesByVoice.set(voiceId, noteIds);
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

function collectProjectNoteIds(state: ProjectState): Set<NoteId> {
  const noteIds = new Set<NoteId>();
  const activeClip = getActiveClip(state);

  for (const voiceId of state.voiceOrder) {
    const track = activeClip.tracksByVoiceId[voiceId];

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
    left.voiceId === right.voiceId
    && left.pitch === right.pitch
    && left.startTick
      < right.startTick + right.durationTicks
    && right.startTick
      < left.startTick + left.durationTicks
  );
}
