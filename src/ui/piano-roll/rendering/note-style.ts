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
): number {
  if (left.instrumentId < right.instrumentId) {
    return -1;
  }

  if (left.instrumentId > right.instrumentId) {
    return 1;
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
): number {
  if (left.pitch !== right.pitch) {
    return left.pitch - right.pitch;
  }

  return compareNotesByInstrumentRenderOrder(left, right);
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

  return degreeColorIndex === null
    ? APPLICATION_COLORS.notes.outOfScale
    : APPLICATION_COLORS.pianoRoll.degreeAccents[
        degreeColorIndex
      ] ?? DEFAULT_NOTE_COLOR;
}
