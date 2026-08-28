import type {
  ClipId,
} from "../../../domain/identifiers";

export interface ClipGroupPlaybackAction {
  readonly active: boolean;
  readonly targetClipId: ClipId | null;
}

/** Resolves both the group button state and the clip its toggle must receive. */
export function resolveClipGroupPlaybackAction(
  descendantClipIds: readonly ClipId[],
  playingClipId: ClipId | null,
  bypassedClipIds: ReadonlySet<ClipId> = new Set(),
): ClipGroupPlaybackAction {
  const active = playingClipId !== null
    && descendantClipIds.includes(playingClipId);

  return {
    active,
    targetClipId: active
      ? playingClipId
      : descendantClipIds.find((clipId) => !bypassedClipIds.has(clipId))
        ?? null,
  };
}
