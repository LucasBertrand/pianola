import type {
  ClipId,
  Tick,
} from "../domain/identifiers";
import type {
  PlaybackStatus,
} from "./playback-model";

export interface AudioTransportCallbacks {
  readonly onStatusChange?: (
    status: PlaybackStatus,
    sourceId: ClipId,
    positionTick: Tick,
  ) => void;
  readonly onError?: (error: unknown) => void;
}
