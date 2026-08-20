import { describe, expect, test } from "vitest";
import {
  compilePlaybackPlan,
} from "../playback-snapshot";
import { createClipPlaybackSource } from "../playback-source";
import {
  createTestProject,
  TEST_CLIP_ID,
} from "../../../tests/support/test-builders";

describe("playback plans", () => {
  test("preserves the explicit source and every meter marker", () => {
    const baseState = createTestProject();
    const baseClip = baseState.clipsById[TEST_CLIP_ID];

    expect(baseClip).toBeDefined();

    if (baseClip === undefined) {
      return;
    }

    const clip = {
      ...baseClip,
      timeline: {
        ...baseClip.timeline,
        timeMap: {
          meterMarkers: [
            {
              startTick: 0,
              timeSignature: { numerator: 4, denominator: 4 as const },
            },
            {
              startTick: 3_840,
              timeSignature: { numerator: 3, denominator: 4 as const },
            },
          ],
          tempoMarkers: [{ startTick: 0, bpm: 120 }],
          scaleMarkers: baseClip.timeline.timeMap.scaleMarkers,
        },
      },
    };
    const state = {
      ...baseState,
      clipsById: { ...baseState.clipsById, [clip.id]: clip },
    };
    const plan = compilePlaybackPlan(
      state,
      createClipPlaybackSource(clip),
    );

    expect(plan.sourceId).toBe(TEST_CLIP_ID);
    expect(Array.from(plan.tempoMap.startTicks)).toEqual([0, 3_840]);
    expect(Array.from(plan.tempoMap.startSeconds)).toEqual([0, 2]);
    expect(plan.tempoMap.timeSignatures).toEqual([
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
    ]);
  });

});
