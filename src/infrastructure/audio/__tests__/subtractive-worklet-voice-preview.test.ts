import {
  describe,
  expect,
  test,
} from "vitest";
import {
  INSTRUMENT_PARAMETER_PREVIEW_POLICY,
} from "../instrument-preview-policy";
import type {
  SubtractivePlaybackPresetSnapshot,
} from "../playback-model";
import {
  SubtractiveWorkletVoice,
} from "../worklet/subtractive-worklet-voice";

const SAMPLE_RATE = 48_000;
const INSTRUMENT_ID = "preview-test";
const BASE_CONFIG: SubtractivePlaybackPresetSnapshot = {
  kind: "subtractive",
  oscillatorWaveform: "sine",
  polyphony: 8,
  oscillatorDetuneCents: 0,
  oscillatorFreePhase: false,
  pulseWidth: 0.5,
  envelope: {
    attackSeconds: 0.001,
    decaySeconds: 0,
    sustainLevel: 1,
    releaseSeconds: 0.1,
    curve: 0,
  },
  filterCutoffHz: 20_000,
  filterResonance: 0,
  filterKeyTracking: 0,
  filterEnvelopeAmountOctaves: 0,
  filterEnvelope: {
    attackSeconds: 0.001,
    decaySeconds: 0,
    sustainLevel: 0,
    releaseSeconds: 0.1,
    curve: 0,
  },
};

describe("subtractive parameter preview policy", () => {
  test("formalizes active, next-note and restart-only parameters", () => {
    expect(INSTRUMENT_PARAMETER_PREVIEW_POLICY).toMatchObject({
      masterTuningFrequencyHz: "active-smoothed",
      oscillatorWaveform: "next-note",
      oscillatorDetuneCents: "active-smoothed",
      oscillatorFreePhase: "next-note",
      pulseWidth: "active-smoothed",
      "envelope.attackSeconds": "next-note",
      "envelope.sustainLevel": "active-smoothed",
      "filterEnvelope.attackSeconds": "next-note",
      "filterEnvelope.sustainLevel": "active-smoothed",
      kind: "processor-restart",
    });
  });

  test("smoothly retunes an already active voice", () => {
    const voice = startVoice(BASE_CONFIG);

    render(voice, 2_000);
    voice.retune(880);
    const transition = render(voice, 64);
    const settled = render(voice, SAMPLE_RATE);

    expect(countPositiveCrossings(transition)).toBeLessThan(2);
    expect(countPositiveCrossings(settled)).toBeGreaterThan(515);
    expect(countPositiveCrossings(settled)).toBeLessThan(530);
  });

  test("keeps waveform changes for the next note", () => {
    const previewed = startVoice(BASE_CONFIG);
    const unchanged = startVoice(BASE_CONFIG);

    render(previewed, 128);
    render(unchanged, 128);
    previewed.preview({ ...BASE_CONFIG, oscillatorWaveform: "square" });

    expect(render(previewed, 512)).toEqual(render(unchanged, 512));

    const nextSine = startVoice(BASE_CONFIG);
    const nextSquare = startVoice({
      ...BASE_CONFIG,
      oscillatorWaveform: "square",
    });
    expect(render(nextSquare, 256)).not.toEqual(render(nextSine, 256));
  });

  test("smooths pulse width on active voices and restores it on cancel", () => {
    const config = { ...BASE_CONFIG, oscillatorWaveform: "square" as const };
    const cancelled = startVoice(config);
    const baseline = startVoice(config);
    const retainedPreview = startVoice(config);

    render(cancelled, 128);
    render(baseline, 128);
    render(retainedPreview, 128);
    const preview = { ...config, pulseWidth: 0.05 };
    cancelled.preview(preview);
    retainedPreview.preview(preview);
    render(cancelled, 2_400);
    render(baseline, 2_400);
    render(retainedPreview, 2_400);

    cancelled.preview(config);
    const cancelledTail = render(cancelled, 9_600).slice(-1_024);
    const baselineTail = render(baseline, 9_600).slice(-1_024);
    const previewTail = render(retainedPreview, 9_600).slice(-1_024);

    expect(meanAbsoluteDifference(cancelledTail, baselineTail))
      .toBeLessThan(0.000_1);
    expect(meanAbsoluteDifference(previewTail, baselineTail))
      .toBeGreaterThan(0.05);
  });

  test("applies ADSR values according to active and next-note semantics", () => {
    const slowConfig = {
      ...BASE_CONFIG,
      envelope: {
        ...BASE_CONFIG.envelope,
        attackSeconds: 0.2,
        releaseSeconds: 0.2,
      },
    };
    const durationOnlyConfig = {
      ...slowConfig,
      envelope: {
        ...slowConfig.envelope,
        attackSeconds: 0.001,
        releaseSeconds: 0.001,
      },
    };
    const previewConfig = {
      ...durationOnlyConfig,
      envelope: {
        ...durationOnlyConfig.envelope,
        sustainLevel: 0.25,
        curve: 1,
      },
    };
    const active = startVoice(slowConfig);
    const unchanged = startVoice(slowConfig);

    active.preview(durationOnlyConfig);
    expect(render(active, 128)).toEqual(render(unchanged, 128));

    const next = startVoice(previewConfig);
    render(next, 128);
    expect(next.level).toBeCloseTo(0.25, 3);

    active.release();
    render(active, 128);
    expect(active.ended).toBe(false);
    next.release();
    render(next, 48);
    expect(next.ended).toBe(true);
  });

  test("previews filter-envelope level but not its active stage durations", () => {
    const config = {
      ...BASE_CONFIG,
      oscillatorWaveform: "square" as const,
      filterCutoffHz: 100,
      filterEnvelopeAmountOctaves: 7,
      filterEnvelope: {
        ...BASE_CONFIG.filterEnvelope,
        attackSeconds: 0.2,
        sustainLevel: 1,
      },
    };
    const durationOnly = {
      ...config,
      filterEnvelope: {
        ...config.filterEnvelope,
        attackSeconds: 0.001,
      },
    };
    const active = startVoice(config);
    const unchanged = startVoice(config);

    active.preview(durationOnly);
    expect(render(active, 256)).toEqual(render(unchanged, 256));

    active.preview({
      ...durationOnly,
      filterEnvelope: {
        ...durationOnly.filterEnvelope,
        sustainLevel: 0,
        curve: 1,
      },
    });
    expect(render(active, 2_048)).not.toEqual(render(unchanged, 2_048));
  });
});

function startVoice(
  config: SubtractivePlaybackPresetSnapshot,
): SubtractiveWorkletVoice {
  const voice = new SubtractiveWorkletVoice(SAMPLE_RATE);
  voice.start(INSTRUMENT_ID, 60, config, 440, 1, null, null);
  return voice;
}

function render(
  voice: SubtractiveWorkletVoice,
  sampleCount: number,
): number[] {
  return Array.from({ length: sampleCount }, () => voice.render());
}

function countPositiveCrossings(samples: readonly number[]): number {
  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if ((samples[index - 1] ?? 0) <= 0 && (samples[index] ?? 0) > 0) {
      crossings += 1;
    }
  }
  return crossings;
}

function meanAbsoluteDifference(
  left: readonly number[],
  right: readonly number[],
): number {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }
  return total / left.length;
}
