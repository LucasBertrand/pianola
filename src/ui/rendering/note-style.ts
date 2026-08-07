import type {
  Note,
  VoiceId,
} from "../../domain/model";
import {
  APPLICATION_COLORS,
} from "../../config/application-colors";
import {
  getPitchScaleDegreeColorIndex,
  type PitchSnapSettings,
} from "../../music/pitch-snap";

export interface VoiceRenderStyle {
  readonly fillStyle: string;
  readonly opacity: number;
  readonly locked: boolean;
}

export type NoteColorMode = "voice" | "pitch";

const DEFAULT_NOTE_COLOR =
  APPLICATION_COLORS.notes.default;

export function compareNotesByVoiceRenderOrder(
  left: Note,
  right: Note,
): number {
  if (left.voiceId < right.voiceId) {
    return -1;
  }

  if (left.voiceId > right.voiceId) {
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

  return compareNotesByVoiceRenderOrder(left, right);
}

export function getNoteFillStyle(
  note: Note,
  stylesByVoiceId: Readonly<Record<VoiceId, VoiceRenderStyle>>,
  colorMode: NoteColorMode,
  pitchSnapSettings: PitchSnapSettings,
): string {
  return colorMode === "pitch"
    ? getPitchNoteColor(note.pitch, pitchSnapSettings)
    : stylesByVoiceId[note.voiceId]?.fillStyle
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
