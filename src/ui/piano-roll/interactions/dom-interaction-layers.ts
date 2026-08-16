import type {
  InstrumentId,
} from "../../../domain/identifiers";
import type {
  Note,
} from "../../../domain/notes/note";
import type {
  CoordinateConverter,
} from "../../../editor/geometry/converter";
import type {
  ResizeEdge,
} from "../../../editor/interactions/gestures/gesture-draft";
import type {
  InstrumentRenderStyle,
} from "../../../editor/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../../../editor/model/note-color-mode";
import {
  snapPitchToTonalPattern,
  type PitchSnapSettings,
} from "../../../music/pitch-snap";
import {
  getNoteFillStyle,
  getPitchNoteColor,
} from "../rendering/note-style";
import {
  getMidiNoteLabel,
} from "../rendering/pitch-label";

export interface LayerGeometry {
  readonly left: Float64Array;
  readonly width: Float64Array;
  readonly pitch: Int16Array;
  readonly startTick: Int32Array;
}
export function populateGhostLayer(
  ghostLayer: HTMLDivElement | null,
  notes: readonly Note[],
  converter: CoordinateConverter,
  stylesByInstrumentId: Readonly<Record<InstrumentId, InstrumentRenderStyle>>,
  colorMode: NoteColorMode,
  pitchSnapSettings: PitchSnapSettings,
  resizeEdge: ResizeEdge | null,
  elements: HTMLElement[],
): LayerGeometry | null {
  if (ghostLayer === null) {
    return null;
  }

  ghostLayer.replaceChildren();
  ghostLayer.style.transform = "translate3d(0, 0, 0)";
  elements.length = 0;
  const left = new Float64Array(notes.length);
  const width = new Float64Array(notes.length);
  const pitch = new Int16Array(notes.length);
  const startTick = new Int32Array(notes.length);
  const fragment = document.createDocumentFragment();

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    const x = converter.tickToCssPixelX(note.startTick);
    const endX = converter.tickToCssPixelX(
      note.startTick + note.durationTicks,
    );
    const y = converter.pitchToCssPixelY(note.pitch);
    const nextY = converter.pitchToCssPixelY(note.pitch - 1);
    const noteWidth = Math.max(1, endX - x);

    if (
      endX < 0
      || x > ghostLayer.clientWidth
      || nextY < 0
      || y > ghostLayer.clientHeight
    ) {
      continue;
    }

    const element = document.createElement("div");

    element.className =
      resizeEdge === null
        ? "interaction-note-ghost"
        : `interaction-note-ghost is-resizing-${resizeEdge}`;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.width = `${noteWidth}px`;
    element.style.height = `${Math.max(1, nextY - y - 1)}px`;
    element.style.background = getNoteFillStyle(
      note,
      stylesByInstrumentId,
      colorMode,
      pitchSnapSettings,
    );
    element.style.opacity = String(
      (stylesByInstrumentId[note.instrumentId]?.opacity ?? 1)
      * (note.enabled ? 1 : 0.36),
    );
    element.textContent = getMidiNoteLabel(
      note.pitch,
      pitchSnapSettings,
    );
    elements.push(element);
    fragment.appendChild(element);
    left[noteIndex] = x;
    width[noteIndex] = noteWidth;
    pitch[noteIndex] = note.pitch;
    startTick[noteIndex] = note.startTick;
  }

  ghostLayer.appendChild(fragment);

  return { left, width, pitch, startTick };
}

export function populateSelectionLayer(
  selectionLayer: HTMLDivElement | null,
  notes: readonly Note[],
  converter: CoordinateConverter,
  elements: HTMLElement[],
): LayerGeometry | null {
  if (selectionLayer === null) {
    return null;
  }

  selectionLayer.replaceChildren();
  selectionLayer.style.transform = "translate3d(0, 0, 0)";
  elements.length = 0;
  const left = new Float64Array(notes.length);
  const width = new Float64Array(notes.length);
  const pitch = new Int16Array(notes.length);
  const startTick = new Int32Array(notes.length);
  const fragment = document.createDocumentFragment();

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    const x = converter.tickToCssPixelX(note.startTick);
    const endX = converter.tickToCssPixelX(
      note.startTick + note.durationTicks,
    );
    const y = converter.pitchToCssPixelY(note.pitch);
    const nextY = converter.pitchToCssPixelY(note.pitch - 1);

    if (
      endX < 0
      || x > selectionLayer.clientWidth
      || nextY < 0
      || y > selectionLayer.clientHeight
    ) {
      continue;
    }

    const element = document.createElement("div");
    const noteWidth = Math.max(1, endX - x);

    element.className = "interaction-note-selection";
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.width = `${noteWidth}px`;
    element.style.height = `${Math.max(1, nextY - y - 1)}px`;
    elements.push(element);
    fragment.appendChild(element);
    left[noteIndex] = x;
    width[noteIndex] = noteWidth;
    pitch[noteIndex] = note.pitch;
    startTick[noteIndex] = note.startTick;
  }

  selectionLayer.appendChild(fragment);

  return { left, width, pitch, startTick };
}

export function updateGhostPitchPresentation(
  elements: readonly HTMLElement[],
  basePitches: Int16Array | null,
  deltaPitch: number,
  pitchSnapSettings: PitchSnapSettings,
  updatePitchColor: boolean,
): void {
  if (basePitches === null) {
    return;
  }

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const basePitch = basePitches[index];

    if (element === undefined || basePitch === undefined) {
      continue;
    }

    const pitch = basePitch + deltaPitch;

    element.textContent = getMidiNoteLabel(pitch, pitchSnapSettings);

    if (updatePitchColor) {
      element.style.background = getPitchNoteColor(
        pitch,
        pitchSnapSettings,
      );
    }
  }
}

export function updatePitchSnappedDrag(
  elements: readonly HTMLElement[],
  basePitches: Int16Array | null,
  baseTicks: Int32Array | null,
  deltaXCssPixels: number,
  pitchStepCssPixels: number,
  deltaTicks: number,
  deltaPitch: number,
  getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
  updatePitchLabel: boolean,
  updatePitchColor: boolean,
): void {
  if (basePitches === null) {
    return;
  }

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const basePitch = basePitches[index];
    const baseTick = baseTicks?.[index];

    if (element === undefined || basePitch === undefined || baseTick === undefined) {
      continue;
    }

    const destinationTick = Math.max(0, baseTick + deltaTicks);
    const snapSettings = getSnapSettingsAtTick(destinationTick);
    const snappedPitch =
      deltaPitch === 0
        ? basePitch
        : snapPitchToTonalPattern(
            basePitch + deltaPitch,
            snapSettings,
            deltaPitch,
          );
    const deltaYCssPixels =
      -(snappedPitch - basePitch) * pitchStepCssPixels;

    element.style.transform =
      `translate3d(${deltaXCssPixels}px, ${deltaYCssPixels}px, 0)`;

    if (updatePitchLabel) {
      element.textContent = getMidiNoteLabel(
        snappedPitch,
        snapSettings,
      );
    }

    if (updatePitchColor) {
      element.style.background = getPitchNoteColor(
        snappedPitch,
        pitchSnapSettings,
      );
    }
  }
}

export function updateHorizontalGeometry(
  edge: ResizeEdge,
  deltaXCssPixels: number,
  elements: readonly HTMLElement[],
  geometry: LayerGeometry | null,
): void {
  if (geometry === null) {
    return;
  }

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const left = geometry.left[index];
    const width = geometry.width[index];

    if (
      element === undefined
      || left === undefined
      || width === undefined
    ) {
      continue;
    }

    if (edge === "start") {
      element.style.left = `${left + deltaXCssPixels}px`;
      element.style.width =
        `${Math.max(1, width - deltaXCssPixels)}px`;
    } else {
      element.style.width =
        `${Math.max(1, width + deltaXCssPixels)}px`;
    }
  }
}

export function clearLayer(
  layer: HTMLDivElement | null,
  elements: HTMLElement[],
): void {
  elements.length = 0;

  if (layer !== null) {
    layer.replaceChildren();
    layer.style.transform = "translate3d(0, 0, 0)";
  }
}

export function resetLayerTransform(layer: HTMLElement | null): void {
  if (layer !== null) {
    layer.style.transform = "translate3d(0, 0, 0)";
  }
}
