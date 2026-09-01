import { describe, expect, test } from "vitest";
import {
  SampleEnvelope,
  shapeEnvelopeProgress,
} from "../synth/envelope/sample-envelope";

describe("sample envelope curvature", () => {
  test("moves continuously from exponential through linear to logarithmic", () => {
    expect(shapeEnvelopeProgress(0, -1)).toBe(0);
    expect(shapeEnvelopeProgress(1, 1)).toBe(1);
    expect(shapeEnvelopeProgress(0.5, -1)).toBeLessThan(0.5);
    expect(shapeEnvelopeProgress(0.5, 0)).toBe(0.5);
    expect(shapeEnvelopeProgress(0.5, 1)).toBeGreaterThan(0.5);
  });

  test("still reaches exact ADSR stage targets with a curved response", () => {
    const envelope = new SampleEnvelope();

    envelope.reset({
      attackSeconds: 0.004,
      decaySeconds: 0.004,
      sustainLevel: 0.4,
      releaseSeconds: 0.004,
      curve: 0.8,
    }, 1_000);

    expect(Array.from({ length: 4 }, () => envelope.next()).at(-1)).toBe(1);
    expect(Array.from({ length: 4 }, () => envelope.next()).at(-1)).toBe(0.4);

    envelope.release();

    expect(Array.from({ length: 4 }, () => envelope.next()).at(-1)).toBe(0);
    expect(envelope.ended).toBe(true);
  });
});
