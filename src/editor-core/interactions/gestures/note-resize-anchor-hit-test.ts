import type {
  Note,
} from "../../../domain/notes/note";
import type {
  CoordinateConverter,
} from "../../geometry/converter";
import type {
  ResizeEdge,
} from "./gesture-draft";
import { getNoteResizeAnchorHitRect } from "./note-resize-anchor-geometry";

/** Includes the external visual anchor and its small interior pointer target. */
export function isPointInsideNoteResizeAnchor(
  note: Note,
  edge: ResizeEdge,
  localX: number,
  localY: number,
  converter: CoordinateConverter,
): boolean {
  const noteLeft = converter.tickToCssPixelX(note.startTick);
  const noteRight = converter.tickToCssPixelX(
    note.startTick + note.durationTicks,
  );
  const noteTop = converter.pitchToCssPixelY(note.pitch);
  const noteBottom = converter.pitchToCssPixelY(note.pitch - 1) - 1;
  const noteHeight = Math.max(1, noteBottom - noteTop);
  const anchor = getNoteResizeAnchorHitRect(
    edge,
    noteLeft,
    noteRight,
    noteTop,
    noteHeight,
  );

  return localX >= anchor.left
    && localX <= anchor.right
    && localY >= anchor.top
    && localY <= anchor.bottom;
}
