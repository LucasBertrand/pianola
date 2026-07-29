import type {
  Note,
  VoiceId,
} from "../../domain/model";

export interface VoiceRenderStyle {
  readonly fillStyle: string;
  readonly opacity: number;
  readonly locked: boolean;
}

export type NoteColorMode = "voice" | "pitch";

const DEFAULT_NOTE_COLOR = "#6ea8fe";
const PITCH_CLASS_NOTE_COLORS = [
  "#ef5c65",
  "#f07c5d",
  "#eaa64f",
  "#d3c958",
  "#8bcf63",
  "#55c89e",
  "#4bc2d1",
  "#5797ea",
  "#7775e8",
  "#a66fdc",
  "#d56dbc",
  "#ea6f8d",
] as const;

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
): string {
  return colorMode === "pitch"
    ? getPitchNoteColor(note.pitch)
    : stylesByVoiceId[note.voiceId]?.fillStyle
      ?? DEFAULT_NOTE_COLOR;
}

export function getPitchNoteColor(pitch: number): string {
  const pitchClass = ((pitch % 12) + 12) % 12;

  return PITCH_CLASS_NOTE_COLORS[pitchClass]
    ?? DEFAULT_NOTE_COLOR;
}
