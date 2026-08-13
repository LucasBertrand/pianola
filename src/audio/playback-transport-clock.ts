import type {
  PlaybackSnapshot,
} from "./playback-model";
import {
  secondsToTickDelta,
  tickDeltaToSeconds,
} from "./time-math";
import {
  getPlaybackBpm,
} from "./playback-transport-query";

export interface PlaybackTransportClock {
  readonly snapshot: PlaybackSnapshot;
  readonly anchorUnwrappedTick: number;
  readonly anchorAudioTimeSeconds: number;
}

export function getCurrentUnwrappedPlaybackTick(
  clock: PlaybackTransportClock,
  currentAudioTimeSeconds: number,
): number {
  return clock.anchorUnwrappedTick + secondsToTickDelta(
    Math.max(0, currentAudioTimeSeconds - clock.anchorAudioTimeSeconds),
    getPlaybackBpm(clock.snapshot),
    clock.snapshot.ppqn,
  );
}

export function playbackAudioTimeToUnwrappedTick(
  clock: PlaybackTransportClock,
  audioTimeSeconds: number,
): number {
  return clock.anchorUnwrappedTick + secondsToTickDelta(
    audioTimeSeconds - clock.anchorAudioTimeSeconds,
    getPlaybackBpm(clock.snapshot),
    clock.snapshot.ppqn,
  );
}

export function unwrappedTickToPlaybackAudioTime(
  clock: PlaybackTransportClock,
  unwrappedTick: number,
): number {
  return clock.anchorAudioTimeSeconds + tickDeltaToSeconds(
    unwrappedTick - clock.anchorUnwrappedTick,
    getPlaybackBpm(clock.snapshot),
    clock.snapshot.ppqn,
  );
}

export function getPlaybackEndAudioTime(
  clock: PlaybackTransportClock,
): number {
  return unwrappedTickToPlaybackAudioTime(
    clock,
    clock.snapshot.durationTicks,
  );
}
