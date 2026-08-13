import { PROJECT_CONSTANTS } from "../../config/domain-limits";
import {
  type Note,
} from "../../domain/notes/note";
import type {
  MidiImportCollisionStrategy,
  MidiImportInstrumentCandidate,
  ResolvedFragment,
  SliceHeapEntry,
} from "./midi-import-types";

export function countImportedNoteCollisions(
  candidates: readonly MidiImportInstrumentCandidate[],
): number {
  let collisionCount = 0;

  for (const candidate of candidates) {
    const notesByPitch = groupNotesByPitch(candidate.notes);

    for (const notes of notesByPitch.values()) {
      const sortedNotes = [...notes].sort(compareNotesByTime);
      let maximumEndTick = -1;

      for (const note of sortedNotes) {
        if (note.startTick < maximumEndTick) {
          collisionCount += 1;
        }

        maximumEndTick = Math.max(
          maximumEndTick,
          note.startTick + note.durationTicks,
        );
      }
    }
  }

  return collisionCount;
}

export function resolveImportedNotes(
  notes: readonly Note[],
  strategy: MidiImportCollisionStrategy,
): readonly Note[] {
  const resolvedNotes: Note[] = [];
  const notesByPitch = groupNotesByPitch(notes);

  for (const pitchNotes of notesByPitch.values()) {
    const resolvedPitchNotes =
      strategy === "merge"
        ? mergePitchNotes(pitchNotes)
        : slicePitchNotes(pitchNotes);

    resolvedNotes.push(...resolvedPitchNotes);
  }

  resolvedNotes.sort((left, right) =>
    left.startTick - right.startTick
    || left.pitch - right.pitch
    || left.id.localeCompare(right.id));
  return resolvedNotes;
}

function groupNotesByPitch(
  notes: readonly Note[],
): Map<number, Note[]> {
  const notesByPitch = new Map<number, Note[]>();

  for (const note of notes) {
    let pitchNotes = notesByPitch.get(note.pitch);

    if (pitchNotes === undefined) {
      pitchNotes = [];
      notesByPitch.set(note.pitch, pitchNotes);
    }

    pitchNotes.push(note);
  }

  return notesByPitch;
}

function mergePitchNotes(notes: readonly Note[]): readonly Note[] {
  const sortedNotes = [...notes].sort(compareNotesByTime);
  const mergedNotes: Note[] = [];
  let noteIndex = 0;

  while (noteIndex < sortedNotes.length) {
    const firstNote = sortedNotes[noteIndex];

    if (firstNote === undefined) {
      noteIndex += 1;
      continue;
    }

    let endTick =
      firstNote.startTick + firstNote.durationTicks;
    let nextIndex = noteIndex + 1;

    while (nextIndex < sortedNotes.length) {
      const candidate = sortedNotes[nextIndex];

      if (
        candidate === undefined
        || candidate.startTick >= endTick
      ) {
        break;
      }

      endTick = Math.max(
        endTick,
        candidate.startTick + candidate.durationTicks,
      );
      nextIndex += 1;
    }

    mergedNotes.push({
      ...firstNote,
      durationTicks: endTick - firstNote.startTick,
    });
    noteIndex = nextIndex;
  }

  return mergedNotes;
}

function slicePitchNotes(notes: readonly Note[]): readonly Note[] {
  const sortedNotes = [...notes].sort(compareNotesByTime);
  const boundaries: number[] = [];

  for (const note of sortedNotes) {
    boundaries.push(
      note.startTick,
      note.startTick + note.durationTicks,
    );
  }

  boundaries.sort((left, right) => left - right);
  const uniqueBoundaries: number[] = [];

  for (const boundary of boundaries) {
    if (
      uniqueBoundaries.length === 0
      || uniqueBoundaries[uniqueBoundaries.length - 1]
        !== boundary
    ) {
      uniqueBoundaries.push(boundary);
    }
  }

  const heap: SliceHeapEntry[] = [];
  const fragments: ResolvedFragment[] = [];
  const fragmentCountsBySourceId = new Map<string, number>();
  let noteIndex = 0;

  for (
    let boundaryIndex = 0;
    boundaryIndex < uniqueBoundaries.length - 1;
    boundaryIndex += 1
  ) {
    const startTick = uniqueBoundaries[boundaryIndex];
    const endTick = uniqueBoundaries[boundaryIndex + 1];

    if (startTick === undefined || endTick === undefined) {
      continue;
    }

    while (
      noteIndex < sortedNotes.length
      && sortedNotes[noteIndex]?.startTick === startTick
    ) {
      const note = sortedNotes[noteIndex];

      if (note !== undefined) {
        pushSliceHeap(heap, {
          note,
          endTick: note.startTick + note.durationTicks,
        });
      }

      noteIndex += 1;
    }

    while (heap[0] !== undefined && heap[0].endTick <= startTick) {
      popSliceHeap(heap);
    }

    const winner = heap[0]?.note;

    if (winner === undefined || endTick <= startTick) {
      continue;
    }

    const previousFragment =
      fragments[fragments.length - 1];

    if (
      previousFragment !== undefined
      && previousFragment.sourceNoteId === winner.id
      && previousFragment.note.startTick
        + previousFragment.note.durationTicks === startTick
    ) {
      fragments[fragments.length - 1] = {
        sourceNoteId: winner.id,
        note: {
          ...previousFragment.note,
          durationTicks:
            endTick - previousFragment.note.startTick,
        },
      };
      continue;
    }

    const fragmentCount =
      fragmentCountsBySourceId.get(winner.id) ?? 0;
    const fragmentId =
      fragmentCount === 0
        ? winner.id
        : createSliceFragmentId(winner.id, fragmentCount);

    fragmentCountsBySourceId.set(
      winner.id,
      fragmentCount + 1,
    );
    fragments.push({
      sourceNoteId: winner.id,
      note: {
        ...winner,
        id: fragmentId,
        startTick,
        durationTicks: endTick - startTick,
      },
    });
  }

  return fragments.map((fragment) => fragment.note);
}

function pushSliceHeap(
  heap: SliceHeapEntry[],
  entry: SliceHeapEntry,
): void {
  heap.push(entry);
  let index = heap.length - 1;

  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    const parent = heap[parentIndex];

    if (
      parent === undefined
      || compareSlicePriority(parent, entry) >= 0
    ) {
      break;
    }

    heap[index] = parent;
    index = parentIndex;
  }

  heap[index] = entry;
}

function popSliceHeap(heap: SliceHeapEntry[]): void {
  const last = heap.pop();

  if (last === undefined || heap.length === 0) {
    return;
  }

  let index = 0;

  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    const left = heap[leftIndex];
    const right = heap[rightIndex];

    if (left === undefined) {
      break;
    }

    const higherPriorityChild =
      right !== undefined
      && compareSlicePriority(right, left) > 0
        ? right
        : left;
    const childIndex =
      higherPriorityChild === right
        ? rightIndex
        : leftIndex;

    if (compareSlicePriority(last, higherPriorityChild) >= 0) {
      break;
    }

    heap[index] = higherPriorityChild;
    index = childIndex;
  }

  heap[index] = last;
}

function compareSlicePriority(
  left: SliceHeapEntry,
  right: SliceHeapEntry,
): number {
  return (
    left.note.startTick - right.note.startTick
    || left.note.id.localeCompare(right.note.id)
  );
}

function createSliceFragmentId(
  sourceNoteId: string,
  fragmentIndex: number,
): string {
  const suffix = `-slice-${String(fragmentIndex)}`;
  return (
    sourceNoteId.slice(
      0,
      PROJECT_CONSTANTS.maximumEntityIdLength - suffix.length,
    )
    + suffix
  );
}

export function compareNotesByTime(left: Note, right: Note): number {
  return (
    left.startTick - right.startTick
    || left.id.localeCompare(right.id)
  );
}
