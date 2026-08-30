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
  rootNote: "C#",
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
  test("categorizes the complete chord catalog and displays rooted Tonal symbols", () => {
    const markup = renderToStaticMarkup(createElement(
      TempoMeterMarkerDialog,
      BASE_PROPS,
    ));

    expect(markup).toContain('<optgroup label="Major">');
    expect(markup).toContain('<optgroup label="Minor">');
    expect(markup).toContain('<optgroup label="Sixths">');
    expect(markup).toContain('<optgroup label="Dominant">');
    expect(markup).toContain('<optgroup label="Suspended">');
    expect(markup).toContain('<optgroup label="Diminished">');
    expect(markup).toContain('<optgroup label="Augmented">');
    expect(markup).toContain('<option value="C#" selected="">C♯</option>');
    expect(markup).toContain('<option value="Db">D♭</option>');
    expect(markup).toContain('value="M">C♯M');
    expect(markup).toContain('value="mM7" selected="">C♯mM7');
    expect(markup).toContain('value="69">C♯69');
    expect(markup).toContain('value="7b9">C♯7♭9');
    expect(markup).toContain('value="7#9">C♯7♯9');
    expect(markup).toContain('value="sus24">C♯sus24');
    expect(markup).toContain('value="9sus4">C♯9sus4');
    expect(markup).toContain('value="13sus4">C♯13sus4');
    expect(markup).toContain('value="m13">C♯m13');
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
