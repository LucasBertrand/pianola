import {
  describe,
  expect,
  test,
} from "vitest";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import {
  createClipPlaybackSource,
} from "../playback-source";
import {
  compilePlaybackPlan,
} from "../playback-snapshot";
import type {
  PlaybackSnapshot,
} from "../playback-model";
import {
  WorkletTimelineEngine,
  type TimelineEngineDiagnostic,
} from "../worklet/worklet-timeline-engine";
import {
  SubtractiveWorkletVoice,
} from "../worklet/subtractive-worklet-voice";
import {
  reserveWorkletVoice,
} from "../worklet/worklet-voice-allocation";
import {
  createTransferableAudioWorkletTimeline,
} from "../worklet/create-audio-worklet-timeline";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
} from "../../../tests/support/test-builders";

const SAMPLE_RATE = 48_000;
const RENDER_QUANTUM = 128;

describe("AudioWorklet timeline engine", () => {
  test("starts notes from the sample clock without a scheduler pulse", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([
      createTestNote({
        id: "sample-locked",
        startTick: 96,
        durationTicks: 96,
      }),
    ]);
    const engine = createEngine(snapshot, diagnostics);

    engine.play(0);
    renderFrames(engine, 4_000);

    const noteStart = diagnostics.find((event) => (
      event.type === "note-start"
    ));

    expect(noteStart).toBeDefined();
    expect(noteStart?.frame).toBeGreaterThanOrEqual(2_400);
    expect(noteStart?.frame).toBeLessThanOrEqual(2_401);
  });

  test("changes tempo on the exact render-thread boundary", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([
      createTestNote({
        id: "after-tempo-change",
        startTick: 144,
        durationTicks: 48,
      }),
    ]);
    const timeline = {
      ...toTimeline(snapshot),
      tempoStartTicks: new Float64Array([0, 96]),
      tempoBpms: new Float64Array([120, 60]),
    };
    const engine = new WorkletTimelineEngine(SAMPLE_RATE, {
      onDiagnostic: (event) => diagnostics.push(event),
    });

    engine.loadTimeline(timeline, {
      loopEnabled: false,
      loop: { startTick: 0, endTick: timeline.durationTicks },
    });
    engine.play(0);
    renderFrames(engine, 5_000);

    expect(diagnostics.find((event) => event.type === "note-start"))
      .toEqual(expect.objectContaining({ frame: 4_800, tick: 144 }));
  });

  test("keeps looping while the main thread sends no messages", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([
      createTestNote({
        id: "loop-start",
        startTick: 0,
        durationTicks: 48,
      }),
    ]);
    const engine = new WorkletTimelineEngine(SAMPLE_RATE, {
      onDiagnostic: (event) => diagnostics.push(event),
    });

    engine.loadTimeline(toTimeline(snapshot), {
      loopEnabled: true,
      loop: { startTick: 0, endTick: 192 },
    });
    engine.play(0);

    // The render thread advances for three loops without any control call.
    renderFrames(engine, 14_500);

    const starts = diagnostics.filter((event) => event.type === "note-start");
    const loops = diagnostics.filter((event) => event.type === "loop");

    expect(starts.map((event) => event.frame)).toEqual([
      0,
      4_800,
      9_600,
      14_400,
    ]);
    expect(loops.map((event) => event.frame)).toEqual([
      4_800,
      9_600,
      14_400,
    ]);
  });

  test("renders finite stereo samples at maximum filter resonance", () => {
    const baseSnapshot = createSnapshotWithNotes([
      createTestNote({
        id: "resonant",
        startTick: 0,
        durationTicks: 960,
      }),
    ]);
    const instrument = baseSnapshot.instruments[0];

    expect(instrument).toBeDefined();

    if (instrument === undefined) {
      return;
    }

    const snapshot: PlaybackSnapshot = {
      ...baseSnapshot,
      instruments: [{
        ...instrument,
        instrument: {
          ...instrument.instrument,
          filterCutoffHz: 20_000,
          filterResonance: 24,
          filterEnvelopeAmountOctaves: 8,
        },
      }],
    };
    const engine = createEngine(snapshot, []);
    const left = new Float32Array(SAMPLE_RATE);
    const right = new Float32Array(SAMPLE_RATE);

    engine.play(0);
    engine.process(left, right);

    expect(left.every(Number.isFinite)).toBe(true);
    expect(right.every(Number.isFinite)).toBe(true);
    expect(left.some((sample) => sample !== 0)).toBe(true);
  });

  test("reuses the bounded voice pool under a dense note stream", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes(
      Array.from({ length: 200 }, (_, noteIndex) => createTestNote({
        id: `dense-${noteIndex}`,
        pitch: 48 + noteIndex % 24,
        startTick: noteIndex * 8,
        durationTicks: 4,
      })),
    );
    const engine = createEngine(snapshot, diagnostics);
    const left = new Float32Array(41_000);
    const right = new Float32Array(41_000);

    engine.play(0);
    engine.process(left, right);

    expect(diagnostics.filter((event) => event.type === "note-start"))
      .toHaveLength(200);
    expect(left.every(Number.isFinite)).toBe(true);
    expect(right.every(Number.isFinite)).toBe(true);
  });

  test("counts a release tail against monophonic polyphony", () => {
    const snapshot = createSnapshotWithNotes([]);
    const instrument = snapshot.instruments[0];

    expect(instrument).toBeDefined();

    if (instrument === undefined) {
      return;
    }

    const releasingVoice = new SubtractiveWorkletVoice(SAMPLE_RATE);

    releasingVoice.start(
      instrument.instrumentId,
      60,
      { ...instrument.instrument, polyphony: 1 },
      440,
      1,
      96,
      null,
    );
    releasingVoice.release();
    const voices = [releasingVoice];
    const displacedVoice = reserveWorkletVoice(
      voices,
      instrument.instrumentId,
      1,
    );

    expect(displacedVoice).toBe(releasingVoice);
    expect(voices).toHaveLength(0);
  });

  test("patches an active instrument without moving the transport", () => {
    const snapshot = createSnapshotWithNotes([
      createTestNote({
        id: "held",
        startTick: 0,
        durationTicks: 1_920,
      }),
    ]);
    const engine = createEngine(snapshot, []);
    const instrument = snapshot.instruments[0];

    expect(instrument).toBeDefined();

    if (instrument === undefined) {
      return;
    }

    engine.play(0);
    renderFrames(engine, RENDER_QUANTUM);
    const tickBeforePreview = engine.positionTick;

    engine.previewInstrument(instrument.instrumentId, {
      ...instrument.instrument,
      filterCutoffHz: 1_234,
    });

    expect(engine.positionTick).toBe(tickBeforePreview);
    expect(engine.status).toBe("playing");
  });

  test("switches a queued clip on the audio-clock boundary without stopping", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([createTestNote({
      id: "next-clip-start",
      startTick: 0,
      durationTicks: 48,
    })]);
    const firstTimeline = {
      ...toTimeline(snapshot),
      sourceId: "clip-first",
      durationTicks: 192,
      instruments: toTimeline(createSnapshotWithNotes([])).instruments,
    };
    const nextTimeline = {
      ...toTimeline(snapshot),
      sourceId: "clip-next",
      durationTicks: 192,
    };
    const transport = {
      loopEnabled: false,
      loop: { startTick: 0, endTick: 192 },
    };
    const engine = new WorkletTimelineEngine(SAMPLE_RATE, {
      onDiagnostic: (event) => diagnostics.push(event),
    });

    engine.loadTimeline(firstTimeline, transport, 10);
    engine.queueTimeline(nextTimeline, transport, 11);
    engine.play(0);
    renderFrames(engine, 4_800);

    expect(engine.status).toBe("playing");
    expect(engine.sourceId).toBe("clip-next");
    expect(engine.sequence).toBe(11);
    expect(engine.positionTick).toBe(0);
    expect(diagnostics).toContainEqual(expect.objectContaining({
      type: "clip-transition",
      frame: 4_800,
    }));
    expect(diagnostics.some((event) => event.type === "project-end"))
      .toBe(false);

    renderFrames(engine, 1);

    expect(diagnostics).toContainEqual(expect.objectContaining({
      type: "note-start",
      frame: 4_800,
      tick: 0,
    }));
  });

  test("applies pulse width previews to an active voice", () => {
    const snapshot = createSnapshotWithNotes([]);
    const instrument = snapshot.instruments[0];

    expect(instrument).toBeDefined();

    if (instrument === undefined) {
      return;
    }

    const config = {
      ...instrument.instrument,
      oscillatorWaveform: "square" as const,
      pulseWidth: 0.5,
      filterCutoffHz: 20_000,
      filterEnvelopeAmountOctaves: 0,
    };
    const previewedVoice = new SubtractiveWorkletVoice(SAMPLE_RATE);
    const unchangedVoice = new SubtractiveWorkletVoice(SAMPLE_RATE);

    for (const voice of [previewedVoice, unchangedVoice]) {
      voice.start(
        instrument.instrumentId,
        60,
        config,
        440,
        1,
        null,
        null,
      );
    }

    for (let sampleIndex = 0; sampleIndex < 128; sampleIndex += 1) {
      expect(previewedVoice.render()).toBe(unchangedVoice.render());
    }

    previewedVoice.preview({ ...config, pulseWidth: 0.2 });

    const previewedSamples = Array.from(
      { length: 128 },
      () => previewedVoice.render(),
    );
    const unchangedSamples = Array.from(
      { length: 128 },
      () => unchangedVoice.render(),
    );

    expect(previewedSamples).not.toEqual(unchangedSamples);
  });

  test("applies envelope sustain previews to an active voice", () => {
    const snapshot = createSnapshotWithNotes([]);
    const instrument = snapshot.instruments[0];

    expect(instrument).toBeDefined();

    if (instrument === undefined) {
      return;
    }

    const config = {
      ...instrument.instrument,
      oscillatorWaveform: "sine" as const,
      envelope: {
        attackSeconds: 0.001,
        decaySeconds: 0,
        sustainLevel: 1,
        releaseSeconds: 0.1,
      },
      filterCutoffHz: 20_000,
      filterEnvelopeAmountOctaves: 0,
    };
    const voice = new SubtractiveWorkletVoice(SAMPLE_RATE);

    voice.start(
      instrument.instrumentId,
      60,
      config,
      440,
      1,
      null,
      null,
    );
    for (let sampleIndex = 0; sampleIndex < 128; sampleIndex += 1) {
      voice.render();
    }

    voice.preview({
      ...config,
      envelope: { ...config.envelope, sustainLevel: 0 },
      filterEnvelope: {
        ...config.filterEnvelope,
        sustainLevel: 0,
      },
    });

    expect(Math.abs(voice.render())).toBe(0);
    expect(voice.ended).toBe(false);
  });

  test("applies filter envelope sustain previews to an active voice", () => {
    const snapshot = createSnapshotWithNotes([]);
    const instrument = snapshot.instruments[0];

    expect(instrument).toBeDefined();

    if (instrument === undefined) {
      return;
    }

    const config = {
      ...instrument.instrument,
      oscillatorWaveform: "square" as const,
      envelope: {
        attackSeconds: 0.001,
        decaySeconds: 0,
        sustainLevel: 1,
        releaseSeconds: 0.1,
      },
      filterCutoffHz: 200,
      filterEnvelopeAmountOctaves: 6,
      filterEnvelope: {
        attackSeconds: 0.001,
        decaySeconds: 0,
        sustainLevel: 1,
        releaseSeconds: 0.1,
      },
    };
    const previewedVoice = new SubtractiveWorkletVoice(SAMPLE_RATE);
    const unchangedVoice = new SubtractiveWorkletVoice(SAMPLE_RATE);

    for (const voice of [previewedVoice, unchangedVoice]) {
      voice.start(
        instrument.instrumentId,
        60,
        config,
        440,
        1,
        null,
        null,
      );
      for (let sampleIndex = 0; sampleIndex < 128; sampleIndex += 1) {
        voice.render();
      }
    }

    previewedVoice.preview({
      ...config,
      filterEnvelope: {
        ...config.filterEnvelope,
        sustainLevel: 0,
      },
    });

    const previewedSamples = Array.from(
      { length: 128 },
      () => previewedVoice.render(),
    );
    const unchangedSamples = Array.from(
      { length: 128 },
      () => unchangedVoice.render(),
    );

    expect(previewedSamples).not.toEqual(unchangedSamples);
  });

  test("finds held notes on seek through the bounded interval index", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([
      createTestNote({
        id: "expired",
        startTick: 0,
        durationTicks: 10,
        pitch: 48,
      }),
      createTestNote({
        id: "held",
        startTick: 20,
        durationTicks: 300,
        pitch: 60,
      }),
      createTestNote({
        id: "future",
        startTick: 200,
        durationTicks: 100,
        pitch: 72,
      }),
    ]);
    const engine = createEngine(snapshot, diagnostics);

    engine.play(100);
    renderFrames(engine, 1);

    expect(diagnostics.filter((event) => event.type === "note-start"))
      .toEqual([
        expect.objectContaining({
          frame: 0,
          pitch: 60,
          tick: 100,
        }),
      ]);
  });

  test("wraps an exact loop-end launch before rendering a sample", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([
      createTestNote({
        id: "loop-start",
        startTick: 48,
        durationTicks: 48,
        pitch: 64,
      }),
    ]);
    const engine = new WorkletTimelineEngine(SAMPLE_RATE, {
      onDiagnostic: (event) => diagnostics.push(event),
    });

    engine.loadTimeline(toTimeline(snapshot), {
      loopEnabled: true,
      loop: { startTick: 48, endTick: 192 },
    });
    engine.play(192);
    renderFrames(engine, 1);

    expect(diagnostics[0]).toEqual(expect.objectContaining({
      type: "note-start",
      frame: 0,
      tick: 48,
    }));
  });

  test("restarts a note held across a non-zero loop boundary", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([
      createTestNote({
        id: "crosses-loop-start",
        startTick: 0,
        durationTicks: 240,
        pitch: 64,
      }),
    ]);
    const engine = new WorkletTimelineEngine(SAMPLE_RATE, {
      onDiagnostic: (event) => diagnostics.push(event),
    });

    engine.loadTimeline(toTimeline(snapshot), {
      loopEnabled: true,
      loop: { startTick: 48, endTick: 96 },
    });
    engine.play(48);
    renderFrames(engine, 1_201);

    expect(diagnostics.filter((event) => event.type === "note-start"))
      .toEqual([
        expect.objectContaining({ frame: 0, pitch: 64, tick: 48 }),
        expect.objectContaining({ frame: 1_200, pitch: 64, tick: 48 }),
      ]);
  });

  test("does not accumulate sample drift over one thousand loops", () => {
    const loopFrames: number[] = [];
    const snapshot = createSnapshotWithNotes([]);
    const engine = new WorkletTimelineEngine(SAMPLE_RATE, {
      onDiagnostic: (event) => {
        if (event.type === "loop") {
          loopFrames.push(event.frame);
        }
      },
    });

    engine.loadTimeline(toTimeline(snapshot), {
      loopEnabled: true,
      loop: { startTick: 0, endTick: 192 },
    });
    engine.play(0);
    renderFrames(engine, 4_800_001);

    expect(loopFrames).toHaveLength(1_000);
    expect(loopFrames.at(-1)).toBe(4_800_000);
  });
});

function createEngine(
  snapshot: PlaybackSnapshot,
  diagnostics: TimelineEngineDiagnostic[],
): WorkletTimelineEngine {
  const engine = new WorkletTimelineEngine(SAMPLE_RATE, {
    onDiagnostic: (event) => diagnostics.push(event),
  });
  const project = createTestProject();

  engine.loadTimeline(
    toTimeline(snapshot),
    getActiveClip(project).transportSettings,
  );
  return engine;
}

function toTimeline(snapshot: PlaybackSnapshot) {
  return createTransferableAudioWorkletTimeline(snapshot).timeline;
}

function createSnapshotWithNotes(
  notes: ReturnType<typeof createTestNote>[],
): PlaybackSnapshot {
  const project = createTestProject({
    clips: [{
      id: TEST_CLIP_ID,
      notes,
    }],
  });

  return compilePlaybackPlan(
    project,
    createClipPlaybackSource(getActiveClip(project)),
  );
}

function renderFrames(
  engine: WorkletTimelineEngine,
  frameCount: number,
): void {
  let renderedFrames = 0;

  while (renderedFrames < frameCount) {
    const quantumFrames = Math.min(
      RENDER_QUANTUM,
      frameCount - renderedFrames,
    );

    engine.process(
      new Float32Array(quantumFrames),
      new Float32Array(quantumFrames),
    );
    renderedFrames += quantumFrames;
  }
}
