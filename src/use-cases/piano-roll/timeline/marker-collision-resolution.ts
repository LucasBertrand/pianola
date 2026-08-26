import type {
  Tick,
} from "../../../domain/identifiers";

export type TimeMapMarkerCollisionKind = "tempo" | "scale" | "section";

export interface TimeMapMarkerCollision {
  readonly kind: TimeMapMarkerCollisionKind;
  readonly targetTick: Tick;
}

export interface MarkerCollisionResolutionRequest {
  readonly label: string;
  readonly collisions: readonly TimeMapMarkerCollision[];
  readonly onOverwrite: () => void;
}
