import type {
  Note,
  Tick,
} from "./model";

export type SelectionTransformationKind =
  | "invert"
  | "retrograde"
  | "augment"
  | "diminish";

export class SelectionTransformationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SelectionTransformationError";
  }
}

/**
 * Transforms a complete selection without mutating its notes.
 *
 * Inversion uses the lowest note at the earliest selected onset as its pitch
 * axis. Retrograde mirrors note intervals inside the exact selected time span.
 * Augmentation and diminution scale both onsets and durations from the first
 * selected onset, which preserves the rhythm of the motif.
 */
export function transformNoteSelection(
  notes: readonly Note[],
  kind: SelectionTransformationKind,
  projectDurationTicks: Tick,
): readonly Note[] {
  if (notes.length === 0) {
    return [];
  }

  const firstNote = findFirstNote(notes);
  const selectionStartTick = findSelectionStartTick(notes);
  const selectionEndTick = findSelectionEndTick(notes);
  const transformedNotes: Note[] = [];

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    let startTick = note.startTick;
    let durationTicks = note.durationTicks;
    let pitch = note.pitch;

    switch (kind) {
      case "invert":
        pitch = firstNote.pitch * 2 - note.pitch;
        break;
      case "retrograde":
        startTick =
          selectionStartTick
          + selectionEndTick
          - note.startTick
          - note.durationTicks;
        break;
      case "augment":
        startTick = scaleTickFromAnchor(
          note.startTick,
          selectionStartTick,
          2,
        );
        durationTicks = note.durationTicks * 2;
        break;
      case "diminish":
        startTick = scaleTickFromAnchor(
          note.startTick,
          selectionStartTick,
          0.5,
        );
        durationTicks = Math.max(
          1,
          Math.round(note.durationTicks * 0.5),
        );
        break;
      default:
        assertNever(kind);
    }

    assertTransformedNoteBounds(
      pitch,
      startTick,
      durationTicks,
      projectDurationTicks,
    );

    transformedNotes.push({
      ...note,
      pitch,
      startTick,
      durationTicks,
    });
  }

  return transformedNotes;
}

function findFirstNote(notes: readonly Note[]): Note {
  let firstNote = notes[0];

  if (firstNote === undefined) {
    throw new SelectionTransformationError(
      "The note selection is empty.",
    );
  }

  for (
    let noteIndex = 1;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const candidate = notes[noteIndex];

    if (
      candidate !== undefined
      && (
        candidate.startTick < firstNote.startTick
        || (
          candidate.startTick === firstNote.startTick
          && candidate.pitch < firstNote.pitch
        )
        || (
          candidate.startTick === firstNote.startTick
          && candidate.pitch === firstNote.pitch
          && candidate.id < firstNote.id
        )
      )
    ) {
      firstNote = candidate;
    }
  }

  return firstNote;
}

function findSelectionStartTick(notes: readonly Note[]): Tick {
  let startTick = Number.POSITIVE_INFINITY;

  for (const note of notes) {
    if (note.startTick < startTick) {
      startTick = note.startTick;
    }
  }

  return startTick;
}

function findSelectionEndTick(notes: readonly Note[]): Tick {
  let endTick = 0;

  for (const note of notes) {
    const noteEndTick = note.startTick + note.durationTicks;

    if (noteEndTick > endTick) {
      endTick = noteEndTick;
    }
  }

  return endTick;
}

function scaleTickFromAnchor(
  tick: Tick,
  anchorTick: Tick,
  factor: number,
): Tick {
  return anchorTick + Math.round((tick - anchorTick) * factor);
}

function assertTransformedNoteBounds(
  pitch: number,
  startTick: Tick,
  durationTicks: Tick,
  projectDurationTicks: Tick,
): void {
  if (pitch < 0 || pitch > 127) {
    throw new SelectionTransformationError(
      "The transformation would place a note outside the MIDI pitch range.",
    );
  }

  if (
    !Number.isSafeInteger(startTick)
    || !Number.isSafeInteger(durationTicks)
    || startTick < 0
    || durationTicks <= 0
    || startTick + durationTicks > projectDurationTicks
  ) {
    throw new SelectionTransformationError(
      "The transformation would place a note outside the clip timeline.",
    );
  }
}

function assertNever(value: never): never {
  throw new SelectionTransformationError(
    `Unsupported selection transformation: ${String(value)}.`,
  );
}
