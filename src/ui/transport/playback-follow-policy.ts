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
