import {
  type Note,
} from "../../../domain/notes/note";
import {
  type InstrumentId,
} from "../../../domain/identifiers";
import type {
  NoteColorMode,
} from "../../../editor/model/note-color-mode";
import type {
  InstrumentRenderStyle,
} from "../../../editor/model/instrument-render-style";
import {
  APPLICATION_COLORS,
} from "../../../config/application-colors";
import {
  getPitchScaleDegreeColorIndex,
  type PitchSnapSettings,
} from "../../../music/pitch-snap";

const DEFAULT_NOTE_COLOR =
  APPLICATION_COLORS.notes.default;

export function compareNotesByInstrumentRenderOrder(
  left: Note,
  right: Note,
  instrumentOrder?: readonly InstrumentId[],
): number {
  if (instrumentOrder !== undefined) {
    const leftIndex = instrumentOrder.indexOf(left.instrumentId);
    const rightIndex = instrumentOrder.indexOf(right.instrumentId);

    if (leftIndex !== rightIndex) {
      // Reverse order: first instrument (index 0) should be drawn on top (last)
      return rightIndex - leftIndex;
    }
  } else {
    if (left.instrumentId < right.instrumentId) {
      return -1;
    }

    if (left.instrumentId > right.instrumentId) {
      return 1;
    }
  }

  const startDifference = left.startTick - right.startTick;

  if (startDifference !== 0) {
    return startDifference;
  }

  if (left.id < right.id) {
    return -1;
  }

  if (left.id > right.id) {
    return 1;
  }

  return 0;
}

export function compareNotesByPitchRenderOrder(
  left: Note,
  right: Note,
  instrumentOrder?: readonly InstrumentId[],
): number {
  if (left.pitch !== right.pitch) {
    return left.pitch - right.pitch;
  }

  return compareNotesByInstrumentRenderOrder(left, right, instrumentOrder);
}

export function getNoteFillStyle(
  note: Note,
  stylesByInstrumentId: Readonly<Record<InstrumentId, InstrumentRenderStyle>>,
  colorMode: NoteColorMode,
  pitchSnapSettings: PitchSnapSettings,
): string {
  return colorMode === "pitch"
    ? getPitchNoteColor(note.pitch, pitchSnapSettings)
    : stylesByInstrumentId[note.instrumentId]?.fillStyle
    ?? DEFAULT_NOTE_COLOR;
}

export function getPitchNoteColor(
  pitch: number,
  pitchSnapSettings: PitchSnapSettings,
): string {
  const degreeColorIndex = getPitchScaleDegreeColorIndex(
    pitch,
    pitchSnapSettings,
  );

  if (degreeColorIndex === null) {
    return APPLICATION_COLORS.notes.outOfScale;
  }

  const pitchClass = ((pitch % 12) + 12) % 12;

  return APPLICATION_COLORS.notes.pitchClassPalette[pitchClass]
    ?? DEFAULT_NOTE_COLOR;
}
