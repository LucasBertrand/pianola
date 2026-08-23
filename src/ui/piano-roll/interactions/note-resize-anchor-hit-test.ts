import type {
  Note,
} from "../../../domain/notes/note";
import type {
  CoordinateConverter,
} from "../../../editor/geometry/converter";
import type {
  ResizeEdge,
} from "../../../editor/interactions/gestures/gesture-draft";

const ANCHOR_WIDTH_CSS_PIXELS = 4;
const ANCHOR_OUTER_OFFSET_CSS_PIXELS = 6;
const ANCHOR_HEIGHT_RATIO = 0.62;
const MINIMUM_ANCHOR_HEIGHT_CSS_PIXELS = 7;
const MAXIMUM_ANCHOR_HEIGHT_CSS_PIXELS = 12;

/** Matches the visible CSS anchor exactly, including its external offset. */
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
  const anchorHeight = Math.min(
    MAXIMUM_ANCHOR_HEIGHT_CSS_PIXELS,
    Math.max(
      MINIMUM_ANCHOR_HEIGHT_CSS_PIXELS,
      noteHeight * ANCHOR_HEIGHT_RATIO,
    ),
  );
  const anchorTop = noteTop + (noteHeight - anchorHeight) / 2;
  const anchorBottom = anchorTop + anchorHeight;
  const anchorLeft = edge === "start"
    ? noteLeft - ANCHOR_OUTER_OFFSET_CSS_PIXELS
    : noteRight + ANCHOR_OUTER_OFFSET_CSS_PIXELS
      - ANCHOR_WIDTH_CSS_PIXELS;
  const anchorRight = anchorLeft + ANCHOR_WIDTH_CSS_PIXELS;

  return localX >= anchorLeft
    && localX <= anchorRight
    && localY >= anchorTop
    && localY <= anchorBottom;
}
