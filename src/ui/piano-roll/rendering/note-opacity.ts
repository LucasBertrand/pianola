import { isNoteAudible, type Note } from "../../../domain/notes/note";

const ACTIVE_NOTE_BODY_OPACITY = 0.55;
const SILENT_NOTE_BODY_OPACITY = 0.25;
const ACTIVE_NOTE_CONTENT_OPACITY = 1;
const SILENT_NOTE_CONTENT_OPACITY = 0.36;

/** Muted and disabled notes share one attenuation; lock state never stacks it. */
export function getNoteBodyOpacity(note: Pick<Note, "status">): number {
  return isNoteAudible(note)
    ? ACTIVE_NOTE_BODY_OPACITY
    : SILENT_NOTE_BODY_OPACITY;
}

/** Opacity used by labels and transient DOM projections. */
export function getNoteContentOpacity(note: Pick<Note, "status">): number {
  return isNoteAudible(note)
    ? ACTIVE_NOTE_CONTENT_OPACITY
    : SILENT_NOTE_CONTENT_OPACITY;
}
