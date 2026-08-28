import {
  APPLICATION_COLORS,
} from "../../styles/application-colors";

/** Rendering budgets and colors sourced from the application theme. */
export const RENDERING_CONSTANTS = Object.freeze({
  noteLabelMinimumHeightCssPixels: 11,
  noteLabelHorizontalPaddingCssPixels: 2,
  noteLabelFontSizeCssPixels: 9,
  noteLabelColor: APPLICATION_COLORS.notes.label,
  activePitchLaneColor:
    APPLICATION_COLORS.pianoRoll.activePitchLane,
  gridBlackKeyRowColor:
    APPLICATION_COLORS.pianoRoll.blackKeyRow,
  gridAlternateMeasureColor:
    APPLICATION_COLORS.pianoRoll.alternateMeasure,
  gridPitchLineColor: APPLICATION_COLORS.pianoRoll.pitchLine,
  gridSubdivisionLineColor:
    APPLICATION_COLORS.pianoRoll.subdivisionLine,
  gridBeatLineColor: APPLICATION_COLORS.pianoRoll.beatLine,
  gridBarLineColor: APPLICATION_COLORS.pianoRoll.barLine,
  minimumGridLineSpacingCssPixels: 4,
  maximumGridLinesPerPass: 4_096,
  userInstrumentColors: APPLICATION_COLORS.notes.instrumentPalette,
} as const);
