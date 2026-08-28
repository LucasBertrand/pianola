import type {
  ClipId,
  Tick,
} from "../../../domain/identifiers";
import type {
  PlayheadPosition,
} from "../../../editor-core/model/playhead-position";

export interface ClipPlayheadVisual {
  readonly present: boolean;
  readonly progress: number;
}

/** Resolves the persistent marker and elapsed fill for one clip card. */
export function resolveClipPlayheadVisual(
  clipId: ClipId,
  durationTicks: Tick,
  position: PlayheadPosition,
): ClipPlayheadVisual {
  if (position.clipId !== clipId) {
    return { present: false, progress: 0 };
  }

  return {
    present: true,
    progress: Math.min(
      1,
      Math.max(0, position.tick / durationTicks),
    ),
  };
}
