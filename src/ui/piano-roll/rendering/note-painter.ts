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
import { isNoteEditable } from "../../../domain/notes/note";
import { getNoteBodyOpacity, getNoteContentOpacity } from "./note-opacity";
import {
  compareNotesByInstrumentRenderOrder,
  compareNotesByPitchRenderOrder,
  getNoteFillStyle,
} from "./note-style";
import {
  type TimeMap,
} from "../../../domain/transport/time-map";
import { getMidiNoteLabelSegments } from "./pitch-label";
import { resolvePitchSnapSettings } from "../../../use-cases/piano-roll/timeline/pitch-snap-resolution";

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
  readonly globalPitchSnapSettings: PitchSnapSettings;
  readonly timeMap: TimeMap;
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
    globalPitchSnapSettings,
    timeMap,
  } = snapshot;

  visibleNotes.sort(
    colorMode === "instrument"
      ? (a, b) => compareNotesByInstrumentRenderOrder(a, b, instrumentOrder)
      : (a, b) => compareNotesByPitchRenderOrder(a, b, instrumentOrder),
  );

  let currentInstrumentId: InstrumentId | null = null;
  let currentOpacity = -1;
  let hasVisibleLockedNote = false;

  for (const note of visibleNotes) {
    if (editingNoteIds.has(note.id)) {
      continue;
    }

    const instrumentStyle = stylesByInstrumentId[note.instrumentId];

    const noteSnapSettings = resolvePitchSnapSettings(
      timeMap,
      globalPitchSnapSettings,
      note.startTick,
    );

    if (
      colorMode === "instrument"
    ) {
      if (note.instrumentId !== currentInstrumentId) {
        context.fillStyle = getNoteFillStyle(
          note,
          stylesByInstrumentId,
          colorMode,
          noteSnapSettings,
        );
        currentInstrumentId = note.instrumentId;
      }
    } else {
      context.fillStyle = getNoteFillStyle(
        note,
        stylesByInstrumentId,
        colorMode,
        noteSnapSettings,
      );
    }

    const opacity =
      (instrumentStyle?.opacity ?? 1) * getNoteBodyOpacity(note);

    if (!isNoteEditable(note)) {
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
    const previousCompositeOperation =
      context.globalCompositeOperation || "source-over";

    // Preserve the alpha already painted for muted/disabled notes. The hatch
    // changes their pixels but does not add a second opacity layer.
    context.globalCompositeOperation = "source-atop";
    context.fillStyle = lockedPattern;

    for (const note of visibleNotes) {
      if (editingNoteIds.has(note.id)) {
        continue;
      }

      const instrumentStyle = stylesByInstrumentId[note.instrumentId];

      if (isNoteEditable(note)) {
        continue;
      }

      context.globalAlpha = Math.min(1, (instrumentStyle?.opacity ?? 1) * 0.68);
      fillNoteRect(context, converter, note);
    }

    context.globalCompositeOperation = previousCompositeOperation;
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
    timeMap,
    globalPitchSnapSettings,
  } = snapshot;

  context.fillStyle = NOTE_LABEL_COLOR;
  context.font =
    `600 ${NOTE_LABEL_FONT_SIZE}px `
    + '"SFMono-Regular", Consolas, monospace';
  context.textAlign = "left";
  context.textBaseline = "middle";

  for (const note of visibleNotes) {
    if (editingNoteIds.has(note.id)) {
      continue;
    }

    const y = converter.pitchToCssPixelY(note.pitch);
    const nextRowY = converter.pitchToCssPixelY(note.pitch - 1);
    const height = Math.max(1, nextRowY - y - 1);

    if (height < NOTE_LABEL_MINIMUM_HEIGHT) {
      continue;
    }

    const instrumentStyle = stylesByInstrumentId[note.instrumentId];

    context.globalAlpha =
      (instrumentStyle?.opacity ?? 1) * getNoteContentOpacity(note);

    for (
      const segment of getMidiNoteLabelSegments(
        note.pitch,
        note.startTick,
        note.startTick + note.durationTicks,
        timeMap.scaleMarkers,
        (tick) => resolvePitchSnapSettings(
          timeMap,
          globalPitchSnapSettings,
          tick,
        ),
      )
    ) {
      const startX = Math.max(
        0,
        converter.tickToCssPixelX(segment.startTick),
      );
      const endX = converter.tickToCssPixelX(segment.endTick);
      const labelWidth = context.measureText(segment.label).width;

      if (
        segment.label.length === 0
        || endX - startX
          < labelWidth + NOTE_LABEL_HORIZONTAL_PADDING * 2
      ) {
        continue;
      }

      context.fillText(
        segment.label,
        startX + NOTE_LABEL_HORIZONTAL_PADDING,
        y + height / 2,
      );
    }
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
