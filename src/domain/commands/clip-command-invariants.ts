import type { Clip } from "../clips/clip";
import {
  assertValidClipHierarchy,
  type ClipHierarchyNode,
} from "../clips/clip-hierarchy";
import type { Note } from "../notes/note";
import type { NoteId } from "../identifiers";
import type { EditorSessionState } from "../project/project-document";
import { MAXIMUM_CLIP_NAME_LENGTH } from "../clips/clip";
import { MAXIMUM_CLIP_NOTE_COUNT } from "../notes/note";
import { assertValidNoteForInstrumentTrack } from "../validation/note-validation";
import {
  assertValidClipTimeline,
  assertValidTransportState,
} from "../validation/transport-validation";
import type { PianoRollCommand } from "./command-types";
import { notesOverlapInInstrument } from "./active-clip-note-invariants";
import { reject } from "./command-context";

export function assertValidClip(
  state: EditorSessionState,
  clip: Clip,
  commandType: PianoRollCommand["type"],
): void {
  if (
    clip.id.length === 0
    || clip.name.trim().length === 0
    || clip.name.length > MAXIMUM_CLIP_NAME_LENGTH
    || !/^#[0-9a-f]{6}$/i.test(clip.color)
    || typeof clip.bypassEnabled !== "boolean"
  ) {
    reject("INVALID_COMMAND", "Clip identity is invalid.", commandType);
  }

  assertValidClipTimeline(clip.timeline, state.clock);
  assertValidTransportState(clip.transportSettings);
  const durationTicks = clip.timeline.durationTicks;

  const trackIds = Object.keys(clip.tracksByInstrumentId);

  if (
    trackIds.length !== state.instrumentOrder.length
    || trackIds.some(
      (instrumentId) => state.projectInstrumentsById[instrumentId] === undefined,
    )
  ) {
    reject(
      "INVALID_COMMAND",
      `Clip "${clip.id}" must contain exactly one track per project instrument.`,
      commandType,
    );
  }

  if (clip.transportSettings.loop.endTick > durationTicks) {
    reject(
      "INVALID_COMMAND",
      `Clip "${clip.id}" transport exceeds its duration.`,
      commandType,
    );
  }

  const noteIds = new Set<NoteId>();
  let noteCount = 0;

  for (const instrumentId of state.instrumentOrder) {
    const track = clip.tracksByInstrumentId[instrumentId];

    if (track === undefined || track.instrumentId !== instrumentId) {
      reject(
        "INVALID_COMMAND",
        `Clip "${clip.id}" must contain a track for instrument "${instrumentId}".`,
        commandType,
      );
    }

    const notes = Object.values(track.notesById);
    noteCount += notes.length;
    notes.sort(compareNotesForOverlapValidation);

    for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
      const note = notes[noteIndex];

      if (note === undefined) {
        continue;
      }

      assertValidNoteForInstrumentTrack(note, instrumentId);

      if (
        track.notesById[note.id] !== note
        || noteIds.has(note.id)
        || note.startTick + note.durationTicks > durationTicks
      ) {
        reject(
          "INVALID_COMMAND",
          `Clip "${clip.id}" contains an invalid or duplicate note.`,
          commandType,
        );
      }

      const previousNote = notes[noteIndex - 1];

      if (
        previousNote !== undefined
        && notesOverlapInInstrument(previousNote, note)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Clip "${clip.id}" contains overlapping notes.`,
          commandType,
        );
      }

      noteIds.add(note.id);
    }
  }

  if (noteCount > MAXIMUM_CLIP_NOTE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `Clip "${clip.id}" exceeds the note limit.`,
      commandType,
    );
  }
}

export function compareNotesForOverlapValidation(left: Note, right: Note): number {
  return (
    left.pitch - right.pitch
    || left.startTick - right.startTick
    || left.durationTicks - right.durationTicks
    || left.id.localeCompare(right.id)
  );
}

export function assertHierarchy(
  hierarchy: readonly ClipHierarchyNode[],
  state: EditorSessionState,
  commandType: PianoRollCommand["type"],
): void {
  try {
    assertValidClipHierarchy(hierarchy, new Set(Object.keys(state.clipsById)));
  } catch (error: unknown) {
    reject(
      "INVALID_COMMAND",
      error instanceof Error ? error.message : "Clip hierarchy is invalid.",
      commandType,
    );
  }
}

export function isValidInsertionIndex(index: number): boolean {
  return Number.isSafeInteger(index) && index >= 0;
}

export function isHexColor(color: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(color);
}
