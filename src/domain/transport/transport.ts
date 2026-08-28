import {
  PROJECT_CONSTANTS,
} from "../project/project-constants";
import type {
  Tick,
} from "../identifiers";

export const DEFAULT_PPQN = PROJECT_CONSTANTS.ppqn;

export interface ProjectClock {
  readonly ppqn: number;
  readonly launchGridTicks: Tick;
}

export interface LoopRegion {
  readonly startTick: Tick;
  readonly endTick: Tick;
}

export interface TransportState {
  readonly loop: LoopRegion;
  readonly loopEnabled: boolean;
}

export function createDefaultTransportState(): TransportState {
  return {
    loop: {
      startTick: 0,
      endTick:
        DEFAULT_PPQN
        * 4
        * PROJECT_CONSTANTS.defaultTimeSignatureNumerator
        / PROJECT_CONSTANTS.defaultTimeSignatureDenominator,
    },
    loopEnabled: PROJECT_CONSTANTS.defaultLoopEnabled,
  };
}

export function createDefaultProjectClock(): ProjectClock {
  return {
    ppqn: DEFAULT_PPQN,
    launchGridTicks: DEFAULT_PPQN,
  };
}

/** Resolves Play at the clip end to the canonical restart position. */
export function resolvePlaybackStartTick(
  tick: number,
  durationTicks: number,
  transport: TransportState,
): Tick {
  if (!Number.isFinite(tick)) {
    throw new RangeError("Playback position must be finite.");
  }

  return tick >= durationTicks
    ? (transport.loopEnabled ? transport.loop.startTick : 0)
    : Math.min(durationTicks, Math.max(0, tick));
}
