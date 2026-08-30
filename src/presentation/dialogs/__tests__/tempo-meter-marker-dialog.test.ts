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
  test("categorizes chord choices and displays MusicTheoryJS symbols", () => {
    const markup = renderToStaticMarkup(createElement(
      TempoMeterMarkerDialog,
      BASE_PROPS,
    ));

    expect(markup).toContain('<optgroup label="Major">');
    expect(markup).toContain('<optgroup label="Minor">');
    expect(markup).toContain('<optgroup label="Dominant">');
    expect(markup).toContain('<optgroup label="Suspended">');
    expect(markup).toContain('<optgroup label="Diminished">');
    expect(markup).toContain('<optgroup label="Augmented">');
    expect(markup).toContain('value="mM7" selected="">CmMaj7');
    expect(markup).toContain('value="sus2">Csus2');
    expect(markup).toContain('value="sus4">Csus4');
    expect(markup).toContain('value="7sus4">C7sus4');
    expect(markup).toContain('value="m13">Cm13');
    expect(markup).toContain('value="Bb">B♭');
    expect(markup).toContain('value="F#">F♯');
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
