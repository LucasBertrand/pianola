import {
  APPLICATION_COLORS,
} from "../../../config/application-colors";
import type {
  Note,
  InstrumentId,
} from "../../../domain/model";
import type {
  CoordinateConverter,
} from "../../../editor/geometry/converter";
import {
  snapPitchToTonalPattern,
  type PitchSnapSettings,
} from "../../../music/pitch-snap";
import type {
  EditingNoteMask,
} from "../../../editor/interactions/editing-note-mask";
import {
  getNoteFillStyle,
  getPitchNoteColor,
} from "../rendering/note-style";
import type {
  InstrumentRenderStyle,
} from "../../../editor/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../../../editor/model/note-color-mode";
import {
  getMidiNoteLabel,
} from "../rendering/pitch-label";
import type {
  ReadonlyRenderSignal,
} from "../../../editor/model/render-signal";
import type {
  InteractionVisualController,
} from "./interaction-visual-controller";
import type {
  ResizeEdge,
} from "../../../editor/interactions/gestures/gesture-draft";

interface LayerGeometry {
  readonly left: Float64Array;
  readonly width: Float64Array;
  readonly pitch: Int16Array;
}

/** DOM renderer for transient ghosts, resize handles, and lasso feedback. */
export class DomInteractionVisualController
  implements InteractionVisualController {
  private ghostLayer: HTMLDivElement | null = null;
  private selectionLayer: HTMLDivElement | null = null;
  private lassoElement: HTMLDivElement | null = null;
  private readonly ghostElements: HTMLElement[] = [];
  private readonly selectionElements: HTMLElement[] = [];
  private ghostGeometry: LayerGeometry | null = null;
  private selectionGeometry: LayerGeometry | null = null;
  private drawGhostElement: HTMLElement | null = null;

  public constructor(
    private readonly editingNoteMask: EditingNoteMask,
    private readonly noteColorMode:
      ReadonlyRenderSignal<NoteColorMode>,
    private readonly pitchSnapSettings:
      ReadonlyRenderSignal<PitchSnapSettings>,
  ) {}

  public setGhostLayer(element: HTMLDivElement | null): void {
    this.ghostLayer = element;
  }

  public setSelectionLayer(element: HTMLDivElement | null): void {
    this.selectionLayer = element;
  }

  public setLassoElement(element: HTMLDivElement | null): void {
    this.lassoElement = element;
  }

  public beginDrag(
    notes: readonly Note[],
    converter: CoordinateConverter,
    stylesByInstrumentId: Readonly<Record<InstrumentId, InstrumentRenderStyle>>,
  ): void {
    this.editingNoteMask.replace(notes);
    resetLayerTransform(this.selectionLayer);
    this.ghostGeometry = populateGhostLayer(
      this.ghostLayer,
      notes,
      converter,
      stylesByInstrumentId,
      this.noteColorMode.get(),
      this.pitchSnapSettings.get(),
      null,
      this.ghostElements,
    );
  }

  public updateDrag(
    deltaXCssPixels: number,
    pitchStepCssPixels: number,
    deltaPitch: number,
    activePitchSnapSettings: PitchSnapSettings,
  ): void {
    if (activePitchSnapSettings.enabled) {
      resetLayerTransform(this.ghostLayer);
      resetLayerTransform(this.selectionLayer);
      updatePitchSnappedDrag(
        this.ghostElements,
        this.ghostGeometry?.pitch ?? null,
        deltaXCssPixels,
        pitchStepCssPixels,
        deltaPitch,
        activePitchSnapSettings,
        true,
        this.noteColorMode.get() === "pitch",
      );
      updatePitchSnappedDrag(
        this.selectionElements,
        this.selectionGeometry?.pitch ?? null,
        deltaXCssPixels,
        pitchStepCssPixels,
        deltaPitch,
        activePitchSnapSettings,
        false,
        false,
      );
      return;
    }

    const deltaYCssPixels = -deltaPitch * pitchStepCssPixels;
    const transform =
      `translate3d(${deltaXCssPixels}px, ${deltaYCssPixels}px, 0)`;

    if (this.ghostLayer !== null) {
      this.ghostLayer.style.transform = transform;
    }

    if (this.selectionLayer !== null) {
      this.selectionLayer.style.transform = transform;
    }

    updateGhostPitchPresentation(
      this.ghostElements,
      this.ghostGeometry?.pitch ?? null,
      deltaPitch,
      this.pitchSnapSettings.get(),
      this.noteColorMode.get() === "pitch",
    );
  }

  public endDrag(): void {
    this.editingNoteMask.clear();
    resetLayerTransform(this.selectionLayer);
    clearLayer(this.ghostLayer, this.ghostElements);
    this.ghostGeometry = null;
  }

  public beginResize(
    notes: readonly Note[],
    converter: CoordinateConverter,
    stylesByInstrumentId: Readonly<Record<InstrumentId, InstrumentRenderStyle>>,
    edge: ResizeEdge,
  ): void {
    this.editingNoteMask.replace(notes);
    resetLayerTransform(this.selectionLayer);
    this.ghostGeometry = populateGhostLayer(
      this.ghostLayer,
      notes,
      converter,
      stylesByInstrumentId,
      this.noteColorMode.get(),
      this.pitchSnapSettings.get(),
      edge,
      this.ghostElements,
    );
  }

  public updateResize(
    edge: ResizeEdge,
    deltaXCssPixels: number,
  ): void {
    updateHorizontalGeometry(
      edge,
      deltaXCssPixels,
      this.ghostElements,
      this.ghostGeometry,
    );
    updateHorizontalGeometry(
      edge,
      deltaXCssPixels,
      this.selectionElements,
      this.selectionGeometry,
    );
  }

  public endResize(): void {
    this.editingNoteMask.clear();
    resetLayerTransform(this.selectionLayer);
    clearLayer(this.ghostLayer, this.ghostElements);
    this.ghostGeometry = null;
  }

  public beginDraw(
    startTick: number,
    pitch: number,
    durationTicks: number,
    instrumentId: InstrumentId,
    converter: CoordinateConverter,
    style: InstrumentRenderStyle | undefined,
  ): void {
    if (this.ghostLayer === null) {
      return;
    }

    this.editingNoteMask.clear();
    resetLayerTransform(this.selectionLayer);
    clearLayer(this.ghostLayer, this.ghostElements);
    this.ghostGeometry = null;

    const element = document.createElement("div");
    const x = converter.tickToCssPixelX(startTick);
    const endX = converter.tickToCssPixelX(
      startTick + durationTicks,
    );
    const y = converter.pitchToCssPixelY(pitch);
    const nextY = converter.pitchToCssPixelY(pitch - 1);

    element.className = "interaction-note-ghost is-drawing";
    element.dataset["instrumentId"] = instrumentId;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.width = `${Math.max(1, endX - x)}px`;
    element.style.height = `${Math.max(1, nextY - y - 1)}px`;
    element.style.background =
      this.noteColorMode.get() === "pitch"
        ? getPitchNoteColor(
            pitch,
            this.pitchSnapSettings.get(),
          )
        : style?.fillStyle ?? APPLICATION_COLORS.accent.primary;
    element.textContent = getMidiNoteLabel(
      pitch,
      this.pitchSnapSettings.get(),
    );
    this.drawGhostElement = element;
    this.ghostLayer.appendChild(element);
  }

  public updateDraw(widthCssPixels: number): void {
    if (this.drawGhostElement !== null) {
      this.drawGhostElement.style.width =
        `${Math.max(1, widthCssPixels)}px`;
    }
  }

  public endDraw(): void {
    this.drawGhostElement = null;
    clearLayer(this.ghostLayer, this.ghostElements);
  }

  public beginLasso(localX: number, localY: number): void {
    if (this.lassoElement === null) {
      return;
    }

    this.lassoElement.style.display = "block";
    this.lassoElement.style.transform =
      `translate3d(${localX}px, ${localY}px, 0)`;
    this.lassoElement.style.width = "0px";
    this.lassoElement.style.height = "0px";
  }

  public updateLasso(
    startX: number,
    startY: number,
    currentX: number,
    currentY: number,
  ): void {
    if (this.lassoElement === null) {
      return;
    }

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    this.lassoElement.style.transform =
      `translate3d(${left}px, ${top}px, 0)`;
    this.lassoElement.style.width = `${width}px`;
    this.lassoElement.style.height = `${height}px`;
  }

  public endLasso(): void {
    if (this.lassoElement !== null) {
      this.lassoElement.style.display = "none";
    }
  }

  public showSelection(
    notes: readonly Note[],
    converter: CoordinateConverter,
  ): void {
    this.selectionGeometry = populateSelectionLayer(
      this.selectionLayer,
      notes,
      converter,
      this.selectionElements,
    );
  }

  public clearSelection(): void {
    resetLayerTransform(this.selectionLayer);
    this.selectionElements.length = 0;
    this.selectionGeometry = null;
    this.selectionLayer?.replaceChildren();
  }
}

function populateGhostLayer(
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
    left[elements.length] = x;
    width[elements.length] = noteWidth;
    pitch[elements.length] = note.pitch;
    elements.push(element);
    fragment.appendChild(element);
  }

  ghostLayer.appendChild(fragment);
  return { left, width, pitch };
}

function populateSelectionLayer(
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
    left[elements.length] = x;
    width[elements.length] = noteWidth;
    pitch[elements.length] = note.pitch;
    elements.push(element);
    fragment.appendChild(element);
  }

  selectionLayer.appendChild(fragment);
  return { left, width, pitch };
}

function updateGhostPitchPresentation(
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

function updatePitchSnappedDrag(
  elements: readonly HTMLElement[],
  basePitches: Int16Array | null,
  deltaXCssPixels: number,
  pitchStepCssPixels: number,
  deltaPitch: number,
  pitchSnapSettings: PitchSnapSettings,
  updatePitchLabel: boolean,
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

    const snappedPitch =
      deltaPitch === 0
        ? basePitch
        : snapPitchToTonalPattern(
            basePitch + deltaPitch,
            pitchSnapSettings,
            deltaPitch,
          );
    const deltaYCssPixels =
      -(snappedPitch - basePitch) * pitchStepCssPixels;

    element.style.transform =
      `translate3d(${deltaXCssPixels}px, ${deltaYCssPixels}px, 0)`;

    if (updatePitchLabel) {
      element.textContent = getMidiNoteLabel(
        snappedPitch,
        pitchSnapSettings,
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

function updateHorizontalGeometry(
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

function clearLayer(
  layer: HTMLDivElement | null,
  elements: HTMLElement[],
): void {
  elements.length = 0;

  if (layer !== null) {
    layer.replaceChildren();
    layer.style.transform = "translate3d(0, 0, 0)";
  }
}

function resetLayerTransform(layer: HTMLElement | null): void {
  if (layer !== null) {
    layer.style.transform = "translate3d(0, 0, 0)";
  }
}
