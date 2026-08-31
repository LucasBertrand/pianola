import {
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  getActiveClip,
} from "../../../domain/project/project-document";
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
  createTransferableInstrumentEvents,
  createTransferableAudioWorkletTimeline,
} from "../worklet/create-audio-worklet-timeline";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
} from "../../../../tests/support/test-builders";

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

  test("composes a tempo preview over the latest published tempo", () => {
    const snapshot = createSnapshotWithNotes([]);
    const timeline = toTimeline(snapshot);
    const engine = new WorkletTimelineEngine(SAMPLE_RATE);
    const transport = {
      loopEnabled: false,
      loop: { startTick: 0, endTick: timeline.durationTicks },
    };

    engine.loadTimeline(timeline, transport, 7, 0);
    engine.play(0);
    renderFrames(engine, 2_400);
    const tickBeforePreview = engine.positionTick;

    engine.previewTempoMap(
      timeline.sourceId,
      7,
      1,
      new Float64Array([0]),
      new Float64Array([60]),
    );

    expect(engine.positionTick).toBe(tickBeforePreview);
    renderFrames(engine, 2_400);
    expect(engine.positionTick - tickBeforePreview).toBeCloseTo(48, 8);

    engine.updateTransport(transport, {
      ppqn: timeline.ppqn,
      durationTicks: timeline.durationTicks,
      tempoStartTicks: new Float64Array([0]),
      tempoBpms: new Float64Array([180]),
    }, 7, 1);
    const tickBeforePublishedUpdate = engine.positionTick;

    renderFrames(engine, 2_400);
    expect(engine.positionTick - tickBeforePublishedUpdate)
      .toBeCloseTo(48, 8);

    engine.previewTempoMap(timeline.sourceId, 7, 2, null, null);
    const tickBeforeClear = engine.positionTick;

    renderFrames(engine, 2_400);
    expect(engine.positionTick - tickBeforeClear).toBeCloseTo(144, 8);

    engine.previewTempoMap(
      timeline.sourceId,
      7,
      1,
      new Float64Array([0]),
      new Float64Array([30]),
    );
    const tickBeforeStaleMessage = engine.positionTick;

    renderFrames(engine, 800);
    expect(engine.positionTick - tickBeforeStaleMessage).toBeCloseTo(48, 8);
  });

  test("composes independently versioned tempo and loop previews", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([]);
    const timeline = toTimeline(snapshot);
    const engine = new WorkletTimelineEngine(SAMPLE_RATE, {
      onDiagnostic: (event) => diagnostics.push(event),
    });

    engine.loadTimeline(timeline, {
      loopEnabled: true,
      loop: { startTick: 0, endTick: 192 },
    }, 5, 0);
    engine.previewTempoMap(
      timeline.sourceId,
      5,
      10,
      new Float64Array([0]),
      new Float64Array([60]),
    );
    engine.previewLoop(
      timeline.sourceId,
      5,
      1,
      { startTick: 0, endTick: 72 },
    );
    engine.play(0);
    renderFrames(engine, 3_600);

    expect(engine.positionTick).toBeCloseTo(0, 8);
    expect(diagnostics.at(-1)?.type).toBe("loop");

    engine.previewLoop(timeline.sourceId, 5, 2, null);
    engine.previewTempoMap(
      timeline.sourceId,
      5,
      9,
      new Float64Array([0]),
      new Float64Array([180]),
    );
    renderFrames(engine, 2_400);

    expect(engine.positionTick).toBeCloseTo(48, 8);
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

  test("uses a loop preview immediately and reveals the published loop", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([]);
    const timeline = toTimeline(snapshot);
    const engine = new WorkletTimelineEngine(SAMPLE_RATE, {
      onDiagnostic: (event) => diagnostics.push(event),
    });

    engine.loadTimeline(timeline, {
      loopEnabled: true,
      loop: { startTick: 0, endTick: 192 },
    }, 3, 0);
    engine.play(0);
    renderFrames(engine, 3_600);
    engine.previewLoop(
      timeline.sourceId,
      3,
      1,
      { startTick: 0, endTick: 96 },
    );
    expect(engine.positionTick).toBeCloseTo(48, 8);

    renderFrames(engine, 1);
    expect(engine.positionTick).toBeCloseTo(48.04, 8);
    expect(diagnostics.at(-1)?.type).toBe("loop");

    engine.updateTransport({
      loopEnabled: true,
      loop: { startTick: 0, endTick: 240 },
    }, {
      ppqn: timeline.ppqn,
      durationTicks: timeline.durationTicks,
      tempoStartTicks: timeline.tempoStartTicks,
      tempoBpms: timeline.tempoBpms,
    }, 3, 1);
    engine.previewLoop(timeline.sourceId, 3, 2, null);
    renderFrames(engine, 3_000);

    expect(engine.positionTick).toBeCloseTo(168.04, 8);

    engine.previewLoop(
      timeline.sourceId,
      3,
      1,
      { startTick: 0, endTick: 60 },
    );
    renderFrames(engine, 100);
    expect(engine.positionTick).toBeCloseTo(172.04, 8);
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

  test("keeps sounding voices when a future note is edited", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([
      createTestNote({
        id: "held",
        pitch: 60,
        startTick: 0,
        durationTicks: 1_920,
      }),
      createTestNote({
        id: "future",
        pitch: 72,
        startTick: 960,
        durationTicks: 240,
      }),
    ]);
    const replacement = createSnapshotWithNotes([
      createTestNote({
        id: "held",
        pitch: 60,
        startTick: 0,
        durationTicks: 1_920,
      }),
      createTestNote({
        id: "future",
        pitch: 72,
        startTick: 1_200,
        durationTicks: 240,
      }),
    ]);
    const instrument = replacement.instruments[0];
    const engine = createEngine(snapshot, diagnostics);

    expect(instrument).toBeDefined();
    if (instrument === undefined) return;

    engine.play(120);
    renderFrames(engine, RENDER_QUANTUM);
    const diagnosticCount = diagnostics.length;
    const start = vi.spyOn(SubtractiveWorkletVoice.prototype, "start");

    engine.replaceInstrumentEvents(
      instrument.instrumentId,
      createTransferableInstrumentEvents(instrument).events,
      0,
      1,
    );

    expect(diagnostics).toHaveLength(diagnosticCount);
    expect(start).not.toHaveBeenCalled();
    start.mockRestore();
  });

  test("updates a sounding note without restarting its envelope", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([createTestNote({
      id: "edited-held",
      pitch: 60,
      startTick: 0,
      durationTicks: 1_920,
    })]);
    const replacement = createSnapshotWithNotes([createTestNote({
      id: "edited-held",
      pitch: 67,
      startTick: 0,
      durationTicks: 2_400,
    })]);
    const instrument = replacement.instruments[0];
    const engine = createEngine(snapshot, diagnostics);

    expect(instrument).toBeDefined();
    if (instrument === undefined) return;

    engine.play(120);
    renderFrames(engine, RENDER_QUANTUM);
    const diagnosticCount = diagnostics.length;
    const reconcile = vi.spyOn(
      SubtractiveWorkletVoice.prototype,
      "reconcileTimelineEvent",
    );

    engine.replaceInstrumentEvents(
      instrument.instrumentId,
      createTransferableInstrumentEvents(instrument).events,
      0,
      1,
    );

    expect(diagnostics).toHaveLength(diagnosticCount);
    expect(reconcile).toHaveBeenCalledWith(67, 440, 2_400);
    reconcile.mockRestore();
  });

  test("releases only a sounding note removed from an instrument", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const retained = createTestNote({
      id: "retained",
      pitch: 60,
      startTick: 0,
      durationTicks: 1_920,
    });
    const removed = createTestNote({
      id: "removed",
      pitch: 67,
      startTick: 0,
      durationTicks: 1_920,
    });
    const snapshot = createSnapshotWithNotes([retained, removed]);
    const replacement = createSnapshotWithNotes([retained]);
    const instrument = replacement.instruments[0];
    const engine = createEngine(snapshot, diagnostics);

    expect(instrument).toBeDefined();
    if (instrument === undefined) return;

    engine.play(120);
    renderFrames(engine, RENDER_QUANTUM);
    const release = vi.spyOn(SubtractiveWorkletVoice.prototype, "release");

    engine.replaceInstrumentEvents(
      instrument.instrumentId,
      createTransferableInstrumentEvents(instrument).events,
      0,
      1,
    );

    expect(release).toHaveBeenCalledOnce();
    release.mockRestore();
  });

  test("starts only a note moved across the current playhead", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const snapshot = createSnapshotWithNotes([createTestNote({
      id: "moved-under-playhead",
      pitch: 72,
      startTick: 960,
      durationTicks: 240,
    })]);
    const replacement = createSnapshotWithNotes([createTestNote({
      id: "moved-under-playhead",
      pitch: 72,
      startTick: 48,
      durationTicks: 480,
    })]);
    const instrument = replacement.instruments[0];
    const engine = createEngine(snapshot, diagnostics);

    expect(instrument).toBeDefined();
    if (instrument === undefined) return;

    engine.play(120);
    renderFrames(engine, RENDER_QUANTUM);
    const diagnosticCount = diagnostics.length;

    engine.replaceInstrumentEvents(
      instrument.instrumentId,
      createTransferableInstrumentEvents(instrument).events,
      0,
      1,
    );

    expect(diagnostics.slice(diagnosticCount)).toEqual([
      expect.objectContaining({ type: "note-start", pitch: 72 }),
    ]);
  });

  test("retunes active voices when the master tuning timeline changes", () => {
    const snapshot = createSnapshotWithNotes([createTestNote({
      id: "retuned-held-note",
      startTick: 0,
      durationTicks: 1_920,
    })]);
    const engine = createEngine(snapshot, []);
    const retune = vi.spyOn(SubtractiveWorkletVoice.prototype, "retune");

    engine.play(0);
    renderFrames(engine, RENDER_QUANTUM);
    engine.loadTimeline({
      ...toTimeline(snapshot),
      masterTuningFrequencyHz: 480,
    }, getActiveClip(createTestProject()).transportSettings);

    expect(retune).toHaveBeenCalledWith(480);
    retune.mockRestore();
  });

  test("restores the published active parameters when preview is cancelled", () => {
    const snapshot = createSnapshotWithNotes([createTestNote({
      id: "cancelled-preview",
      startTick: 0,
      durationTicks: 1_920,
    })]);
    const instrument = snapshot.instruments[0];

    expect(instrument).toBeDefined();
    if (instrument === undefined) {
      return;
    }

    const engine = createEngine(snapshot, []);
    const preview = vi.spyOn(SubtractiveWorkletVoice.prototype, "preview");
    engine.play(0);
    renderFrames(engine, RENDER_QUANTUM);

    engine.previewInstrument(instrument.instrumentId, {
      ...instrument.instrument,
      pulseWidth: 0.05,
      filterEnvelopeAmountOctaves: 7,
    });
    engine.previewInstrument(instrument.instrumentId, null);

    expect(preview).toHaveBeenLastCalledWith(instrument.instrument);
    preview.mockRestore();
  });

  test("uses a free oscillator phase only when it is enabled", () => {
    const instrument = createSnapshotWithNotes([]).instruments[0];

    expect(instrument).toBeDefined();

    if (instrument === undefined) {
      return;
    }

    const random = vi.spyOn(Math, "random").mockReturnValue(0.25);
    const config = {
      ...instrument.instrument,
      oscillatorWaveform: "sine" as const,
      filterCutoffHz: 20_000,
      filterEnvelopeAmountOctaves: 0,
      envelope: {
        ...instrument.instrument.envelope,
        attackSeconds: 0.001,
      },
    };
    const resetVoice = new SubtractiveWorkletVoice(SAMPLE_RATE);
    const freeVoice = new SubtractiveWorkletVoice(SAMPLE_RATE);

    resetVoice.start(
      instrument.instrumentId,
      60,
      { ...config, oscillatorFreePhase: false },
      440,
      1,
      null,
      null,
    );
    freeVoice.start(
      instrument.instrumentId,
      60,
      { ...config, oscillatorFreePhase: true },
      440,
      2,
      null,
      null,
    );

    expect(resetVoice.render()).toBe(0);
    expect(Math.abs(freeVoice.render())).toBeGreaterThan(0);
    expect(random).toHaveBeenCalledOnce();
    random.mockRestore();
  });

  test("opens the filter higher for high notes with key tracking", () => {
    const instrument = createSnapshotWithNotes([]).instruments[0];

    expect(instrument).toBeDefined();

    if (instrument === undefined) {
      return;
    }

    const config = {
      ...instrument.instrument,
      oscillatorWaveform: "square" as const,
      filterCutoffHz: 200,
      filterEnvelopeAmountOctaves: 0,
      filterResonance: 0,
      envelope: {
        ...instrument.instrument.envelope,
        attackSeconds: 0.001,
        decaySeconds: 0,
        sustainLevel: 1,
      },
    };
    const fixedVoice = new SubtractiveWorkletVoice(SAMPLE_RATE);
    const trackedVoice = new SubtractiveWorkletVoice(SAMPLE_RATE);

    fixedVoice.start(
      instrument.instrumentId,
      84,
      { ...config, filterKeyTracking: 0 },
      440,
      1,
      null,
      null,
    );
    trackedVoice.start(
      instrument.instrumentId,
      84,
      { ...config, filterKeyTracking: 1 },
      440,
      2,
      null,
      null,
    );

    const fixedEnergy = Array.from(
      { length: 512 },
      () => Math.abs(fixedVoice.render()),
    ).reduce((sum, sample) => sum + sample, 0);
    const trackedEnergy = Array.from(
      { length: 512 },
      () => Math.abs(trackedVoice.render()),
    ).reduce((sum, sample) => sum + sample, 0);

    expect(trackedEnergy).toBeGreaterThan(fixedEnergy * 2);
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
        curve: 0,
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

    voice.render();
    expect(voice.level).toBeGreaterThan(0.9);
    renderVoiceFrames(voice, 4_800);
    expect(voice.level).toBeLessThan(0.001);
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
        curve: 0,
      },
      filterCutoffHz: 200,
      filterEnvelopeAmountOctaves: 6,
      filterEnvelope: {
        attackSeconds: 0.001,
        decaySeconds: 0,
        sustainLevel: 1,
        releaseSeconds: 0.1,
        curve: 0,
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

  test("rejects a stale incremental update after a preloaded clip wins the race", () => {
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const active = createSnapshotWithNotes([createTestNote({
      id: "active-note", pitch: 60, startTick: 0, durationTicks: 120,
    })]);
    const preloaded = {
      ...createSnapshotWithNotes([createTestNote({
        id: "preloaded-note", pitch: 72, startTick: 0, durationTicks: 120,
      })]),
      sourceId: "preloaded-clip",
    };
    const project = createTestProject();
    const transport = getActiveClip(project).transportSettings;
    const engine = new WorkletTimelineEngine(SAMPLE_RATE, {
      onDiagnostic: (event) => diagnostics.push(event),
    });
    engine.loadTimeline(toTimeline(active), transport, 10, 10);
    engine.queueTimeline(toTimeline(preloaded), transport, 11, 11);
    engine.play(active.durationTicks - 0.01);
    renderFrames(engine, 2);
    expect(engine.sourceId).toBe("preloaded-clip");

    engine.loadTimeline(toTimeline(active), transport, 10, 12);
    expect(engine.sourceId).toBe("preloaded-clip");

    const activeInstrument = active.instruments[0];
    expect(activeInstrument).toBeDefined();
    if (activeInstrument === undefined) return;
    const staleEvents = createTransferableInstrumentEvents(activeInstrument).events;
    engine.replaceInstrumentEvents(activeInstrument.instrumentId, staleEvents,
      10, 12);

    const diagnosticCount = diagnostics.length;
    engine.seek(0);
    engine.play(0);
    renderFrames(engine, 1);
    expect(diagnostics.slice(diagnosticCount).find((event) =>
      event.type === "note-start")).toEqual(expect.objectContaining({
        pitch: 72,
      }));
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

function renderVoiceFrames(
  voice: SubtractiveWorkletVoice,
  frameCount: number,
): void {
  for (let frame = 0; frame < frameCount; frame += 1) {
    voice.render();
  }
}
