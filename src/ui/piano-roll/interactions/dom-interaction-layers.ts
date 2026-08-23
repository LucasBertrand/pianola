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
import {
  resolveRepositionedPitch,
} from "../../../editor/interactions/gestures/note-gesture-math";
import type {
  InstrumentRenderStyle,
} from "../../../editor/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../../../editor/model/note-color-mode";
import type {
  PitchSnapSettings,
} from "../../../music/pitch-snap";
import {
  getNoteFillStyle,
  getPitchNoteColor,
} from "../rendering/note-style";
import {
  getMidiNoteLabelSegments,
  type TonalBoundary,
} from "../rendering/pitch-label";

export interface LayerGeometry {
  readonly left: Float64Array;
  readonly width: Float64Array;
  readonly pitch: Int16Array;
  readonly startTick: Int32Array;
  readonly durationTicks: Int32Array;
}

export interface GhostNoteLabelLayout {
  readonly label: string;
  readonly leftCssPixels: number;
  readonly widthCssPixels: number;
}

export function populateGhostLayer(
  ghostLayer: HTMLDivElement | null,
  notes: readonly Note[],
  converter: CoordinateConverter,
  stylesByInstrumentId: Readonly<Record<InstrumentId, InstrumentRenderStyle>>,
  colorMode: NoteColorMode,
  getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
  resizeEdge: ResizeEdge | null,
  elements: HTMLElement[],
  tonalBoundaries: readonly TonalBoundary[] = [],
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
  const durationTicks = new Int32Array(notes.length);
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
    const noteSnapSettings = getSnapSettingsAtTick(note.startTick);

    const fillStyle = getNoteFillStyle(
      note,
      stylesByInstrumentId,
      colorMode,
      noteSnapSettings,
    );
    element.style.setProperty("--note-color", fillStyle);
    element.style.background = fillStyle;
    element.style.opacity = String(
      (stylesByInstrumentId[note.instrumentId]?.opacity ?? 1)
      * (note.enabled ? 1 : 0.36),
    );
    renderGhostNoteLabels(
      element,
      getGhostNoteLabelLayout(
        note.pitch,
        note.startTick,
        note.durationTicks,
        x,
        noteWidth,
        tonalBoundaries,
        getSnapSettingsAtTick,
      ),
    );
    const geometryIndex = elements.length;

    elements.push(element);
    fragment.appendChild(element);
    left[geometryIndex] = x;
    width[geometryIndex] = noteWidth;
    pitch[geometryIndex] = note.pitch;
    startTick[geometryIndex] = note.startTick;
    durationTicks[geometryIndex] = note.durationTicks;
  }

  ghostLayer.appendChild(fragment);

  return { left, width, pitch, startTick, durationTicks };
}

export function populateSelectionLayer(
  selectionLayer: HTMLDivElement | null,
  notes: readonly Note[],
  converter: CoordinateConverter,
  elements: HTMLElement[],
  getNoteColor: (note: Note) => string,
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
  const durationTicks = new Int32Array(notes.length);
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
    element.style.setProperty("--note-color", getNoteColor(note));
    const geometryIndex = elements.length;

    elements.push(element);
    fragment.appendChild(element);
    left[geometryIndex] = x;
    width[geometryIndex] = noteWidth;
    pitch[geometryIndex] = note.pitch;
    startTick[geometryIndex] = note.startTick;
    durationTicks[geometryIndex] = note.durationTicks;
  }

  selectionLayer.appendChild(fragment);

  return { left, width, pitch, startTick, durationTicks };
}

export function clearSelectionLayer(
  selectionLayer: HTMLDivElement | null,
): void {
  selectionLayer?.replaceChildren();
}

export function updateGhostPitchPresentation(
  elements: readonly HTMLElement[],
  geometry: LayerGeometry | null,
  deltaPitch: number,
  deltaTicks: number,
  deltaXCssPixels: number,
  getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
  tonalBoundaries: readonly TonalBoundary[],
  updatePitchColor: boolean,
): void {
  if (geometry === null) {
    return;
  }

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const basePitch = geometry.pitch[index];
    const baseTick = geometry.startTick[index];
    const durationTicks = geometry.durationTicks[index];
    const left = geometry.left[index];
    const width = geometry.width[index];

    if (
      element === undefined
      || basePitch === undefined
      || baseTick === undefined
      || durationTicks === undefined
      || left === undefined
      || width === undefined
    ) {
      continue;
    }

    const pitch = basePitch + deltaPitch;
    const destinationTick = Math.max(0, baseTick + deltaTicks);
    const snapSettings = getSnapSettingsAtTick(destinationTick);

    renderGhostNoteLabels(
      element,
      getGhostNoteLabelLayout(
        pitch,
        destinationTick,
        durationTicks,
        left + deltaXCssPixels,
        width,
        tonalBoundaries,
        getSnapSettingsAtTick,
      ),
    );

    if (updatePitchColor) {
      const color = getPitchNoteColor(
        pitch,
        snapSettings,
      );

      element.style.setProperty("--note-color", color);
      element.style.background = color;
    }
  }
}

export function updatePitchSnappedDrag(
  elements: readonly HTMLElement[],
  geometry: LayerGeometry | null,
  deltaXCssPixels: number,
  pitchStepCssPixels: number,
  deltaTicks: number,
  deltaPitch: number,
  getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
  tonalBoundaries: readonly TonalBoundary[],
  updatePitchLabel: boolean,
  updatePitchColor: boolean,
): void {
  if (geometry === null) {
    return;
  }

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const basePitch = geometry.pitch[index];
    const baseTick = geometry.startTick[index];
    const durationTicks = geometry.durationTicks[index];
    const left = geometry.left[index];
    const width = geometry.width[index];

    if (
      element === undefined
      || basePitch === undefined
      || baseTick === undefined
      || durationTicks === undefined
      || left === undefined
      || width === undefined
    ) {
      continue;
    }

    const repositionedPitch = resolveRepositionedPitch(
      basePitch,
      baseTick,
      deltaTicks,
      deltaPitch,
      getSnapSettingsAtTick,
    );
    const {
      destinationTick,
      pitch: snappedPitch,
      snapSettings,
    } = repositionedPitch;
    const deltaYCssPixels =
      -(snappedPitch - basePitch) * pitchStepCssPixels;

    element.style.transform =
      `translate3d(${deltaXCssPixels}px, ${deltaYCssPixels}px, 0)`;

    if (updatePitchLabel) {
      renderGhostNoteLabels(
        element,
        getGhostNoteLabelLayout(
          snappedPitch,
          destinationTick,
          durationTicks,
          left + deltaXCssPixels,
          width,
          tonalBoundaries,
          getSnapSettingsAtTick,
        ),
      );
    }

    if (updatePitchColor) {
      const color = getPitchNoteColor(
        snappedPitch,
        snapSettings,
      );

      element.style.setProperty("--note-color", color);
      element.style.background = color;
    }
  }
}

export function getGhostNoteLabelLayout(
  pitch: number,
  startTick: number,
  durationTicks: number,
  noteLeftCssPixels: number,
  noteWidthCssPixels: number,
  tonalBoundaries: readonly TonalBoundary[],
  getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
): readonly GhostNoteLabelLayout[] {
  if (durationTicks <= 0 || noteWidthCssPixels <= 0) {
    return [];
  }

  const visibleNoteLeftCssPixels = Math.max(0, -noteLeftCssPixels);
  const pixelsPerTick = noteWidthCssPixels / durationTicks;
  const endTick = startTick + durationTicks;

  return getMidiNoteLabelSegments(
    pitch,
    startTick,
    endTick,
    tonalBoundaries,
    getSnapSettingsAtTick,
  ).flatMap((segment) => {
    const segmentLeftCssPixels =
      (segment.startTick - startTick) * pixelsPerTick;
    const segmentEndCssPixels =
      (segment.endTick - startTick) * pixelsPerTick;
    const labelLeftCssPixels = Math.max(
      segmentLeftCssPixels,
      visibleNoteLeftCssPixels,
    );
    const labelWidthCssPixels =
      segmentEndCssPixels - labelLeftCssPixels;

    return labelWidthCssPixels <= 0
      ? []
      : [{
          label: segment.label,
          leftCssPixels: labelLeftCssPixels,
          widthCssPixels: labelWidthCssPixels,
        }];
  });
}

function renderGhostNoteLabels(
  element: HTMLElement,
  layouts: readonly GhostNoteLabelLayout[],
): void {
  for (let index = 0; index < layouts.length; index += 1) {
    const layout = layouts[index];

    if (layout === undefined) {
      continue;
    }

    let labelElement = element.children.item(index) as HTMLElement | null;

    if (labelElement === null) {
      labelElement = element.ownerDocument.createElement("span");
      labelElement.className = "interaction-note-label";
      element.appendChild(labelElement);
    }

    labelElement.textContent = layout.label;
    labelElement.style.left = `${layout.leftCssPixels}px`;
    labelElement.style.width = `${layout.widthCssPixels}px`;
  }

  while (element.children.length > layouts.length) {
    element.lastElementChild?.remove();
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
