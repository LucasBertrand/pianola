import {
  APPLICATION_COLORS,
} from "../../styles/application-colors";
import type {
  Note,
} from "../../../domain/notes/note";
import {
  type InstrumentId,
} from "../../../domain/identifiers";
import type {
  CoordinateConverter,
} from "../../../editor-core/geometry/converter";
import {
  type PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";
import type {
  EditingNoteMask,
} from "../../../editor-core/interactions/editing-note-mask";
import {
  getNoteFillStyle,
  getPitchNoteColor,
} from "../rendering/note-style";
import type {
  InstrumentRenderStyle,
} from "../../../editor-core/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../../../editor-core/model/note-color-mode";
import {
  getMidiNoteLabel,
} from "../rendering/pitch-label";
import { RENDERING_CONSTANTS } from "../rendering/rendering-constants";
import type {
  ReadonlyRenderSignal,
} from "../../../editor-core/model/render-signal";
import type {
  EditorCommandPort,
} from "../../../application/history/editor-command-service";
import {
  getActiveClip,
} from "../../../domain/project/project-document";
import {
  resolvePitchSnapSettings,
} from "../../../application/piano-roll/timeline/pitch-snap-resolution";
import type {
  InteractionVisualController,
} from "./interaction-visual-controller";
import type {
  ResizeEdge,
} from "../../../editor-core/interactions/gestures/gesture-draft";
import type {
  ScaleMarker,
} from "../../../domain/transport/time-map";

import {
  clearSelectionLayer,
  clearLayer,
  filterEditableInteractionNotes,
  populateGhostLayer,
  populateSelectionLayer,
  resetLayerTransform,
  updateGhostPitchPresentation,
  updateHorizontalGeometry,
  updatePitchSnappedDrag,
  updateSelectionPitchColors,
  type LayerGeometry,
} from "./dom-interaction-layers";/** DOM renderer for transient ghosts, resize handles, and lasso feedback. */
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
  private getDragScaleMarkers: () => readonly ScaleMarker[] = () => [];

  public constructor(
    private readonly editingNoteMask: EditingNoteMask,
    private readonly noteColorMode:
      ReadonlyRenderSignal<NoteColorMode>,
    private readonly instrumentStyles: ReadonlyRenderSignal<
      Readonly<Record<InstrumentId, InstrumentRenderStyle>>
    >,
    private readonly editorCommands: EditorCommandPort,
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
    getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
    getScaleMarkers: () => readonly ScaleMarker[],
  ): void {
    const editableNotes = filterEditableInteractionNotes(notes);
    const scaleMarkers = getScaleMarkers();

    this.editingNoteMask.replace(editableNotes);
    this.getDragScaleMarkers = getScaleMarkers;
    this.showSelection(editableNotes, converter);
    this.ghostGeometry = populateGhostLayer(
      this.ghostLayer,
      editableNotes,
      converter,
      stylesByInstrumentId,
      this.noteColorMode.get(),
      getSnapSettingsAtTick,
      null,
      this.ghostElements,
      scaleMarkers,
    );
  }

  public updateDrag(
    deltaXCssPixels: number,
    pitchStepCssPixels: number,
    deltaTicks: number,
    deltaPitch: number,
    getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
  ): void {
    if (getSnapSettingsAtTick(0).enabled) {
      resetLayerTransform(this.ghostLayer);
      resetLayerTransform(this.selectionLayer);
      updatePitchSnappedDrag(
        this.ghostElements,
        this.ghostGeometry,
        deltaXCssPixels,
        pitchStepCssPixels,
        deltaTicks,
        deltaPitch,
        getSnapSettingsAtTick,
        this.getDragScaleMarkers(),
        true,
        this.noteColorMode.get() === "pitch",
      );
      updatePitchSnappedDrag(
        this.selectionElements,
        this.selectionGeometry,
        deltaXCssPixels,
        pitchStepCssPixels,
        deltaTicks,
        deltaPitch,
        getSnapSettingsAtTick,
        this.getDragScaleMarkers(),
        false,
        this.noteColorMode.get() === "pitch",
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
      this.ghostGeometry,
      deltaPitch,
      deltaTicks,
      deltaXCssPixels,
      getSnapSettingsAtTick,
      this.getDragScaleMarkers(),
      this.noteColorMode.get() === "pitch",
    );

    if (this.noteColorMode.get() === "pitch") {
      updateSelectionPitchColors(
        this.selectionElements,
        this.selectionGeometry,
        deltaPitch,
        deltaTicks,
        getSnapSettingsAtTick,
      );
    }
  }

  public endDrag(): void {
    this.editingNoteMask.clear();
    resetLayerTransform(this.selectionLayer);
    clearLayer(this.ghostLayer, this.ghostElements);
    this.ghostGeometry = null;
    this.getDragScaleMarkers = () => [];
  }

  public beginResize(
    notes: readonly Note[],
    converter: CoordinateConverter,
    stylesByInstrumentId: Readonly<Record<InstrumentId, InstrumentRenderStyle>>,
    edge: ResizeEdge,
    getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
  ): void {
    const editableNotes = filterEditableInteractionNotes(notes);

    this.editingNoteMask.replace(editableNotes);
    this.showSelection(editableNotes, converter);
    this.ghostGeometry = populateGhostLayer(
      this.ghostLayer,
      editableNotes,
      converter,
      stylesByInstrumentId,
      this.noteColorMode.get(),
      getSnapSettingsAtTick,
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
    getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
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
    const fillStyle =
      this.noteColorMode.get() === "pitch"
        ? getPitchNoteColor(
            pitch,
            getSnapSettingsAtTick(startTick),
          )
        : style?.fillStyle ?? APPLICATION_COLORS.accent.primary;

    element.style.setProperty("--note-color", fillStyle);
    element.style.background = fillStyle;
    const labelElement = document.createElement("span");

    labelElement.className = "interaction-note-label";
    labelElement.style.insetInline = "0";
    labelElement.style.paddingInline =
      `${RENDERING_CONSTANTS.noteLabelHorizontalPaddingCssPixels}px`;
    labelElement.textContent = getMidiNoteLabel(
      pitch,
      getSnapSettingsAtTick(startTick),
    );
    element.appendChild(labelElement);
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
    const activeClip = getActiveClip(this.editorCommands.getState());
    const stylesByInstrumentId = this.instrumentStyles.get();
    const colorMode = this.noteColorMode.get();
    const globalPitchSnapSettings = this.pitchSnapSettings.get();

    this.selectionGeometry = populateSelectionLayer(
      this.selectionLayer,
      notes,
      converter,
      this.selectionElements,
      (note) => getNoteFillStyle(
        note,
        stylesByInstrumentId,
        colorMode,
        resolvePitchSnapSettings(
          activeClip.timeline.timeMap,
          globalPitchSnapSettings,
          note.startTick,
        ),
      ),
    );
  }

  public clearSelection(): void {
    resetLayerTransform(this.selectionLayer);
    this.selectionElements.length = 0;
    this.selectionGeometry = null;
    clearSelectionLayer(this.selectionLayer);
  }
}
