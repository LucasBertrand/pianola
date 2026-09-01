import {
  describe,
  expect,
  test,
} from "vitest";
import {
  getActiveClip,
} from "../../../domain/project/project-document";
import {
  createClipPlaybackSource,
} from "../../../application/audio/playback-source";
import {
  compileAudioPlaybackPlan,
} from "../../../application/audio/compile-audio-playback-plan";
import type {
  AudioPlaybackPlan,
} from "../../../application/audio/audio-playback-plan";
import {
  MASTER_CEILING_GAIN,
  MASTER_HEADROOM_GAIN,
  WorkletMasterStage,
} from "../worklet/worklet-master-stage";
import {
  WorkletTimelineEngine,
  type TimelineEngineDiagnostic,
} from "../worklet/worklet-timeline-engine";
import {
  createTransferableAudioWorkletTimeline,
} from "../worklet/create-audio-worklet-timeline";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
} from "../../../../tests/support/test-builders";

const SAMPLE_RATE = 48_000;

describe("AudioWorklet master stage", () => {
  test("soft-clips immediately while keeping every output below the ceiling", () => {
    const stage = new WorkletMasterStage(SAMPLE_RATE, "soft-clipper");
    const left = new Float32Array(256).fill(4);
    const right = new Float32Array(256).fill(-4);

    processStage(stage, left, right);
    const levels = stage.readAndResetLevels();

    expect(stage.latencyFrames).toBe(0);
    expect(left[0]).not.toBe(0);
    expect(maximumAbsolute(left)).toBeLessThanOrEqual(MASTER_CEILING_GAIN);
    expect(maximumAbsolute(right)).toBeLessThanOrEqual(MASTER_CEILING_GAIN);
    expect(levels.preProtectionPeak).toBeCloseTo(4 * MASTER_HEADROOM_GAIN);
    expect(levels.peakLeft).toBeGreaterThan(0);
    expect(levels.rmsLeft).toBeGreaterThan(0);
    expect(levels.gainReductionDb).toBeGreaterThan(0);
  });

  test("uses two milliseconds of linked lookahead to stop stereo clipping", () => {
    const stage = new WorkletMasterStage(SAMPLE_RATE, "lookahead-limiter");
    const left = new Float32Array(512).fill(4);
    const right = new Float32Array(512).fill(-2);

    processStage(stage, left, right);
    const levels = stage.readAndResetLevels();

    expect(stage.latencyFrames).toBe(96);
    expect(left.slice(0, stage.latencyFrames).every((sample) => sample === 0))
      .toBe(true);
    expect(maximumAbsolute(left)).toBeLessThanOrEqual(
      MASTER_CEILING_GAIN + 1e-6,
    );
    expect(maximumAbsolute(right)).toBeLessThanOrEqual(
      MASTER_CEILING_GAIN + 1e-6,
    );
    expect(levels.gainReductionDb).toBeGreaterThan(6);
  });

  test("protects a deterministic overload of 24 voices in phase", () => {
    const instrumentIds = ["overload-a", "overload-b"];
    const notes = Array.from({ length: 24 }, (_, voiceIndex) => (
      createTestNote({
        id: `in-phase-${voiceIndex}`,
        instrumentId: voiceIndex < 12 ? "overload-a" : "overload-b",
        pitch: 60,
        startTick: 0,
        durationTicks: 960,
      })
    ));
    const project = createTestProject({
      instrumentIds,
      clips: [{ id: TEST_CLIP_ID, notes }],
    });
    const clip = getActiveClip(project);
    const compiled = compileAudioPlaybackPlan(
      project,
      createClipPlaybackSource(clip),
    );
    const snapshot: AudioPlaybackPlan = {
      ...compiled,
      masterGain: 1,
      instruments: compiled.instruments.map((instrument) => ({
        ...instrument,
        gain: 1,
        instrument: {
          ...instrument.instrument,
          oscillatorWaveform: "sine",
          oscillatorFreePhase: false,
          polyphony: 16,
          envelope: {
            ...instrument.instrument.envelope,
            attackSeconds: 0,
            decaySeconds: 0,
            sustainLevel: 1,
          },
        },
      })),
    };
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const engine = new WorkletTimelineEngine(SAMPLE_RATE, {
      onDiagnostic: (event) => diagnostics.push(event),
    });
    const outputLeft = new Float32Array(4_096);
    const outputRight = new Float32Array(4_096);

    engine.loadTimeline(
      createTransferableAudioWorkletTimeline(snapshot).timeline,
      clip.transportSettings,
    );
    engine.play(0);
    engine.process(outputLeft, outputRight);
    const levels = engine.readAndResetMasterLevels();

    expect(diagnostics.filter((event) => event.type === "note-start"))
      .toHaveLength(24);
    expect(levels.preProtectionPeak).toBeGreaterThan(1);
    expect(levels.gainReductionDb).toBeGreaterThan(0);
    expect(maximumAbsolute(outputLeft)).toBeLessThanOrEqual(
      MASTER_CEILING_GAIN + 1e-6,
    );
    expect(maximumAbsolute(outputRight)).toBeLessThanOrEqual(
      MASTER_CEILING_GAIN + 1e-6,
    );
    expect(outputLeft.every(Number.isFinite)).toBe(true);
    expect(outputRight.every(Number.isFinite)).toBe(true);
  });
});

function processStage(
  stage: WorkletMasterStage,
  left: Float32Array,
  right: Float32Array,
): void {
  for (let frameIndex = 0; frameIndex < left.length; frameIndex += 1) {
    stage.processFrame(left, right, frameIndex, 1);
  }
}

function maximumAbsolute(samples: Float32Array): number {
  let maximum = 0;

  for (const sample of samples) {
    maximum = Math.max(maximum, Math.abs(sample));
  }

  return maximum;
}
