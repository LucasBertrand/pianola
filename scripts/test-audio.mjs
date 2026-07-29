import assert from "node:assert/strict";
import {
  createServer,
} from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  root: process.cwd(),
  server: {
    middlewareMode: true,
  },
});

try {
  const {
    CommandRejectedError,
    projectReducer,
  } = await vite.ssrLoadModule("/src/domain/commands.ts");
  const {
    PROJECT_SCHEMA_VERSION,
    createDefaultMasterBusState,
    createDefaultTransportState,
  } = await vite.ssrLoadModule("/src/domain/model.ts");
  const {
    compilePlaybackSnapshot,
  } = await vite.ssrLoadModule("/src/audio/playback-snapshot.ts");
  const {
    projectTickIntoLoop,
    secondsToTick,
    tickToSeconds,
  } = await vite.ssrLoadModule("/src/audio/time-math.ts");
  const {
    DEFAULT_AUDIO_ENGINE_CONFIG,
    LookaheadScheduler,
  } = await vite.ssrLoadModule("/src/audio/lookahead-scheduler.ts");
  const {
    parseNativeProjectFile,
    serializeNativeProjectFile,
  } = await vite.ssrLoadModule(
    "/src/persistence/native-project-file.ts",
  );

  let transactionSequence = 0;

  function createVoice(voiceId, voiceIndex = 0) {
    return {
      id: voiceId,
      name: `Voice ${voiceIndex + 1}`,
      color: voiceIndex % 2 === 0 ? "#79a7ff" : "#a77bf3",
      muted: false,
      locked: false,
      solo: false,
      gain: 0.8,
      pan: 0,
      instrument: {
        kind: "subtractive",
        oscillatorWaveform: voiceIndex % 2 === 0 ? "sawtooth" : "sine",
        oscillatorDetuneCents: 0,
        envelope: {
          attackSeconds: 0.01,
          decaySeconds: 0.15,
          sustainLevel: 0.7,
          releaseSeconds: 0.3,
        },
        filterCutoffHz: 12_000,
        filterResonance: 0.2,
      },
      effects: [],
      generativeRules: [],
      interpretation: {
        transposeSemitones: 0,
        timingOffsetTicks: 0,
        gateRatio: 1,
        velocityScale: 1,
        probability: 1,
      },
    };
  }

  function createNote(
    id,
    voiceId,
    pitch,
    startTick,
    durationTicks = 120,
    velocity = 100,
  ) {
    return {
      id,
      pitch,
      startTick,
      durationTicks,
      velocity,
      voiceId,
    };
  }

  function createProject(options = {}) {
    const {
      measureCount = 4,
      notesByVoiceId = {},
      revision = 0,
      masterGain = createDefaultMasterBusState().gain,
      transport: transportChanges = {},
      voiceOrder = ["voice-a"],
    } = options;
    const defaultTransport = createDefaultTransportState();
    const transportSettings = {
      ...defaultTransport,
      ...transportChanges,
      loop: {
        ...defaultTransport.loop,
        ...transportChanges.loop,
      },
      timeSignature: {
        ...defaultTransport.timeSignature,
        ...transportChanges.timeSignature,
      },
    };
    const voicesById = {};
    const tracksByVoiceId = {};

    for (
      let voiceIndex = 0;
      voiceIndex < voiceOrder.length;
      voiceIndex += 1
    ) {
      const voiceId = voiceOrder[voiceIndex];

      if (voiceId === undefined) {
        continue;
      }

      const notes = notesByVoiceId[voiceId] ?? [];
      const notesById = {};

      for (const note of notes) {
        notesById[note.id] = note;
      }

      voicesById[voiceId] = createVoice(voiceId, voiceIndex);
      tracksByVoiceId[voiceId] = {
        voiceId,
        notesById,
      };
    }

    return {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      revision,
      title: "Audio test project",
      measureCount,
      voicesById,
      voiceOrder: [...voiceOrder],
      tracksByVoiceId,
      transportSettings,
      masterBus: {
        gain: masterGain,
      },
    };
  }

  function dispatch(state, command) {
    transactionSequence += 1;

    return projectReducer(state, {
      transactionId: `audio-test-${transactionSequence}`,
      label: command.type,
      createdAt: transactionSequence,
      commands: [command],
    });
  }

  function assertOverlapRejected(state, command) {
    assert.throws(
      () => dispatch(state, command),
      (error) => (
        error instanceof CommandRejectedError
        && error.code === "NOTE_OVERLAP"
        && error.commandType === command.type
      ),
      `${command.type} should reject a same-pitch overlap.`,
    );
  }

  function assertClose(actual, expected, tolerance = 1e-9) {
    assert.ok(
      Math.abs(actual - expected) <= tolerance,
      `Expected ${actual} to be within ${tolerance} of ${expected}.`,
    );
  }

  class FakeAudioEngine {
    constructor(configChanges = {}) {
      this.config = {
        ...DEFAULT_AUDIO_ENGINE_CONFIG,
        latencyCompensationSeconds: 0,
        ...configChanges,
      };
      this.currentTimeSeconds = 0;
      this.cancelledAt = [];
      this.cancelledFutureAt = [];
      this.configurations = [];
      this.disposed = false;
      this.events = [];
      this.resumeGate = null;
      this.resumeCount = 0;
      this.scheduleFailureAfterEventCount = null;
      this.snapshots = [];
    }

    configure(config) {
      this.config = config;
      this.configurations.push(config);
    }

    replacePlaybackSnapshot(snapshot) {
      this.snapshots.push(snapshot);
    }

    async resume() {
      this.resumeCount += 1;

      if (this.resumeGate !== null) {
        await this.resumeGate;
      }
    }

    scheduleNote(event) {
      if (
        this.scheduleFailureAfterEventCount !== null
        && this.events.length
          >= this.scheduleFailureAfterEventCount
      ) {
        throw new Error("Synthetic scheduling failure.");
      }

      this.events.push(event);
    }

    cancelAll(atAudioTimeSeconds) {
      this.cancelledAt.push(atAudioTimeSeconds);
    }

    cancelScheduledAfter(atAudioTimeSeconds) {
      this.cancelledFutureAt.push(atAudioTimeSeconds);
    }

    async dispose() {
      this.disposed = true;
    }
  }

  class FakeSchedulerTimer {
    constructor() {
      this.entries = new Map();
      this.nextHandle = 1;
    }

    setTimeout(callback, delayMilliseconds) {
      const handle = this.nextHandle;
      this.nextHandle += 1;
      this.entries.set(handle, {
        callback,
        delayMilliseconds,
      });
      return handle;
    }

    clearTimeout(handle) {
      this.entries.delete(handle);
    }

    get pendingCount() {
      return this.entries.size;
    }
  }

  const tests = [];

  function test(name, callback) {
    tests.push({
      name,
      callback,
    });
  }

  test("compiles deterministic, voice-ordered playback snapshots", () => {
    const state = createProject({
      revision: 7,
      voiceOrder: ["voice-b", "voice-a"],
      notesByVoiceId: {
        "voice-a": [
          createNote("late", "voice-a", 50, 960, 240, 80),
          createNote("high", "voice-a", 72, 240, 120, 90),
          createNote("low", "voice-a", 60, 240, 480, 110),
        ],
        "voice-b": [
          createNote("bass", "voice-b", 36, 0, 960, 100),
        ],
      },
    });
    const snapshot = compilePlaybackSnapshot(state);

    assert.equal(snapshot.projectRevision, 7);
    assert.equal(snapshot.ppqn, 960);
    assert.equal(snapshot.durationTicks, 15_360);
    assert.equal(snapshot.masterGain, 0.72);
    assert.deepEqual(
      snapshot.voices.map((voice) => voice.voiceId),
      ["voice-b", "voice-a"],
    );

    const voiceA = snapshot.voices[1];
    assert.ok(voiceA !== undefined);
    assert.deepEqual(voiceA.noteIds, ["low", "high", "late"]);
    assert.deepEqual([...voiceA.startTicks], [240, 240, 960]);
    assert.deepEqual([...voiceA.pitches], [60, 72, 50]);
    assert.deepEqual([...voiceA.durationTicks], [480, 120, 240]);
    assert.equal(voiceA.instrument.kind, "subtractive");
    assert.notEqual(
      voiceA.instrument,
      state.voicesById["voice-a"].instrument,
    );
  });

  test("updates and validates the persistent master gain", () => {
    const state = createProject();
    const updatedState = dispatch(state, {
      type: "UpdateMasterGain",
      gain: 0.35,
    });
    const unchangedState = dispatch(updatedState, {
      type: "UpdateMasterGain",
      gain: 0.35,
    });

    assert.equal(updatedState.masterBus.gain, 0.35);
    assert.equal(updatedState.revision, state.revision + 1);
    assert.equal(unchangedState, updatedState);
    assert.throws(
      () => dispatch(state, {
        type: "UpdateMasterGain",
        gain: 1.1,
      }),
      (error) => (
        error instanceof CommandRejectedError
        && error.code === "INVALID_COMMAND"
        && error.commandType === "UpdateMasterGain"
      ),
    );
  });

  test("updates subtractive waveform and envelope immutably", () => {
    const state = createProject();
    const voice = state.voicesById["voice-a"];
    const updatedState = dispatch(state, {
      type: "UpdateVoice",
      voiceId: voice.id,
      changes: {
        instrument: {
          ...voice.instrument,
          oscillatorWaveform: "square",
          envelope: {
            ...voice.instrument.envelope,
            attackSeconds: 0.42,
            sustainLevel: 0.55,
          },
        },
      },
    });

    assert.equal(
      updatedState.voicesById["voice-a"]
        .instrument.oscillatorWaveform,
      "square",
    );
    assert.equal(
      updatedState.voicesById["voice-a"]
        .instrument.envelope.attackSeconds,
      0.42,
    );
    assert.equal(
      updatedState.voicesById["voice-a"]
        .instrument.envelope.sustainLevel,
      0.55,
    );
    assert.equal(
      state.voicesById["voice-a"]
        .instrument.oscillatorWaveform,
      "sawtooth",
    );
  });

  test("round-trips master gain and migrates version two files", () => {
    const state = createProject({
      masterGain: 0.41,
    });
    const metadata = {
      documentId: "audio-test-document",
      createdAt: "2026-07-29T10:00:00.000Z",
      savedAt: "2026-07-29T10:01:00.000Z",
    };
    const serialized = serializeNativeProjectFile(state, metadata);
    const loaded = parseNativeProjectFile(serialized);

    assert.equal(loaded.projectState.masterBus.gain, 0.41);
    assert.equal(loaded.projectState.schemaVersion, 3);

    const versionTwoDocument = JSON.parse(serialized);
    versionTwoDocument.formatVersion = 2;
    versionTwoDocument.project.schemaVersion = 2;
    delete versionTwoDocument.project.masterBus;
    const migrated = parseNativeProjectFile(
      JSON.stringify(versionTwoDocument),
    );

    assert.equal(migrated.projectState.masterBus.gain, 0.72);
    assert.equal(migrated.projectState.schemaVersion, 3);
  });

  test("round-trips ticks and seconds across tempo segments", () => {
    const tempoMap = {
      startTicks: new Float64Array([0, 1_920, 3_840]),
      startSeconds: new Float64Array([0, 1, 3]),
      bpms: new Float64Array([120, 60, 180]),
      timeSignatures: [
        {
          numerator: 4,
          denominator: 4,
        },
        {
          numerator: 3,
          denominator: 4,
        },
        {
          numerator: 4,
          denominator: 4,
        },
      ],
    };

    for (const tick of [0, 120, 960, 1_920, 2_880, 3_840, 5_000]) {
      const seconds = tickToSeconds(tick, tempoMap, 960);
      assertClose(secondsToTick(seconds, tempoMap, 960), tick);
    }

    assertClose(tickToSeconds(960, tempoMap, 960), 0.5);
    assertClose(tickToSeconds(2_880, tempoMap, 960), 2);
  });

  test("projects unwrapped ticks into deterministic loop iterations", () => {
    const loop = {
      startTick: 960,
      endTick: 1_920,
    };

    assert.deepEqual(
      projectTickIntoLoop(240, loop),
      {
        tick: 240,
        iteration: 0,
      },
    );
    assert.deepEqual(
      projectTickIntoLoop(1_500, loop),
      {
        tick: 1_500,
        iteration: 0,
      },
    );
    assert.deepEqual(
      projectTickIntoLoop(1_920, loop),
      {
        tick: 960,
        iteration: 1,
      },
    );
    assert.deepEqual(
      projectTickIntoLoop(2_400, loop),
      {
        tick: 1_440,
        iteration: 1,
      },
    );
    assert.deepEqual(
      projectTickIntoLoop(3_840, loop),
      {
        tick: 960,
        iteration: 3,
      },
    );
  });

  test("rejects AddNotes overlaps against existing and batched notes", () => {
    const state = createProject({
      notesByVoiceId: {
        "voice-a": [
          createNote("existing", "voice-a", 60, 240, 480),
        ],
      },
    });

    assertOverlapRejected(state, {
      type: "AddNotes",
      trackVoiceId: "voice-a",
      notes: [
        createNote("overlap", "voice-a", 60, 0, 480),
      ],
    });
    assertOverlapRejected(createProject(), {
      type: "AddNotes",
      trackVoiceId: "voice-a",
      notes: [
        createNote("batch-a", "voice-a", 65, 0, 480),
        createNote("batch-b", "voice-a", 65, 240, 480),
      ],
    });
    assert.equal(
      Object.keys(state.tracksByVoiceId["voice-a"].notesById).length,
      1,
    );
  });

  test("rejects ResizeNotes overlaps", () => {
    const state = createProject({
      notesByVoiceId: {
        "voice-a": [
          createNote("left", "voice-a", 60, 0, 480),
          createNote("right", "voice-a", 60, 480, 240),
        ],
      },
    });

    assertOverlapRejected(state, {
      type: "ResizeNotes",
      trackVoiceId: "voice-a",
      changes: [
        {
          noteId: "right",
          startTick: 360,
          durationTicks: 240,
        },
      ],
    });
  });

  test("accepts temporal polyphony on different pitches", () => {
    const initialState = createProject({
      notesByVoiceId: {
        "voice-a": [
          createNote("root", "voice-a", 60, 0, 480),
        ],
      },
    });
    const addedState = dispatch(initialState, {
      type: "AddNotes",
      trackVoiceId: "voice-a",
      notes: [
        createNote("third", "voice-a", 64, 0, 480),
      ],
    });
    const resizedState = dispatch(addedState, {
      type: "ResizeNotes",
      trackVoiceId: "voice-a",
      changes: [
        {
          noteId: "third",
          startTick: 120,
          durationTicks: 600,
        },
      ],
    });

    assert.equal(
      Object.keys(
        resizedState.tracksByVoiceId["voice-a"].notesById,
      ).length,
      2,
    );
    assert.equal(
      resizedState.tracksByVoiceId["voice-a"]
        .notesById["third"].durationTicks,
      600,
    );
  });

  test("schedules same-time polyphony with a fake engine", async () => {
    const state = createProject({
      measureCount: 1,
      notesByVoiceId: {
        "voice-a": [
          createNote("root", "voice-a", 60, 0, 240),
          createNote("third", "voice-a", 64, 0, 240),
        ],
      },
    });
    const snapshot = compilePlaybackSnapshot(state);
    const engine = new FakeAudioEngine({
      scheduleAheadSeconds: 0.12,
    });
    const timer = new FakeSchedulerTimer();
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      state.transportSettings,
      {},
      timer,
      0,
    );

    await scheduler.play();

    assert.equal(engine.resumeCount, 1);
    assert.equal(engine.events.length, 2);
    assert.deepEqual(
      engine.events.map((event) => event.pitch),
      [60, 64],
    );
    assertClose(
      engine.events[0].startAudioTimeSeconds,
      engine.events[1].startAudioTimeSeconds,
    );
    assert.equal(timer.pendingCount, 1);

    await scheduler.dispose();
  });

  test("keeps active notes sounding while refreshing future events", async () => {
    const state = createProject({
      measureCount: 1,
      notesByVoiceId: {
        "voice-a": [
          createNote("held", "voice-a", 60, 0, 960),
          createNote("future", "voice-a", 67, 480, 120),
        ],
      },
      revision: 1,
    });
    const snapshot = compilePlaybackSnapshot(state);
    const engine = new FakeAudioEngine({
      scheduleAheadSeconds: 0.4,
    });
    const timer = new FakeSchedulerTimer();
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      state.transportSettings,
      {},
      timer,
      240,
    );

    await scheduler.play();
    const firstFutureEvent = engine.events.find(
      (event) => event.pitch === 67,
    );
    assert.ok(firstFutureEvent !== undefined);

    engine.currentTimeSeconds = 0.05;
    const refreshedState = {
      ...state,
      revision: 2,
    };
    scheduler.replacePlaybackState(
      compilePlaybackSnapshot(refreshedState),
      refreshedState.transportSettings,
    );

    const refreshedEvents = engine.events.filter(
      (event) => event.generation === 2,
    );

    assert.deepEqual(engine.cancelledFutureAt, [0.05]);
    assert.deepEqual(engine.cancelledAt, []);
    assert.equal(refreshedEvents.length, 1);
    assert.equal(refreshedEvents[0].pitch, 67);
    assertClose(
      refreshedEvents[0].startAudioTimeSeconds,
      firstFutureEvent.startAudioTimeSeconds,
    );
    assert.equal(timer.pendingCount, 1);

    scheduler.previewMasterGain(0.29);
    assert.equal(engine.config.masterGain, 0.29);
    assert.equal(engine.configurations.length, 1);
    assert.deepEqual(engine.cancelledAt, []);

    await scheduler.dispose();
  });

  test("schedules only soloed voices when solo is active", async () => {
    const state = createProject({
      measureCount: 1,
      notesByVoiceId: {
        "voice-a": [
          createNote("solo-note", "voice-a", 60, 0, 120),
        ],
        "voice-b": [
          createNote("other-note", "voice-b", 67, 0, 120),
        ],
      },
      voiceOrder: ["voice-a", "voice-b"],
    });
    const soloState = {
      ...state,
      voicesById: {
        ...state.voicesById,
        "voice-a": {
          ...state.voicesById["voice-a"],
          solo: true,
        },
      },
    };
    const snapshot = compilePlaybackSnapshot(soloState);
    const engine = new FakeAudioEngine();
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      soloState.transportSettings,
    );

    await scheduler.play();

    assert.deepEqual(
      engine.events.map((event) => event.pitch),
      [60],
    );

    await scheduler.dispose();
  });

  test("deduplicates concurrent starts and honors stop during resume", async () => {
    const state = createProject({
      measureCount: 1,
      notesByVoiceId: {
        "voice-a": [
          createNote("root", "voice-a", 60, 0, 240),
        ],
      },
    });
    const snapshot = compilePlaybackSnapshot(state);
    const engine = new FakeAudioEngine();
    const timer = new FakeSchedulerTimer();
    let releaseResume;
    const resumeGate = new Promise((resolve) => {
      releaseResume = resolve;
    });

    engine.resumeGate = resumeGate;
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      state.transportSettings,
      {},
      timer,
      0,
    );
    const firstStart = scheduler.play();
    const duplicateStart = scheduler.play();

    assert.equal(engine.resumeCount, 1);
    scheduler.stop();
    releaseResume();
    await Promise.all([firstStart, duplicateStart]);

    assert.equal(scheduler.status, "stopped");
    assert.equal(engine.events.length, 0);
    assert.equal(timer.pendingCount, 0);

    await scheduler.dispose();
  });

  test("cancels partial scheduling after an engine failure", async () => {
    const state = createProject({
      measureCount: 1,
      notesByVoiceId: {
        "voice-a": [
          createNote("root", "voice-a", 60, 0, 240),
          createNote("third", "voice-a", 64, 0, 240),
        ],
      },
    });
    const snapshot = compilePlaybackSnapshot(state);
    const engine = new FakeAudioEngine();
    const timer = new FakeSchedulerTimer();
    const reportedErrors = [];

    engine.scheduleFailureAfterEventCount = 1;
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      state.transportSettings,
      {
        onError(error) {
          reportedErrors.push(error);
        },
      },
      timer,
      0,
    );

    await assert.rejects(
      scheduler.play(),
      /Synthetic scheduling failure/,
    );
    assert.equal(scheduler.status, "stopped");
    assert.equal(engine.cancelledAt.length, 1);
    assert.equal(timer.pendingCount, 0);
    assert.equal(reportedErrors.length, 1);

    await scheduler.dispose();
  });

  test("schedules recurring loop occurrences", async () => {
    const state = createProject({
      measureCount: 1,
      notesByVoiceId: {
        "voice-a": [
          createNote("loop-note", "voice-a", 60, 0, 120),
        ],
      },
      transport: {
        loop: {
          startTick: 0,
          endTick: 480,
        },
        loopEnabled: true,
      },
    });
    const snapshot = compilePlaybackSnapshot(state);
    const engine = new FakeAudioEngine({
      scheduleAheadSeconds: 0.8,
    });
    const timer = new FakeSchedulerTimer();
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      state.transportSettings,
      {},
      timer,
      0,
    );

    await scheduler.play();

    assert.deepEqual(
      engine.events.map((event) => event.occurrenceId),
      [
        "1:0:voice-a:loop-note",
        "1:1:voice-a:loop-note",
        "1:2:voice-a:loop-note",
        "1:3:voice-a:loop-note",
      ],
    );

    for (
      let eventIndex = 1;
      eventIndex < engine.events.length;
      eventIndex += 1
    ) {
      const previousEvent = engine.events[eventIndex - 1];
      const event = engine.events[eventIndex];
      assertClose(
        event.startAudioTimeSeconds
          - previousEvent.startAudioTimeSeconds,
        0.25,
      );
    }

    await scheduler.dispose();
  });

  test("wraps playback started exactly on the loop end", async () => {
    const state = createProject({
      measureCount: 1,
      notesByVoiceId: {
        "voice-a": [
          createNote("loop-start", "voice-a", 60, 0, 120),
        ],
      },
      transport: {
        loop: {
          startTick: 0,
          endTick: 480,
        },
        loopEnabled: true,
      },
    });
    const snapshot = compilePlaybackSnapshot(state);
    const engine = new FakeAudioEngine();
    const timer = new FakeSchedulerTimer();
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      state.transportSettings,
      {},
      timer,
      480,
    );

    await scheduler.play();

    assert.equal(scheduler.getPositionTick(), 0);
    assert.equal(engine.events.length, 1);
    assert.equal(
      engine.events[0].occurrenceId,
      "1:1:voice-a:loop-start",
    );

    await scheduler.dispose();
  });

  test("cancels scheduled audio and restarts after seek", async () => {
    const state = createProject({
      measureCount: 1,
      notesByVoiceId: {
        "voice-a": [
          createNote("before-seek", "voice-a", 60, 0, 120),
          createNote("after-seek", "voice-a", 67, 960, 120),
        ],
      },
    });
    const snapshot = compilePlaybackSnapshot(state);
    const engine = new FakeAudioEngine({
      scheduleAheadSeconds: 0.2,
    });
    const timer = new FakeSchedulerTimer();
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      state.transportSettings,
      {},
      timer,
      0,
    );

    await scheduler.play();
    const eventCountBeforeSeek = engine.events.length;
    engine.currentTimeSeconds = 0.05;
    scheduler.seek(960);
    const eventsAfterSeek = engine.events.slice(eventCountBeforeSeek);

    assert.deepEqual(engine.cancelledAt, [0.05]);
    assert.equal(eventsAfterSeek.length, 1);
    assert.equal(eventsAfterSeek[0].pitch, 67);
    assert.equal(eventsAfterSeek[0].generation, 2);
    assert.equal(
      eventsAfterSeek[0].occurrenceId,
      "2:0:voice-a:after-seek",
    );
    assert.equal(timer.pendingCount, 1);

    await scheduler.dispose();
  });

  test("stops cleanly at the end of a non-looping project", async () => {
    const state = createProject({
      measureCount: 1,
      notesByVoiceId: {
        "voice-a": [
          createNote("ending", "voice-a", 60, 3_600, 240),
        ],
      },
    });
    const snapshot = compilePlaybackSnapshot(state);
    const engine = new FakeAudioEngine({
      scheduleAheadSeconds: 0.25,
    });
    const timer = new FakeSchedulerTimer();
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      state.transportSettings,
      {},
      timer,
      3_600,
    );

    await scheduler.play();
    assert.equal(scheduler.status, "playing");
    assert.equal(engine.events.length, 1);

    engine.currentTimeSeconds = 1;
    scheduler.pulse();

    assert.equal(scheduler.status, "stopped");
    assert.equal(scheduler.getPositionTick(), snapshot.durationTicks);
    assert.equal(timer.pendingCount, 0);
    assert.deepEqual(engine.cancelledAt, []);

    await scheduler.dispose();
  });

  let passedTestCount = 0;

  for (const currentTest of tests) {
    try {
      await currentTest.callback();
      passedTestCount += 1;
      console.log(`ok ${passedTestCount} - ${currentTest.name}`);
    } catch (error) {
      console.error(`not ok - ${currentTest.name}`);
      throw error;
    }
  }

  console.log(`\n${passedTestCount} audio/domain tests passed.`);
} finally {
  await vite.close();
}
