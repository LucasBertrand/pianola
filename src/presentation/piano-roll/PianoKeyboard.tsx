import React, {
  useEffect,
  useRef,
} from "react";
import {
  INTERACTION_CONSTANTS,
} from "../../editor-core/interactions/interaction-constants";
import {
  VIEWPORT_CONSTANTS,
} from "../../editor-core/viewport/viewport-constants";
import type {
  ViewportState,
} from "../../editor-core/geometry/converter";
import {
  snapPitchToPattern,
  type PitchSnapSettings,
} from "../../domain/music-theory/pitch-snap";
import type {
  ReadonlyRenderSignal,
} from "../../editor-core/model/render-signal";
import {
  getScaleMarkerAtTick,
  type TimeMap,
} from "../../domain/transport/time-map";
import type {
  ClipId,
} from "../../domain/identifiers";
import {
  resolveEffectiveTimeMap,
  type TimeMapMarkerMovePreview,
} from "../../application/editor-session/time-map-marker-preview-session";

const PITCH_CLASS_NAMES = [
  "C",
  "C sharp",
  "D",
  "D sharp",
  "E",
  "F",
  "F sharp",
  "G",
  "G sharp",
  "A",
  "A sharp",
  "B",
] as const;
const PIANO_KEYS = createPianoKeys();
const PIANO_KEY_LONG_PRESS_DELAY_MS =
  INTERACTION_CONSTANTS.pianoKeyLongPressDelayMs;
const PIANO_KEY_PEN_LONG_PRESS_DELAY_MS =
  INTERACTION_CONSTANTS.pianoKeyPenLongPressDelayMs;
const PIANO_KEY_LONG_PRESS_MOVEMENT_TOLERANCE =
  INTERACTION_CONSTANTS.pianoKeyLongPressMovementToleranceCssPixels;

export interface PianoKeyboardProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly playheadTick: ReadonlyRenderSignal<number>;
  readonly timeMap: TimeMap;
  readonly clipId: ClipId;
  readonly sourceRevision: number;
  readonly markerPreview: ReadonlyRenderSignal<
    TimeMapMarkerMovePreview | null
  >;
  readonly previewEnabled: boolean;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly onPreviewToggle: () => void;
  readonly onPitchAudition?: (pitch: number) => void;
  readonly onPitchLongPress?: (pitch: number) => void;
  readonly onPitchInteractionChange?: (
    pitch: number | null,
  ) => void;
}

export function PianoKeyboard(
  props: PianoKeyboardProps,
): React.JSX.Element {
  const {
    viewport,
    playheadTick,
    timeMap,
    clipId,
    sourceRevision,
    markerPreview,
    previewEnabled,
    pitchSnapSettings,
    onPreviewToggle,
    onPitchAudition,
    onPitchLongPress,
    onPitchInteractionChange,
  } = props;
  const keysElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateKeyboard = (): void => {
      const element = keysElementRef.current;

      if (element === null) {
        return;
      }

      const currentViewport = viewport.get();
      const rowHeight =
        currentViewport.pitchHeight * currentViewport.zoomY;

      element.style.setProperty(
        "--pitch-row-height",
        `${rowHeight}px`,
      );
      element.style.transform =
        `translate3d(0, ${-currentViewport.scrollY}px, 0)`;
    };
    const unsubscribe = viewport.subscribe(updateKeyboard);

    updateKeyboard();
    return unsubscribe;
  }, [viewport]);

  useEffect(() => {
    const element = keysElementRef.current;

    if (
      element === null
      || (
        onPitchAudition === undefined
        && onPitchLongPress === undefined
      )
    ) {
      return undefined;
    }

    let activePointerId = -1;
    let activePitch = -1;
    let lastAuditionedPitch = -1;
    let originClientX = 0;
    let originClientY = 0;
    let keyboardLeft = 0;
    let keyboardRight = 0;
    let keyboardTop = 0;
    let keyboardBottom = 0;
    let highlightedKeyElement: HTMLElement | null = null;
    let longPressTimerId: number | null = null;

    const clearLongPress = (): void => {
      if (longPressTimerId !== null) {
        window.clearTimeout(longPressTimerId);
        longPressTimerId = null;
      }
    };
    const updateInteractionPitch = (
      pitch: number | null,
    ): void => {
      highlightedKeyElement?.classList.remove("is-playing");
      highlightedKeyElement = null;

      if (pitch !== null) {
        highlightedKeyElement = element.querySelector<HTMLElement>(
          `[data-pitch="${pitch}"]`,
        );
        highlightedKeyElement?.classList.add("is-playing");
      }

      onPitchInteractionChange?.(pitch);
    };
    const updateHitTestGeometry = (): void => {
      const viewportElement = element.parentElement;

      if (viewportElement === null) {
        return;
      }

      const bounds = viewportElement.getBoundingClientRect();

      keyboardLeft = bounds.left;
      keyboardRight = bounds.right;
      keyboardTop = bounds.top;
      keyboardBottom = bounds.bottom;
    };
    const getPitchAtPoint = (
      clientX: number,
      clientY: number,
    ): number | null => {
      if (
        clientX < keyboardLeft
        || clientX > keyboardRight
        || clientY < keyboardTop
        || clientY > keyboardBottom
      ) {
        return null;
      }

      const currentViewport = viewport.get();
      const pitchRowHeight =
        currentViewport.pitchHeight * currentViewport.zoomY;
      const pitchIndex = Math.floor(
        (
          clientY
          - keyboardTop
          + currentViewport.scrollY
        ) / pitchRowHeight,
      );
      const pitch =
        VIEWPORT_CONSTANTS.highestDisplayedMidiPitch - pitchIndex;

      return pitch >= VIEWPORT_CONSTANTS.lowestDisplayedMidiPitch
        && pitch <= VIEWPORT_CONSTANTS.highestDisplayedMidiPitch
        ? pitch
        : null;
    };
    const auditionRawPitch = (
      rawPitch: number,
      movementDirection: number,
    ): number => {
      const currentTick = playheadTick.get();
      const effectiveTimeMap = resolveEffectiveTimeMap(
        timeMap,
        markerPreview.get(),
        clipId,
        sourceRevision,
      );
      const activeMarker = getScaleMarkerAtTick(
        effectiveTimeMap,
        currentTick,
      );
      const currentSnapSettings = {
        ...pitchSnapSettings,
        rootNote: activeMarker.rootNote,
        patternType: activeMarker.patternType,
        patternId: activeMarker.patternId,
      };

      const auditionedPitch = snapPitchToPattern(
        rawPitch,
        currentSnapSettings,
        movementDirection,
      );

      if (
        previewEnabled
        && auditionedPitch !== lastAuditionedPitch
      ) {
        lastAuditionedPitch = auditionedPitch;
        onPitchAudition?.(auditionedPitch);
      }

      return auditionedPitch;
    };
    const auditionPitchRange = (
      previousPitch: number,
      nextPitch: number,
    ): number => {
      const movementDirection = Math.sign(
        nextPitch - previousPitch,
      );

      if (movementDirection === 0) {
        return auditionRawPitch(nextPitch, 0);
      }

      let auditionedPitch = nextPitch;

      for (
        let pitch = previousPitch + movementDirection;
        movementDirection > 0
          ? pitch <= nextPitch
          : pitch >= nextPitch;
        pitch += movementDirection
      ) {
        auditionedPitch = auditionRawPitch(
          pitch,
          movementDirection,
        );
      }

      return auditionedPitch;
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || activePointerId !== -1) {
        return;
      }

      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-pitch]")
          : null;
      const pitch = Number(target?.dataset["pitch"]);

      if (Number.isInteger(pitch)) {
        activePointerId = event.pointerId;
        activePitch = pitch;
        originClientX = event.clientX;
        originClientY = event.clientY;
        updateHitTestGeometry();
        element.setPointerCapture(event.pointerId);
        const auditionedPitch = auditionPitchRange(pitch, pitch);

        updateInteractionPitch(
          previewEnabled ? auditionedPitch : pitch,
        );

        if (onPitchLongPress !== undefined) {
          const delay =
            event.pointerType === "pen"
              ? PIANO_KEY_PEN_LONG_PRESS_DELAY_MS
              : PIANO_KEY_LONG_PRESS_DELAY_MS;

          longPressTimerId = window.setTimeout(() => {
            longPressTimerId = null;

            if (
              activePointerId === event.pointerId
              && activePitch === pitch
            ) {
              updateInteractionPitch(pitch);
              onPitchLongPress(pitch);
            }
          }, delay);
        }

        event.preventDefault();
      }
    };
    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      if (
        Math.abs(event.clientX - originClientX)
          > PIANO_KEY_LONG_PRESS_MOVEMENT_TOLERANCE
        || Math.abs(event.clientY - originClientY)
          > PIANO_KEY_LONG_PRESS_MOVEMENT_TOLERANCE
      ) {
        clearLongPress();
      }

      const pitch = getPitchAtPoint(
        event.clientX,
        event.clientY,
      );

      if (pitch !== null && pitch !== activePitch) {
        clearLongPress();
        const auditionedPitch = auditionPitchRange(
          activePitch,
          pitch,
        );

        activePitch = pitch;
        updateInteractionPitch(
          previewEnabled ? auditionedPitch : pitch,
        );
      }

      event.preventDefault();
    };
    const finishPointer = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      clearLongPress();
      activePointerId = -1;
      activePitch = -1;
      lastAuditionedPitch = -1;
      updateInteractionPitch(null);

      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }

      event.preventDefault();
    };
    const handleContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
    };

    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerup", finishPointer);
    element.addEventListener("pointercancel", finishPointer);
    element.addEventListener("lostpointercapture", finishPointer);
    element.addEventListener("contextmenu", handleContextMenu);

    return (): void => {
      clearLongPress();
      updateInteractionPitch(null);
      element.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      element.removeEventListener(
        "pointermove",
        handlePointerMove,
      );
      element.removeEventListener("pointerup", finishPointer);
      element.removeEventListener(
        "pointercancel",
        finishPointer,
      );
      element.removeEventListener(
        "lostpointercapture",
        finishPointer,
      );
      element.removeEventListener(
        "contextmenu",
        handleContextMenu,
      );
    };
  }, [
    onPitchAudition,
    onPitchLongPress,
    onPitchInteractionChange,
    pitchSnapSettings,
    previewEnabled,
    playheadTick,
    markerPreview,
    clipId,
    sourceRevision,
    timeMap,
  ]);

  return (
    <div className="piano-strip" aria-label="Piano keyboard">
      <div className="piano-ruler-spacer" aria-hidden="true" />
      <button
        className={
          previewEnabled
            ? "piano-preview-toggle is-active"
            : "piano-preview-toggle"
        }
        type="button"
        aria-label={
          previewEnabled
            ? "Disable pitch preview"
            : "Enable pitch preview"
        }
        aria-pressed={previewEnabled}
        title={
          previewEnabled
            ? "Disable pitch preview"
            : "Enable pitch preview"
        }
        onClick={onPreviewToggle}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 10v4h4l5 4V6l-5 4H5Z" />
          {previewEnabled ? (
            <>
              <path d="M17 9.5a4 4 0 0 1 0 5" />
              <path d="M19 7a7 7 0 0 1 0 10" />
            </>
          ) : (
            <path d="m17 10 4 4m0-4-4 4" />
          )}
        </svg>
      </button>
      <div className="piano-keyboard-viewport">
        <div ref={keysElementRef} className="piano-keys-inner">
          {PIANO_KEYS}
        </div>
      </div>
    </div>
  );
}

function createPianoKeys(): readonly React.JSX.Element[] {
  const keys: React.JSX.Element[] = [];

  for (
    let pitch = VIEWPORT_CONSTANTS.highestDisplayedMidiPitch;
    pitch >= VIEWPORT_CONSTANTS.lowestDisplayedMidiPitch;
    pitch -= 1
  ) {
    const pitchClass = pitch % 12;
    const black =
      pitchClass === 1
      || pitchClass === 3
      || pitchClass === 6
      || pitchClass === 8
      || pitchClass === 10;
    const octave = Math.floor(pitch / 12) - 1;
    const label = pitchClass === 0 ? `C${octave}` : "";
    const pitchName =
      `${getPitchClassName(pitchClass)}${octave}`;

    keys.push(
      <button
        type="button"
        className={`piano-key${black ? " is-black" : ""}`}
        data-pitch={pitch}
        aria-label={`Select ${pitchName} notes`}
        key={pitch}
      >
        {label}
      </button>,
    );
  }

  return keys;
}

function getPitchClassName(pitchClass: number): string {
  return PITCH_CLASS_NAMES[pitchClass] ?? "Unknown";
}
