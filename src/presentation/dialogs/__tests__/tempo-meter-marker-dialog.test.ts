import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  TempoMeterMarkerDialog,
  type TempoMeterMarkerDialogProps,
} from "../TempoMeterMarkerDialog";

const BASE_PROPS: TempoMeterMarkerDialogProps = {
  mode: "edit",
  tempoIncluded: false,
  meterIncluded: false,
  scaleIncluded: true,
  sectionIncluded: false,
  canChangeMarkerTypes: true,
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  rootNote: "C",
  patternType: "chord",
  patternId: "mM7",
  sectionComment: "",
  onTempoIncludedChange: () => undefined,
  onMeterIncludedChange: () => undefined,
  onScaleIncludedChange: () => undefined,
  onSectionIncludedChange: () => undefined,
  onBpmChange: () => undefined,
  onTimeSignatureChange: () => undefined,
  onRootNoteChange: () => undefined,
  onPatternTypeChange: () => undefined,
  onPatternIdChange: () => undefined,
  onSectionCommentChange: () => undefined,
  onConfirm: () => undefined,
  onCancel: () => undefined,
};

describe("TempoMeterMarkerDialog", () => {
  test("categorizes chord choices and displays Tonal symbols", () => {
    const markup = renderToStaticMarkup(createElement(
      TempoMeterMarkerDialog,
      BASE_PROPS,
    ));

    expect(markup).toContain('<optgroup label="Triads">');
    expect(markup).toContain('<optgroup label="Ninth chords">');
    expect(markup).toContain('<optgroup label="Eleventh chords">');
    expect(markup).toContain('<optgroup label="Thirteenth chords">');
    expect(markup).toContain('value="mM7" selected="">mM7 (minor/major seventh)');
    expect(markup).toContain('value="m13">m13 (minor thirteenth)');
  });

  test("categorizes scale choices", () => {
    const markup = renderToStaticMarkup(createElement(
      TempoMeterMarkerDialog,
      {
        ...BASE_PROPS,
        patternType: "scale",
        patternId: "ionian",
      },
    ));

    expect(markup).toContain('<optgroup label="Diatonic modes">');
    expect(markup).toContain('<optgroup label="Pentatonic and blues">');
    expect(markup).toContain('<optgroup label="Symmetric scales">');
  });
});
