import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
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
  readonly anchorTick: Tick;
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
    anchorTick: 0,
  };
}

export function createDefaultProjectClock(): ProjectClock {
  return {
    ppqn: DEFAULT_PPQN,
    launchGridTicks: DEFAULT_PPQN,
  };
}
