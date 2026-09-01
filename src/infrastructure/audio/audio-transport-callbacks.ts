import type {
  ClipId,
  Tick,
} from "../../domain/identifiers";
import type {
  PlaybackStatus,
} from "../../application/ports/audio-transport";
import type {
  MasterLevelMeasurement,
} from "./worklet/worklet-master-stage";

export interface AudioTransportCallbacks {
  readonly onStatusChange?: (
    status: PlaybackStatus,
    sourceId: ClipId,
    positionTick: Tick,
  ) => void;
  readonly onError?: (error: unknown) => void;
  readonly onMasterLevels?: (levels: MasterLevelMeasurement) => void;
}
