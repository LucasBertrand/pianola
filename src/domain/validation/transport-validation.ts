import {
  type ClipTimeline,
} from "../clips/clip";
import {
  type ProjectClock,
  type TransportState,
} from "../transport/transport";
import {
  getTicksPerMeasure,
  type ScaleMarker,
  type TempoMarker,
  type TimeSignature,
} from "../transport/time-map";
import { PROJECT_CONSTANTS } from "../../config/domain-limits";
import { TONAL_SNAP_CONSTANTS } from "../../config/music-config";
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

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateProjectClock(clock: ProjectClock): ValidationResult {
  const issues: ValidationIssue[] = [];

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

  if (!Number.isSafeInteger(timeline.durationTicks) || timeline.durationTicks <= 0) {
    issues.push({
      code: "INVALID_PROJECT_DURATION",
      path: "durationTicks",
      message: "Clip duration must be a positive safe integer number of ticks.",
    });
  }

  validateMeterMarkers(timeline, clock, issues);
  validateTempoMarkers(timeline, issues);
  validateScaleMarkers(timeline, issues);

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

function validateMeterMarkers(
  timeline: ClipTimeline,
  clock: ProjectClock,
  issues: ValidationIssue[],
): void {
  const markers = timeline.timeMap.meterMarkers;
  const path = "timeMap.meterMarkers";

  if (markers.length === 0 || markers[0]?.startTick !== 0) {
    issues.push({
      code: "INVALID_TIME_SIGNATURE",
      path,
      message: "Meter markers must start with a marker at tick 0.",
    });
    return;
  }

  let allSignaturesValid = true;

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];

    if (marker === undefined) {
      continue;
    }

    if (
      !isValidTick(marker.startTick)
      || (index > 0
        && marker.startTick <= (markers[index - 1]?.startTick ?? -1))
      || marker.startTick >= timeline.durationTicks
    ) {
      issues.push({
        code: "INVALID_TIME_SIGNATURE",
        path: `${path}[${String(index)}].startTick`,
        message: "Meter markers must be strictly ordered within the clip duration.",
      });
    }

    if (!isValidTimeSignature(marker.timeSignature)) {
      allSignaturesValid = false;
      issues.push({
        code: "INVALID_TIME_SIGNATURE",
        path: `${path}[${String(index)}].timeSignature`,
        message: "Time signature must have a positive numerator, a supported denominator and beat groups summing to the numerator.",
      });
    } else {
      const measureTicks = getTicksPerMeasure(
        clock.ppqn,
        marker.timeSignature,
      );

      if (!Number.isSafeInteger(measureTicks) || measureTicks <= 0) {
        allSignaturesValid = false;
        issues.push({
          code: "INVALID_PROJECT_DURATION",
          path: `${path}[${String(index)}].timeSignature`,
          message: "Meter resolution must produce a positive safe integer measure.",
        });
      }
    }
  }

  if (!allSignaturesValid) {
    return;
  }

  validateMeterMarkerBoundaries(timeline, clock, issues);
}

function validateMeterMarkerBoundaries(
  timeline: ClipTimeline,
  clock: ProjectClock,
  issues: ValidationIssue[],
): void {
  const markers = timeline.timeMap.meterMarkers;
  let boundaryTick = 0;
  let activeSignature = markers[0]?.timeSignature;

  if (activeSignature === undefined) {
    return;
  }

  for (let index = 1; index < markers.length; index += 1) {
    const marker = markers[index];

    if (marker === undefined) {
      continue;
    }

    while (boundaryTick < marker.startTick) {
      boundaryTick += getTicksPerMeasure(clock.ppqn, activeSignature);
    }

    if (boundaryTick !== marker.startTick) {
      issues.push({
        code: "INVALID_TIME_SIGNATURE",
        path: `timeMap.meterMarkers[${String(index)}].startTick`,
        message: "A meter marker must start on a measure boundary determined by the previous meter.",
      });
    }

    activeSignature = marker.timeSignature;
  }

  while (boundaryTick < timeline.durationTicks) {
    boundaryTick += getTicksPerMeasure(clock.ppqn, activeSignature);
  }

  if (boundaryTick !== timeline.durationTicks) {
    issues.push({
      code: "INVALID_PROJECT_DURATION",
      path: "durationTicks",
      message: "Clip duration must end on a measure boundary.",
    });
  }
}

function validateTempoMarkers(
  timeline: ClipTimeline,
  issues: ValidationIssue[],
): void {
  const markers = timeline.timeMap.tempoMarkers;
  const path = "timeMap.tempoMarkers";

  if (markers.length === 0 || markers[0]?.startTick !== 0) {
    issues.push({
      code: "INVALID_TEMPO",
      path,
      message: "Tempo markers must start with a marker at tick 0.",
    });
    return;
  }

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];

    if (marker === undefined) {
      continue;
    }

    if (
      !isValidTick(marker.startTick)
      || (index > 0
        && marker.startTick <= (markers[index - 1]?.startTick ?? -1))
      || marker.startTick >= timeline.durationTicks
    ) {
      issues.push({
        code: "INVALID_TEMPO",
        path: `${path}[${String(index)}].startTick`,
        message: "Tempo markers must be strictly ordered within the clip duration.",
      });
    }

    if (!isValidTempoBpm(marker)) {
      issues.push({
        code: "INVALID_TEMPO",
        path: `${path}[${String(index)}].bpm`,
        message: `Tempo must stay between ${String(PROJECT_CONSTANTS.minimumTempoBpm)} and ${String(PROJECT_CONSTANTS.maximumTempoBpm)} BPM.`,
      });
    }
  }
}

function isValidTempoBpm(marker: TempoMarker): boolean {
  return Number.isFinite(marker.bpm)
    && marker.bpm >= PROJECT_CONSTANTS.minimumTempoBpm
    && marker.bpm <= PROJECT_CONSTANTS.maximumTempoBpm;
}

function validateScaleMarkers(
  timeline: ClipTimeline,
  issues: ValidationIssue[],
): void {
  const markers = timeline.timeMap.scaleMarkers;
  const path = "timeMap.scaleMarkers";

  if (markers.length === 0 || markers[0]?.startTick !== 0) {
    issues.push({
      code: "INVALID_SCALE",
      path,
      message: "Scale markers must start with a marker at tick 0.",
    });
    return;
  }

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];

    if (marker === undefined) {
      continue;
    }

    if (
      !isValidTick(marker.startTick)
      || (index > 0
        && marker.startTick <= (markers[index - 1]?.startTick ?? -1))
      || marker.startTick >= timeline.durationTicks
    ) {
      issues.push({
        code: "INVALID_SCALE",
        path: `${path}[${String(index)}].startTick`,
        message: "Scale markers must be strictly ordered within the clip duration.",
      });
    }

    if (!isValidScaleMarker(marker)) {
      issues.push({
        code: "INVALID_SCALE",
        path: `${path}[${String(index)}]`,
        message: "Scale marker tonal pattern is not supported.",
      });
    }
  }
}

function isValidScaleMarker(marker: ScaleMarker): boolean {
  if (!(TONAL_SNAP_CONSTANTS.rootOptions as readonly string[])
    .includes(marker.rootNote)) {
    return false;
  }

  if (marker.rootNote === "none") {
    return marker.patternType === "scale" && marker.patternId === "chromatic";
  }

  return marker.patternType === "scale"
    ? (TONAL_SNAP_CONSTANTS.supportedScales as readonly string[])
      .includes(marker.patternId)
    : marker.patternType === "chord"
      && (TONAL_SNAP_CONSTANTS.supportedChords as readonly string[])
        .includes(marker.patternId);
}

function isValidTimeSignature(timeSignature: TimeSignature): boolean {
  if (
    !Number.isSafeInteger(timeSignature.numerator)
    || timeSignature.numerator <= 0
    || ![1, 2, 4, 8, 16, 32].includes(timeSignature.denominator)
  ) {
    return false;
  }

  const beatGroups = timeSignature.beatGroups;

  if (beatGroups === undefined) {
    return true;
  }

  if (beatGroups.length === 0) {
    return false;
  }

  let total = 0;

  for (const group of beatGroups) {
    if (!Number.isSafeInteger(group) || group <= 0) {
      return false;
    }

    total += group;
  }

  return total === timeSignature.numerator;
}
