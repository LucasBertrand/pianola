import type {
  PlaybackStatus,
} from "../../audio/playback-model";
import type {
  ClipId,
} from "../../domain/identifiers";

/** Returns the clip the editor must reveal, if playback following owns view. */
export function getPlaybackFollowTargetClipId(
  enabled: boolean,
  status: PlaybackStatus,
  activeClipId: ClipId,
  playingClipId: ClipId | null,
): ClipId | null {
  return enabled
    && status === "playing"
    && playingClipId !== null
    && playingClipId !== activeClipId
    ? playingClipId
    : null;
}

/**
 * Prevents a user selection from briefly taking the editor away from the
 * playing clip while playback following owns the view.
 */
export function resolvePlaybackFollowClipSelection(
  enabled: boolean,
  status: PlaybackStatus,
  requestedClipId: ClipId,
  playingClipId: ClipId | null,
): ClipId {
  return enabled
    && status === "playing"
    && playingClipId !== null
    ? playingClipId
    : requestedClipId;
}
