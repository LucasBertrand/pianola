import type {
  RefObject,
} from "react";
import type {
  AudioEnginePort,
  PlaybackSnapshotProvider,
  SchedulerController,
} from "../audio/contracts";
import type {
  Tick,
  TransportState,
} from "../domain/model";
import type {
  PianoRollCommand,
} from "../domain/commands";
import type {
  CanvasInvalidationReason,
  CanvasInvalidationSource,
  CoordinateConverter,
  InteractionDraft,
  SpatialIndex,
  ViewportState,
} from "../piano-roll/contracts";

export interface UseLookaheadSchedulerOptions {
  readonly engine: AudioEnginePort;
  readonly snapshotProvider: PlaybackSnapshotProvider;
  readonly getTransportState: () => TransportState;
  readonly workerUrl: URL;
  readonly enabled: boolean;
}

export declare function useLookaheadScheduler(
  options: UseLookaheadSchedulerOptions,
): SchedulerController;

export interface CanvasFrame<TSnapshot> {
  readonly context: CanvasRenderingContext2D;
  readonly snapshot: TSnapshot;
  readonly viewport: ViewportState;
  readonly timestampMs: number;
}

export interface UseCanvasRendererOptions<TSnapshot> {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly invalidationSource: CanvasInvalidationSource;
  readonly getSnapshot: () => TSnapshot;
  readonly getViewport: () => ViewportState;
  readonly render: (frame: CanvasFrame<TSnapshot>) => void;
}

export interface CanvasRendererController {
  invalidate(reason: CanvasInvalidationReason): void;
  renderNow(): void;
}

export declare function useCanvasRenderer<TSnapshot>(
  options: UseCanvasRendererOptions<TSnapshot>,
): CanvasRendererController;

export interface PianoRollInteractionController {
  readonly draft: InteractionDraft;
  cancel(): void;
}

export interface UsePianoRollEventsOptions {
  readonly overlayRef: RefObject<HTMLElement | null>;
  readonly getViewport: () => ViewportState;
  readonly coordinateConverter: CoordinateConverter;
  readonly spatialIndex: SpatialIndex;
  readonly dispatchCommand: (command: PianoRollCommand) => void;
  readonly interaction: PianoRollInteractionController;
  readonly quantizeTick: (tick: Tick) => Tick;
  readonly invalidateOverlay: () => void;
}

export declare function usePianoRollEvents(
  options: UsePianoRollEventsOptions,
): void;
