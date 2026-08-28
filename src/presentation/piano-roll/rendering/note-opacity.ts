import { isNoteAudible, type Note } from "../../../domain/notes/note";
import type { InstrumentRenderStyle } from "../../../editor-core/model/instrument-render-style";

const ACTIVE_NOTE_OPACITY = 1;
const MUTED_NOTE_OPACITY = 0.16;

/** 
 * Returns the final opacity for a note. 
 * A note is dimmed if it is muted or if its parent instrument is muted.
 */
export function getNoteOpacity(
  note: Pick<Note, "muted">,
  instrumentStyle?: Pick<InstrumentRenderStyle, "opacity">
): number {
  const isInstrumentMuted = (instrumentStyle?.opacity ?? 1) < 1;
  
  return (isInstrumentMuted || !isNoteAudible(note))
    ? MUTED_NOTE_OPACITY
    : ACTIVE_NOTE_OPACITY;
}
