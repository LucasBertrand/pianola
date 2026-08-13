import type {
  ClipTimeline,
  ProjectClock,
  TimeSignature,
  TransportState,
} from "../model";
import { getTicksPerMeasure } from "../model";
import { isValidTick } from "./note-validation";
import {
  assertValidationResult,
  type ValidationIssue,
  type ValidationResult,
} from "./validation-result";

export function validateTransportState(
  transport: TransportState,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (
    !isValidTick(transport.loop.startTick)
    || !isValidTick(transport.loop.endTick)
    || transport.loop.startTick >= transport.loop.endTick
  ) {
    issues.push({
      code: "INVALID_LOOP",
      path: "loop",
      message: "Loop start must be non-negative and strictly lower than loop end.",
    });
  }

  if (typeof transport.loopEnabled !== "boolean") {
    issues.push({
      code: "INVALID_LOOP",
      path: "loopEnabled",
      message: "Loop enabled state must be a boolean.",
    });
  }

  if (!isValidTick(transport.anchorTick)) {
    issues.push({
      code: "INVALID_TRANSPORT_ANCHOR",
      path: "anchorTick",
      message: "Transport anchor tick must be non-negative and finite.",
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateProjectClock(clock: ProjectClock): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!Number.isFinite(clock.tempoBpm) || clock.tempoBpm <= 0) {
    issues.push({
      code: "INVALID_BPM",
      path: "tempoBpm",
      message: "Project tempo must be a positive finite number.",
    });
  }

  if (!Number.isSafeInteger(clock.ppqn) || clock.ppqn <= 0) {
    issues.push({
      code: "INVALID_PPQN",
      path: "ppqn",
      message: "Project PPQN must be a positive safe integer.",
    });
  }

  if (!Number.isSafeInteger(clock.launchGridTicks) || clock.launchGridTicks <= 0) {
    issues.push({
      code: "INVALID_PPQN",
      path: "launchGridTicks",
      message: "Launch grid must be a positive safe integer number of ticks.",
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateClipTimeline(
  timeline: ClipTimeline,
  clock: ProjectClock,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const segments = timeline.meterMap.segments;

  if (!Number.isSafeInteger(timeline.durationTicks) || timeline.durationTicks <= 0) {
    issues.push({
      code: "INVALID_PROJECT_DURATION",
      path: "durationTicks",
      message: "Clip duration must be a positive safe integer number of ticks.",
    });
  }

  if (segments.length === 0 || segments[0]?.startTick !== 0) {
    issues.push({
      code: "INVALID_TIME_SIGNATURE",
      path: "meterMap.segments",
      message: "A meter map must start with a segment at tick 0.",
    });
  }

  let previousStartTick = -1;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment === undefined) {
      continue;
    }

    if (
      !isValidTick(segment.startTick)
      || segment.startTick <= previousStartTick
      || segment.startTick >= timeline.durationTicks
    ) {
      issues.push({
        code: "INVALID_TIME_SIGNATURE",
        path: `meterMap.segments[${String(index)}].startTick`,
        message: "Meter segments must be strictly ordered within the clip duration.",
      });
    }

    if (!isValidTimeSignature(segment.timeSignature)) {
      issues.push({
        code: "INVALID_TIME_SIGNATURE",
        path: `meterMap.segments[${String(index)}].timeSignature`,
        message: "Time signature must have a positive numerator and a supported denominator.",
      });
    } else {
      const measureTicks = getTicksPerMeasure(clock, segment.timeSignature);

      if (!Number.isSafeInteger(measureTicks) || measureTicks <= 0) {
        issues.push({
          code: "INVALID_PROJECT_DURATION",
          path: `meterMap.segments[${String(index)}].timeSignature`,
          message: "Meter resolution must produce a positive safe integer measure.",
        });
      }
    }

    previousStartTick = segment.startTick;
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function assertValidTransportState(transport: TransportState): void {
  assertValidationResult(validateTransportState(transport));
}

export function assertValidProjectClock(clock: ProjectClock): void {
  assertValidationResult(validateProjectClock(clock));
}

export function assertValidClipTimeline(
  timeline: ClipTimeline,
  clock: ProjectClock,
): void {
  assertValidationResult(validateClipTimeline(timeline, clock));
}

function isValidTimeSignature(timeSignature: TimeSignature): boolean {
  return Number.isSafeInteger(timeSignature.numerator)
    && timeSignature.numerator > 0
    && [1, 2, 4, 8, 16, 32].includes(timeSignature.denominator);
}
