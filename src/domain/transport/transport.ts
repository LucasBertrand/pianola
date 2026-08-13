import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import type {
  Tick,
} from "../identifiers";

export const DEFAULT_PPQN = PROJECT_CONSTANTS.ppqn;

export interface TimeSignature {
  readonly numerator: number;
  readonly denominator: 1 | 2 | 4 | 8 | 16 | 32;
}

export interface ProjectClock {
  readonly tempoBpm: number;
  readonly ppqn: number;
  readonly launchGridTicks: Tick;
}

export interface MeterMapSegment {
  readonly startTick: Tick;
  readonly timeSignature: TimeSignature;
}

export interface MeterMap {
  readonly segments: readonly MeterMapSegment[];
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
    tempoBpm: PROJECT_CONSTANTS.defaultTempoBpm,
    ppqn: DEFAULT_PPQN,
    launchGridTicks: DEFAULT_PPQN,
  };
}

export function getTicksPerMeasure(
  clock: ProjectClock,
  timeSignature: TimeSignature,
): number {
  return (
    clock.ppqn
    * 4
    * timeSignature.numerator
    / timeSignature.denominator
  );
}
