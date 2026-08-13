import type {
  Tick,
} from "../domain/identifiers";
import type {
  PlaybackStatus,
} from "./playback-model";

export interface AudioTransportCallbacks {
  readonly onStatusChange?: (
    status: PlaybackStatus,
    positionTick: Tick,
  ) => void;
  readonly onError?: (error: unknown) => void;
}
