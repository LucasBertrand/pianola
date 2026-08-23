import type {
  ShepardMotionOptions,
} from "../../shared/shepard-motion";

export interface ClipShepardSettings extends ShepardMotionOptions {
  readonly hatchWidthPixels: number;
  readonly hatchOpacityPercent: number;
}

export interface ClipShepardCssVariables {
  readonly "--clip-shepard-angle": string;
  readonly "--clip-shepard-period": string;
  readonly "--clip-shepard-hatch-start": string;
  readonly "--clip-shepard-hatch-end": string;
  readonly "--clip-shepard-hatch-opacity": string;
}

/** Single source of truth for the clip progress motif and its movement. */
export const CLIP_SHEPARD_SETTINGS = {
  periodPixels: 28,
  speedPixelsPerSecond: 22,
  gradientAngleDegrees: 122,
  hatchWidthPixels: 8,
  hatchOpacityPercent: 14,
} as const satisfies ClipShepardSettings;

export function createClipShepardCssVariables(
  settings: ClipShepardSettings,
): ClipShepardCssVariables {
  if (
    !Number.isFinite(settings.hatchWidthPixels)
    || settings.hatchWidthPixels <= 0
    || settings.hatchWidthPixels >= settings.periodPixels
  ) {
    throw new RangeError(
      "Clip Shepard hatch width must fit inside its period.",
    );
  }
  if (
    !Number.isFinite(settings.hatchOpacityPercent)
    || settings.hatchOpacityPercent < 0
    || settings.hatchOpacityPercent > 100
  ) {
    throw new RangeError(
      "Clip Shepard hatch opacity must be between zero and one hundred.",
    );
  }

  const symmetricGapPixels = (
    settings.periodPixels - settings.hatchWidthPixels
  ) / 2;

  return {
    "--clip-shepard-angle": `${String(settings.gradientAngleDegrees)}deg`,
    "--clip-shepard-period": `${String(settings.periodPixels)}px`,
    "--clip-shepard-hatch-start": `${String(symmetricGapPixels)}px`,
    "--clip-shepard-hatch-end": `${String(
      symmetricGapPixels + settings.hatchWidthPixels,
    )}px`,
    "--clip-shepard-hatch-opacity": `${String(
      settings.hatchOpacityPercent,
    )}%`,
  };
}
