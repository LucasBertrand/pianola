import {
  describe,
  expect,
  it,
} from "vitest";
import React from "react";
import {
  renderToStaticMarkup,
} from "react-dom/server";
import {
  createFilterResponsePreview,
  FilterResponseVisual,
} from "../FilterResponseVisual";

describe("filter response visual", () => {
  it("places cutoff positions on a logarithmic frequency axis", () => {
    const minimum = createFilterResponsePreview(20, 0.2);
    const midpoint = createFilterResponsePreview(Math.sqrt(20 * 20_000), 0.2);
    const maximum = createFilterResponsePreview(20_000, 0.2);

    expect(minimum.cutoffX).toBeCloseTo(8);
    expect(midpoint.cutoffX).toBeCloseTo(66);
    expect(maximum.cutoffX).toBeCloseTo(124);
  });

  it("shows a stronger peak when resonance increases", () => {
    const lowResonance = createFilterResponsePreview(1_000, 0.2);
    const highResonance = createFilterResponsePreview(1_000, 8);

    expect(highResonance.cutoffY).toBeLessThan(lowResonance.cutoffY);
    expect(highResonance.cutoffY).toBeLessThan(highResonance.zeroDecibelY);
  });

  it("keeps every sampled response inside the visual bounds", () => {
    const preview = createFilterResponsePreview(8_000, 24);

    expect(preview.points).toHaveLength(97);
    expect(preview.points.every(([x, y]) => (
      x >= 8 && x <= 124 && y >= 10 && y <= 66
    ))).toBe(true);
  });

  it("renders an accessible response curve with its cutoff marker", () => {
    const markup = renderToStaticMarkup(
      React.createElement(FilterResponseVisual, {
        cutoffHz: 8_000,
        resonance: 4.5,
      }),
    );

    expect(markup).toContain("Filter response preview: 8000 Hz cutoff");
    expect(markup).toContain('class="instrument-editor-visual-guide"');
    expect(markup).toContain('class="instrument-editor-visual-line"');
    expect(markup).toContain('class="instrument-editor-visual-node"');
  });
});
