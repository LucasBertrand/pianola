import React, {
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  Note,
  NoteId,
  VoiceId,
} from "../../domain/model";
import type {
  CoordinateConverter,
  ViewportState,
} from "../../geometry/converter";
import {
  SpatialIndex,
} from "../../geometry/spatial-index";
import {
  useInteractionManager,
} from "../hooks/useInteractionManager";
import {
  usePianoRollEvents,
  type NoteCollisionResolutionRequest,
  type PianoRollEventController,
} from "../hooks/usePianoRollEvents";
import type {
  InteractionVisualController,
  ResizeEdge,
} from "../interactions/contracts";
import type {
  InteractionToolSignal,
  SelectionMode,
  TouchAwareInteractionStrategy,
} from "../interactions/types";
import {
  snapPitchToTonalPattern,
  type PitchSnapSettings,
} from "../interactions/pitch-snap";
import type {
  ReadonlyRenderSignal,
} from "../rendering/render-signal";
import {
  getNoteFillStyle,
  getPitchNoteColor,
  type NoteColorMode,
  type VoiceRenderStyle,
} from "../rendering/note-style";
import {
  getMidiNoteLabel,
} from "../rendering/pitch-label";

export interface InteractionOverlayProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly spatialIndex: SpatialIndex;
  readonly voiceStyles: ReadonlyRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
  readonly noteColorMode: ReadonlyRenderSignal<NoteColorMode>;
  readonly projectStore: ProjectStorePort;
  readonly toolState: InteractionToolSignal;
  readonly selectionMode: SelectionMode;
  readonly activeVoiceId: VoiceId;
  readonly totalTicks: number;
  readonly setViewport: (viewport: ViewportState) => void;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly voiceSelectionRequest: ReadonlyRenderSignal<VoiceId | null>;
  readonly editingNoteIds: Set<NoteId>;
  readonly eventControllerRef: MutableRefObject<
    PianoRollEventController | null
  >;
  readonly onSelectionChange: (hasSelection: boolean) => void;
  readonly onGridSeek: (tick: number) => void;
  readonly onNoteCollision: (
    request: NoteCollisionResolutionRequest,
  ) => void;
}

const INTERACTION_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  touchAction: "none",
  outline: "none",
  cursor: "crosshair",
};

const GHOST_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  willChange: "transform",
};

const SELECTION_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  willChange: "transform",
};

const LASSO_STYLE: CSSProperties = {
  position: "absolute",
  display: "none",
  border: "1px solid rgba(120, 180, 255, 0.95)",
  background: "rgba(80, 150, 255, 0.18)",
  boxShadow: "0 0 0 1px rgba(30, 70, 120, 0.3)",
  pointerEvents: "none",
  boxSizing: "border-box",
  willChange: "transform, width, height",
};

export function InteractionOverlay(
  props: InteractionOverlayProps,
): React.JSX.Element {
  const {
    viewport,
    spatialIndex,
    voiceStyles,
    noteColorMode,
    projectStore,
    toolState,
    selectionMode,
    activeVoiceId,
    totalTicks,
    setViewport,
    gridResolutionTicks,
    pitchSnapSettings,
    voiceSelectionRequest,
    editingNoteIds,
    eventControllerRef,
    onSelectionChange,
    onGridSeek,
    onNoteCollision,
  } = props;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const selectionLayerRef = useRef<HTMLDivElement | null>(null);
  const ghostLayerRef = useRef<HTMLDivElement | null>(null);
  const lassoElementRef = useRef<HTMLDivElement | null>(null);
  const ghostElementsRef = useRef<HTMLElement[]>([]);
  const ghostBaseLeftRef = useRef<Float64Array | null>(null);
  const ghostBaseWidthRef = useRef<Float64Array | null>(null);
  const ghostBasePitchRef = useRef<Int16Array | null>(null);
  const selectionElementsRef = useRef<HTMLElement[]>([]);
  const selectionBaseLeftRef = useRef<Float64Array | null>(null);
  const selectionBaseWidthRef = useRef<Float64Array | null>(null);
  const selectionBasePitchRef = useRef<Int16Array | null>(null);
  const drawGhostElementRef = useRef<HTMLElement | null>(null);
  const visualsRef = useRef<InteractionVisualController | null>(
    null,
  );
  const strategyRef = useRef<TouchAwareInteractionStrategy | null>(
    null,
  );

  if (visualsRef.current === null) {
    visualsRef.current = {
      beginDrag(notes, converter, stylesByVoiceId): void {
        markEditingNotes(editingNoteIds, notes);
        resetLayerTransform(selectionLayerRef.current);
        populateGhostLayer(
          ghostLayerRef.current,
          notes,
          converter,
          stylesByVoiceId,
          noteColorMode.get(),
          null,
          ghostElementsRef.current,
          ghostBaseLeftRef,
          ghostBaseWidthRef,
          ghostBasePitchRef,
        );
      },
      updateDrag(
        deltaXCssPixels,
        pitchStepCssPixels,
        deltaPitch,
        activePitchSnapSettings,
      ): void {
        const ghostLayer = ghostLayerRef.current;
        const selectionLayer = selectionLayerRef.current;

        if (activePitchSnapSettings.enabled) {
          resetLayerTransform(ghostLayer);
          resetLayerTransform(selectionLayer);
          updatePitchSnappedDrag(
            ghostElementsRef.current,
            ghostBasePitchRef.current,
            deltaXCssPixels,
            pitchStepCssPixels,
            deltaPitch,
            activePitchSnapSettings,
            true,
            noteColorMode.get() === "pitch",
          );
          updatePitchSnappedDrag(
            selectionElementsRef.current,
            selectionBasePitchRef.current,
            deltaXCssPixels,
            pitchStepCssPixels,
            deltaPitch,
            activePitchSnapSettings,
            false,
            false,
          );
          return;
        }

        const deltaYCssPixels =
          -deltaPitch * pitchStepCssPixels;
        const transform =
          `translate3d(${deltaXCssPixels}px, ${deltaYCssPixels}px, 0)`;

        if (ghostLayer !== null) {
          ghostLayer.style.transform = transform;
        }

        if (selectionLayer !== null) {
          selectionLayer.style.transform = transform;
        }

        updateGhostPitchPresentation(
          ghostElementsRef.current,
          ghostBasePitchRef.current,
          deltaPitch,
          noteColorMode.get() === "pitch",
        );
      },
      endDrag(): void {
        editingNoteIds.clear();
        resetLayerTransform(selectionLayerRef.current);
        clearGhostLayer(
          ghostLayerRef.current,
          ghostElementsRef.current,
        );
      },
      beginResize(
        notes,
        converter,
        stylesByVoiceId,
        edge,
      ): void {
        markEditingNotes(editingNoteIds, notes);
        resetLayerTransform(selectionLayerRef.current);
        populateGhostLayer(
          ghostLayerRef.current,
          notes,
          converter,
          stylesByVoiceId,
          noteColorMode.get(),
          edge,
          ghostElementsRef.current,
          ghostBaseLeftRef,
          ghostBaseWidthRef,
          ghostBasePitchRef,
        );
      },
      updateResize(edge, deltaXCssPixels): void {
        updateHorizontalGeometry(
          edge,
          deltaXCssPixels,
          ghostElementsRef.current,
          ghostBaseLeftRef.current,
          ghostBaseWidthRef.current,
        );
        updateHorizontalGeometry(
          edge,
          deltaXCssPixels,
          selectionElementsRef.current,
          selectionBaseLeftRef.current,
          selectionBaseWidthRef.current,
        );
      },
      endResize(): void {
        editingNoteIds.clear();
        resetLayerTransform(selectionLayerRef.current);
        clearGhostLayer(
          ghostLayerRef.current,
          ghostElementsRef.current,
        );
      },
      beginDraw(
        startTick,
        pitch,
        durationTicks,
        voiceId,
        converter,
        style,
      ): void {
        const ghostLayer = ghostLayerRef.current;

        if (ghostLayer === null) {
          return;
        }

        editingNoteIds.clear();
        resetLayerTransform(selectionLayerRef.current);
        clearGhostLayer(
          ghostLayer,
          ghostElementsRef.current,
        );

        const element = document.createElement("div");
        const x = converter.tickToCssPixelX(startTick);
        const endX = converter.tickToCssPixelX(
          startTick + durationTicks,
        );
        const y = converter.pitchToCssPixelY(pitch);
        const nextY = converter.pitchToCssPixelY(pitch - 1);

        element.className =
          "interaction-note-ghost is-drawing";
        element.dataset["voiceId"] = voiceId;
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        element.style.width = `${Math.max(1, endX - x)}px`;
        element.style.height =
          `${Math.max(1, nextY - y - 1)}px`;
        element.style.background =
          noteColorMode.get() === "pitch"
            ? getPitchNoteColor(pitch)
            : style?.fillStyle ?? "#79a7ff";
        element.textContent = getMidiNoteLabel(pitch);
        drawGhostElementRef.current = element;
        ghostLayer.appendChild(element);
      },
      updateDraw(widthCssPixels): void {
        const element = drawGhostElementRef.current;

        if (element !== null) {
          element.style.width =
            `${Math.max(1, widthCssPixels)}px`;
        }
      },
      endDraw(): void {
        drawGhostElementRef.current = null;
        clearGhostLayer(
          ghostLayerRef.current,
          ghostElementsRef.current,
        );
      },
      beginLasso(localX, localY): void {
        const lassoElement = lassoElementRef.current;

        if (lassoElement !== null) {
          lassoElement.style.display = "block";
          lassoElement.style.transform =
            `translate3d(${localX}px, ${localY}px, 0)`;
          lassoElement.style.width = "0px";
          lassoElement.style.height = "0px";
        }
      },
      updateLasso(startX, startY, currentX, currentY): void {
        const lassoElement = lassoElementRef.current;

        if (lassoElement === null) {
          return;
        }

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        lassoElement.style.transform =
          `translate3d(${left}px, ${top}px, 0)`;
        lassoElement.style.width = `${width}px`;
        lassoElement.style.height = `${height}px`;
      },
      endLasso(): void {
        const lassoElement = lassoElementRef.current;

        if (lassoElement !== null) {
          lassoElement.style.display = "none";
        }
      },
      showSelection(notes, converter): void {
        populateSelectionLayer(
          selectionLayerRef.current,
          notes,
          converter,
          selectionElementsRef.current,
          selectionBaseLeftRef,
          selectionBaseWidthRef,
          selectionBasePitchRef,
        );
      },
      clearSelection(): void {
        resetLayerTransform(selectionLayerRef.current);
        selectionElementsRef.current.length = 0;
        selectionLayerRef.current?.replaceChildren();
      },
    };
  }

  const interactionManager = useInteractionManager({
    overlayRef,
    strategyRef,
    viewport,
    toolState,
    totalTicks,
    setViewport,
  });

  const eventController = usePianoRollEvents({
    overlayRef,
    visualsRef,
    strategyRef,
    viewport,
    spatialIndex,
    voiceStyles,
    projectStore,
    activeVoiceId,
    totalTicks,
    getActiveTool: interactionManager.getActiveTool,
    selectionMode,
    gridResolutionTicks,
    pitchSnapSettings,
    voiceSelectionRequest,
    onGridSeek,
    onSelectionChange,
    onNoteCollision,
  });

  useEffect(
    () => {
      eventControllerRef.current = eventController;

      return (): void => {
        if (eventControllerRef.current === eventController) {
          eventControllerRef.current = null;
        }
      };
    },
    [
      eventController,
      eventControllerRef,
    ],
  );

  return (
    <div
      ref={overlayRef}
      className="interaction-overlay"
      style={INTERACTION_LAYER_STYLE}
      role="application"
      aria-label="Interactive piano roll"
    >
      <div
        ref={ghostLayerRef}
        className="interaction-ghost-layer"
        style={GHOST_LAYER_STYLE}
        aria-hidden="true"
      />
      <div
        ref={selectionLayerRef}
        className="interaction-selection-layer"
        style={SELECTION_LAYER_STYLE}
        aria-hidden="true"
      />
      <div
        ref={lassoElementRef}
        className="interaction-lasso"
        style={LASSO_STYLE}
        aria-hidden="true"
      />
    </div>
  );
}

function populateGhostLayer(
  ghostLayer: HTMLDivElement | null,
  notes: readonly Note[],
  converter: CoordinateConverter,
  stylesByVoiceId: Readonly<Record<VoiceId, VoiceRenderStyle>>,
  colorMode: NoteColorMode,
  resizeEdge: ResizeEdge | null,
  elements: HTMLElement[],
  baseLeftRef: React.MutableRefObject<Float64Array | null>,
  baseWidthRef: React.MutableRefObject<Float64Array | null>,
  basePitchRef: React.MutableRefObject<Int16Array | null>,
): void {
  if (ghostLayer === null) {
    return;
  }

  ghostLayer.replaceChildren();
  ghostLayer.style.transform = "translate3d(0, 0, 0)";
  elements.length = 0;
  const baseLeft = new Float64Array(notes.length);
  const baseWidth = new Float64Array(notes.length);
  const basePitch = new Int16Array(notes.length);
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
    const width = Math.max(1, endX - x);

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
    element.style.width = `${width}px`;
    element.style.height =
      `${Math.max(1, nextY - y - 1)}px`;
    element.style.background =
      getNoteFillStyle(note, stylesByVoiceId, colorMode);
    element.textContent = getMidiNoteLabel(note.pitch);
    baseLeft[elements.length] = x;
    baseWidth[elements.length] = width;
    basePitch[elements.length] = note.pitch;
    elements.push(element);
    fragment.appendChild(element);
  }

  baseLeftRef.current = baseLeft;
  baseWidthRef.current = baseWidth;
  basePitchRef.current = basePitch;
  ghostLayer.appendChild(fragment);
}

function updateGhostPitchPresentation(
  elements: readonly HTMLElement[],
  basePitches: Int16Array | null,
  deltaPitch: number,
  updatePitchColor: boolean,
): void {
  if (basePitches === null) {
    return;
  }

  for (
    let elementIndex = 0;
    elementIndex < elements.length;
    elementIndex += 1
  ) {
    const element = elements[elementIndex];
    const basePitch = basePitches[elementIndex];

    if (element === undefined || basePitch === undefined) {
      continue;
    }

    const pitch = basePitch + deltaPitch;

    element.textContent = getMidiNoteLabel(pitch);

    if (updatePitchColor) {
      element.style.background = getPitchNoteColor(pitch);
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

  for (
    let elementIndex = 0;
    elementIndex < elements.length;
    elementIndex += 1
  ) {
    const element = elements[elementIndex];
    const basePitch = basePitches[elementIndex];

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
    const snappedDeltaPitch = snappedPitch - basePitch;
    const deltaYCssPixels =
      -snappedDeltaPitch * pitchStepCssPixels;

    element.style.transform =
      `translate3d(${deltaXCssPixels}px, ${deltaYCssPixels}px, 0)`;

    if (updatePitchLabel) {
      element.textContent = getMidiNoteLabel(snappedPitch);
    }

    if (updatePitchColor) {
      element.style.background =
        getPitchNoteColor(snappedPitch);
    }
  }
}

function clearGhostLayer(
  ghostLayer: HTMLDivElement | null,
  elements: HTMLElement[],
): void {
  elements.length = 0;

  if (ghostLayer !== null) {
    ghostLayer.replaceChildren();
    ghostLayer.style.transform = "translate3d(0, 0, 0)";
  }
}

function markEditingNotes(
  editingNoteIds: Set<NoteId>,
  notes: readonly Note[],
): void {
  editingNoteIds.clear();

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note !== undefined) {
      editingNoteIds.add(note.id);
    }
  }
}

function resetLayerTransform(
  layer: HTMLElement | null,
): void {
  if (layer !== null) {
    layer.style.transform = "translate3d(0, 0, 0)";
  }
}

function updateHorizontalGeometry(
  edge: ResizeEdge,
  deltaXCssPixels: number,
  elements: readonly HTMLElement[],
  baseLeft: Float64Array | null,
  baseWidth: Float64Array | null,
): void {
  if (baseLeft === null || baseWidth === null) {
    return;
  }

  for (
    let elementIndex = 0;
    elementIndex < elements.length;
    elementIndex += 1
  ) {
    const element = elements[elementIndex];
    const left = baseLeft[elementIndex];
    const width = baseWidth[elementIndex];

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

function populateSelectionLayer(
  selectionLayer: HTMLDivElement | null,
  notes: readonly Note[],
  converter: CoordinateConverter,
  elements: HTMLElement[],
  baseLeftRef: React.MutableRefObject<Float64Array | null>,
  baseWidthRef: React.MutableRefObject<Float64Array | null>,
  basePitchRef: React.MutableRefObject<Int16Array | null>,
): void {
  if (selectionLayer === null) {
    return;
  }

  selectionLayer.replaceChildren();
  selectionLayer.style.transform = "translate3d(0, 0, 0)";
  elements.length = 0;
  const baseLeft = new Float64Array(notes.length);
  const baseWidth = new Float64Array(notes.length);
  const basePitch = new Int16Array(notes.length);
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

    element.className = "interaction-note-selection";
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.width = `${Math.max(1, endX - x)}px`;
    element.style.height =
      `${Math.max(1, nextY - y - 1)}px`;
    baseLeft[elements.length] = x;
    baseWidth[elements.length] = Math.max(1, endX - x);
    basePitch[elements.length] = note.pitch;
    elements.push(element);
    fragment.appendChild(element);
  }

  baseLeftRef.current = baseLeft;
  baseWidthRef.current = baseWidth;
  basePitchRef.current = basePitch;
  selectionLayer.appendChild(fragment);
}
