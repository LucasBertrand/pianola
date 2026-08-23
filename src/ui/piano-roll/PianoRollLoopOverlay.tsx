import React, {
  useRef,
  type RefObject,
} from "react";
import type {
  LoopRegion,
} from "../../domain/transport/transport";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  ViewportState,
} from "../../editor/geometry/converter";
import type {
  MutableRenderSignal,
  ReadonlyRenderSignal,
} from "../../editor/model/render-signal";
import {
  usePianoRollLoopGesture,
} from "./usePianoRollLoopGesture";
import type {
  PointerInteractionStrategy,
} from "../../editor/interactions/pointer/pointer-interaction-strategy";

export interface PianoRollLoopOverlayProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly projectStore: ProjectStorePort;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly interactionStrategyRef: RefObject<
    PointerInteractionStrategy | null
  >;
  readonly loopDragPreview: MutableRenderSignal<LoopRegion | null>;
  readonly onCommit: (loop: LoopRegion) => void;
  readonly onClearSelection: () => void;
}

export function PianoRollLoopOverlay(
  props: PianoRollLoopOverlayProps,
): React.JSX.Element {
  const {
    viewport,
    projectStore,
    gridResolutionTicks,
    interactionStrategyRef,
    loopDragPreview,
    onCommit,
    onClearSelection,
  } = props;
  const layerRef = useRef<HTMLDivElement | null>(null);
  const bandRef = useRef<HTMLButtonElement | null>(null);
  const startFlagRef = useRef<HTMLButtonElement | null>(null);
  const endFlagRef = useRef<HTMLButtonElement | null>(null);
  const boundaryLayerRef = useRef<HTMLDivElement | null>(null);
  const startBoundaryRef = useRef<HTMLElement | null>(null);
  const endBoundaryRef = useRef<HTMLElement | null>(null);

  usePianoRollLoopGesture({
    viewport,
    projectStore,
    gridResolutionTicks,
    interactionStrategyRef,
    loopDragPreview,
    onCommit,
    onClearSelection,
    layerRef,
    bandRef,
    startFlagRef,
    endFlagRef,
    boundaryLayerRef,
    startBoundaryRef,
    endBoundaryRef,
  });

  return (
    <>
      <div
        ref={layerRef}
        className="bar-ruler-loop-overlay"
        aria-label="Loop region"
        title="Drag to select. Press and hold to draw the loop region."
      >
        <button
          ref={bandRef}
          className="bar-ruler-loop-band"
          type="button"
          data-loop-mode="move"
          title="Move loop region"
          aria-label="Move loop region"
        />
        <button
          ref={startFlagRef}
          className="bar-ruler-loop-flag is-start"
          type="button"
          data-loop-mode="resize-start"
          title="Adjust loop start"
          aria-label="Adjust loop start"
        />
        <button
          ref={endFlagRef}
          className="bar-ruler-loop-flag is-end"
          type="button"
          data-loop-mode="resize-end"
          title="Adjust loop end"
          aria-label="Adjust loop end"
        />
      </div>
      <div
        ref={boundaryLayerRef}
        className="bar-ruler-loop-boundaries"
        data-enabled="false"
        aria-hidden="true"
      >
        <i ref={startBoundaryRef} />
        <i ref={endBoundaryRef} />
      </div>
    </>
  );
}
