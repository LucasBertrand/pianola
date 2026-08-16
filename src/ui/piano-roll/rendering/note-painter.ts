import {
  RENDERING_CONSTANTS,
} from "../../../config/rendering-config";
import {
  type InstrumentId,
  type NoteId,
} from "../../../domain/identifiers";
import {
  type Note,
} from "../../../domain/notes/note";
import type {
  InstrumentRenderStyle,
} from "../../../editor/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../../../editor/model/note-color-mode";
import type {
  CoordinateConverter,
} from "../../../editor/geometry/converter";
import type {
  PitchSnapSettings,
} from "../../../music/pitch-snap";
import { getLockedNotePattern } from "./locked-note-pattern";
import { getNoteLabelWidths } from "./note-label-cache";
import {
  compareNotesByInstrumentRenderOrder,
  compareNotesByPitchRenderOrder,
  getNoteFillStyle,
} from "./note-style";
import { getMidiNoteLabel } from "./pitch-label";

const NOTE_LABEL_MINIMUM_HEIGHT =
  RENDERING_CONSTANTS.noteLabelMinimumHeightCssPixels;
const NOTE_LABEL_HORIZONTAL_PADDING =
  RENDERING_CONSTANTS.noteLabelHorizontalPaddingCssPixels;
const NOTE_LABEL_FONT_SIZE =
  RENDERING_CONSTANTS.noteLabelFontSizeCssPixels;
const NOTE_LABEL_COLOR =
  RENDERING_CONSTANTS.noteLabelColor;

/** A pre-culled note projection ready for deterministic Canvas painting. */
export interface NotePaintSnapshot {
  readonly context: CanvasRenderingContext2D;
  readonly converter: CoordinateConverter;
  readonly visibleNotes: Note[];
  readonly editingNoteIds: ReadonlySet<NoteId>;
  readonly stylesByInstrumentId: Readonly<
    Record<InstrumentId, InstrumentRenderStyle>
  >;
  readonly instrumentOrder: readonly InstrumentId[];
  readonly colorMode: NoteColorMode;
  readonly pitchLabelSettings: PitchSnapSettings;
}

export function paintNotes(snapshot: NotePaintSnapshot): void {
  const {
    context,
    converter,
    visibleNotes,
    editingNoteIds,
    stylesByInstrumentId,
    instrumentOrder,
    colorMode,
    pitchLabelSettings,
  } = snapshot;

  visibleNotes.sort(
    colorMode === "instrument"
      ? (a, b) => compareNotesByInstrumentRenderOrder(a, b, instrumentOrder)
      : (a, b) => compareNotesByPitchRenderOrder(a, b, instrumentOrder),
  );

  let currentInstrumentId: InstrumentId | null = null;
  let currentPitch = -1;
  let currentOpacity = -1;
  let hasVisibleLockedNote = false;

  for (const note of visibleNotes) {
    if (editingNoteIds.has(note.id)) {
      continue;
    }

    const instrumentStyle = stylesByInstrumentId[note.instrumentId];

    if (
      (colorMode === "instrument" && note.instrumentId !== currentInstrumentId)
      || (colorMode === "pitch" && note.pitch !== currentPitch)
    ) {
      context.fillStyle = getNoteFillStyle(
        note,
        stylesByInstrumentId,
        colorMode,
        pitchLabelSettings,
      );
      currentInstrumentId = note.instrumentId;
      currentPitch = note.pitch;
    }

    const opacity =
      (instrumentStyle?.opacity ?? 1) * (note.enabled ? 0.55 : 0.25);

    if (instrumentStyle?.locked === true) {
      hasVisibleLockedNote = true;
    }

    if (opacity !== currentOpacity) {
      context.globalAlpha = opacity;
      currentOpacity = opacity;
    }

    fillNoteRect(context, converter, note);
  }

  const lockedPattern = hasVisibleLockedNote
    ? getLockedNotePattern(context)
    : null;

  if (lockedPattern !== null) {
    context.fillStyle = lockedPattern;

    for (const note of visibleNotes) {
      if (editingNoteIds.has(note.id)) {
        continue;
      }

      const instrumentStyle = stylesByInstrumentId[note.instrumentId];

      if (instrumentStyle?.locked !== true) {
        continue;
      }

      context.globalAlpha = Math.min(1, instrumentStyle.opacity * 0.68);
      fillNoteRect(context, converter, note);
    }
  }

  paintNoteLabels(snapshot);
  context.globalAlpha = 1;
}

function paintNoteLabels(snapshot: NotePaintSnapshot): void {
  const {
    context,
    converter,
    visibleNotes,
    editingNoteIds,
    stylesByInstrumentId,
    pitchLabelSettings,
  } = snapshot;

  context.fillStyle = NOTE_LABEL_COLOR;
  context.font =
    `600 ${NOTE_LABEL_FONT_SIZE}px `
    + '"SFMono-Regular", Consolas, monospace';
  context.textAlign = "left";
  context.textBaseline = "middle";
  const noteLabelWidths = getNoteLabelWidths(context, pitchLabelSettings);

  for (const note of visibleNotes) {
    if (editingNoteIds.has(note.id)) {
      continue;
    }

    const x = converter.tickToCssPixelX(note.startTick);
    const endX = converter.tickToCssPixelX(
      note.startTick + note.durationTicks,
    );
    const y = converter.pitchToCssPixelY(note.pitch);
    const nextRowY = converter.pitchToCssPixelY(note.pitch - 1);
    const width = Math.max(1, endX - x - 1);
    const height = Math.max(1, nextRowY - y - 1);
    const label = getMidiNoteLabel(note.pitch, pitchLabelSettings);
    const labelWidth = noteLabelWidths[note.pitch] ?? 0;

    if (
      label.length === 0
      || width < labelWidth + NOTE_LABEL_HORIZONTAL_PADDING * 2
      || height < NOTE_LABEL_MINIMUM_HEIGHT
    ) {
      continue;
    }

    const instrumentStyle = stylesByInstrumentId[note.instrumentId];

    context.globalAlpha =
      (instrumentStyle?.opacity ?? 1) * (note.enabled ? 1 : 0.36);
    context.fillText(
      label,
      x + NOTE_LABEL_HORIZONTAL_PADDING,
      y + height / 2,
    );
  }
}

function fillNoteRect(
  context: CanvasRenderingContext2D,
  converter: CoordinateConverter,
  note: Note,
): void {
  const x = converter.tickToCssPixelX(note.startTick);
  const endX = converter.tickToCssPixelX(
    note.startTick + note.durationTicks,
  );
  const y = converter.pitchToCssPixelY(note.pitch);
  const nextRowY = converter.pitchToCssPixelY(note.pitch - 1);

  const width = Math.max(1, endX - x - 1);
  const height = Math.max(1, nextRowY - y - 1);

  // Fill
  context.fillRect(x, y, width, height);

  // Border (opaque)
  const previousAlpha = context.globalAlpha;
  context.globalAlpha = Math.min(1, previousAlpha + 0.4);
  
  // Use a slightly darker color for the border if possible, or just the same color. 
  // We can just stroke with the same fillStyle since alpha is higher.
  context.lineWidth = 1;
  context.strokeStyle = context.fillStyle;
  context.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
  
  context.globalAlpha = previousAlpha;
}
