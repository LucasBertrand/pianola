import {
  MAX_MIDI_PITCH,
  MIN_MIDI_PITCH,
} from "../../../editor/geometry/converter";
import type {
  PitchSnapSettings,
} from "../../../music/pitch-snap";
import {
  getMidiNoteLabel,
  getPitchLabelContextKey,
} from "./pitch-label";

interface NoteLabelWidthCache {
  readonly contextKey: string;
  readonly widths: Float32Array;
}

const noteLabelWidthCaches =
  new WeakMap<CanvasRenderingContext2D, NoteLabelWidthCache>();

export function getNoteLabelWidths(
  context: CanvasRenderingContext2D,
  settings: PitchSnapSettings,
): Float32Array {
  const contextKey = getPitchLabelContextKey(settings);
  const cached = noteLabelWidthCaches.get(context);

  if (cached?.contextKey === contextKey) {
    return cached.widths;
  }

  const widths = new Float32Array(MAX_MIDI_PITCH + 1);

  for (
    let pitch = MIN_MIDI_PITCH;
    pitch <= MAX_MIDI_PITCH;
    pitch += 1
  ) {
    widths[pitch] = context.measureText(
      getMidiNoteLabel(pitch, settings),
    ).width;
  }

  noteLabelWidthCaches.set(context, { contextKey, widths });
  return widths;
}
