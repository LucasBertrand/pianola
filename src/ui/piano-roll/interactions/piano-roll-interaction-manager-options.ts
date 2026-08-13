import type {
  RefObject,
} from "react";
import type {
  ViewportState,
} from "../../../editor/geometry/converter";
import type {
  PointerInteractionStrategy,
} from "../../../editor/interactions/pointer/pointer-interaction-strategy";
import type {
  ReadonlyRenderSignal,
} from "../../../editor/model/render-signal";

export interface UseInteractionManagerOptions {
  readonly overlayRef: RefObject<HTMLElement | null>;
  readonly strategyRef: RefObject<PointerInteractionStrategy | null>;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly totalTicks: number;
  readonly setViewport: (viewport: ViewportState) => void;
  readonly onHorizontalViewportInteractionStart: () => void;
  readonly onHorizontalViewportInteractionEnd: () => void;
  readonly onTwoFingerDoubleTap: () => void;
}
