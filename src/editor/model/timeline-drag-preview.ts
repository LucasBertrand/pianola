import type {
  Tick,
} from "../../domain/identifiers";

/** Shared presentation state for note- and marker-initiated timeline drags. */
export type TimelineDragPreview = {
  readonly source: "notes";
  readonly deltaTicks: number;
} | {
  readonly source: "markers";
  readonly deltaTicks: number;
  /** Null when the whole editor selection is moving. */
  readonly standaloneMarkerTick: Tick | null;
};
