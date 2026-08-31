import type {
  ResizeEdge,
} from "./gesture-draft";

const ANCHOR_HEIGHT_RATIO = 0.68;
const MINIMUM_ANCHOR_SIZE_CSS_PIXELS = 8;
const MAXIMUM_ANCHOR_SIZE_CSS_PIXELS = 13;
const ANCHOR_WIDTH_CSS_PIXELS = 5;
const INTERIOR_HIT_SLOP_CSS_PIXELS = 6;

export interface NoteResizeAnchorRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export function getNoteResizeAnchorSize(noteHeight: number): number {
  return Math.min(
    MAXIMUM_ANCHOR_SIZE_CSS_PIXELS,
    Math.max(
      MINIMUM_ANCHOR_SIZE_CSS_PIXELS,
      noteHeight * ANCHOR_HEIGHT_RATIO,
    ),
  );
}

export function getNoteResizeAnchorWidth(): number {
  return ANCHOR_WIDTH_CSS_PIXELS;
}

/**
 * Returns the pointer target for an external resize anchor. The visible handle
 * stays outside the note while this target keeps a small interior hit slop.
 */
export function getNoteResizeAnchorHitRect(
  edge: ResizeEdge,
  noteLeft: number,
  noteRight: number,
  noteTop: number,
  noteHeight: number,
): NoteResizeAnchorRect {
  const anchorSize = getNoteResizeAnchorSize(noteHeight);
  const anchorWidth = getNoteResizeAnchorWidth();
  const top = noteTop + (noteHeight - anchorSize) / 2;

  return edge === "start"
    ? {
        left: noteLeft - anchorWidth,
        right: noteLeft + INTERIOR_HIT_SLOP_CSS_PIXELS,
        top,
        bottom: top + anchorSize,
      }
    : {
        left: noteRight - INTERIOR_HIT_SLOP_CSS_PIXELS,
        right: noteRight + anchorWidth,
        top,
        bottom: top + anchorSize,
      };
}
