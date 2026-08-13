import {
  type Clip,
} from "../domain/clips/clip";
import {
  type ClipId,
} from "../domain/identifiers";

/** Explicit, immutable input selected by the caller for audio compilation. */
export interface ClipPlaybackSource {
  readonly kind: "clip";
  readonly sourceId: ClipId;
  readonly clip: Clip;
}

/** Future playback sources extend this union without changing project state. */
export type PlaybackSource = ClipPlaybackSource;

export function createClipPlaybackSource(clip: Clip): PlaybackSource {
  return Object.freeze({
    kind: "clip",
    sourceId: clip.id,
    clip,
  });
}
