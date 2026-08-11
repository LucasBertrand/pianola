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
    countNoteEditCollisions,
    createNoteCollisionResolutionPlan,
  } = await vite.ssrLoadModule(
    "/src/domain/note-collision.ts",
  );
  const {
    SelectionTransformationError,
    transformNoteSelection,
  } = await vite.ssrLoadModule(
    "/src/domain/selection-transformations.ts",
  );
  const {
    ProjectStore,
  } = await vite.ssrLoadModule(
    "/src/domain/project-store.ts",
  );
  const {
    createEditorRuntime,
  } = await vite.ssrLoadModule(
    "/src/app/editor-runtime.ts",
  );
  const {
    EditorCommandService,
  } = await vite.ssrLoadModule(
    "/src/application/editor-command-service.ts",
  );
  const {
    EditorSelection,
  } = await vite.ssrLoadModule(
    "/src/application/editor-selection.ts",
  );
  const {
    EditorSelectionRequests,
  } = await vite.ssrLoadModule(
    "/src/application/editor-selection-requests.ts",
  );
  const {
    NoteGestureWorkflow,
  } = await vite.ssrLoadModule(
    "/src/application/note-gesture-workflow.ts",
  );
  const {
    buildDeleteNoteCommands,
    buildRepositionNoteCommands,
    buildSetNotesEnabledCommands,
  } = await vite.ssrLoadModule(
    "/src/application/note-edit-commands.ts",
  );
  const {
    buildSliceCommandsForNotes,
    canPlacePastedNotes,
    createPastedNotes,
    createInstrumentTransferPlan,
    findNotesByIds,
    getRequiredMeasureCountForNotes,
  } = await vite.ssrLoadModule(
    "/src/application/selection-edit-plans.ts",
  );
  const {
    EditingNoteMask,
  } = await vite.ssrLoadModule(
    "/src/interaction/core/editing-note-mask.ts",
  );
  const {
    createInteractionDraft,
  } = await vite.ssrLoadModule(
    "/src/interaction/core/state.ts",
  );
  const {
    PianoRollGestureStateMachine,
  } = await vite.ssrLoadModule(
    "/src/interaction/core/gesture-state-machine.ts",
  );
  const {
    buildRepositionedNotes: buildGestureRepositionedNotes,
    calculateResizeDeltaBounds,
    measureNoteSelection,
    quantizeTick,
    snapTickToCellStart,
  } = await vite.ssrLoadModule(
    "/src/interaction/core/note-gesture-math.ts",
  );
  const {
    classifyPinchZoomAxis,
    PinchViewportGesture,
  } = await vite.ssrLoadModule(
    "/src/interaction/core/pinch-viewport-gesture.ts",
  );
  const {
    TwoPointerDoubleTapGesture,
  } = await vite.ssrLoadModule(
    "/src/interaction/core/two-pointer-double-tap.ts",
  );
  const {
    constrainViewportToContent,
    getMaximumHorizontalScroll,
    getMaximumVerticalScroll,
    getMinimumHorizontalZoom,
    getMinimumVerticalZoom,
    getPagedScrollXForTick,
    getPlaybackFollowScrollX,
    getScrollXToRevealTick,
  } = await vite.ssrLoadModule(
    "/src/geometry/viewport-bounds.ts",
  );
  const {
    PianoRollInteractionSession,
  } = await vite.ssrLoadModule(
    "/src/interaction/piano-roll-interaction-session.ts",
  );
  const {
    DEFAULT_SUBTRACTIVE_SYNTH_POLYPHONY,
    PROJECT_SCHEMA_VERSION,
    createDefaultMasterBusState,
    createDefaultTransportState,
  } = await vite.ssrLoadModule("/src/domain/model.ts");
  const {
    createDefaultInstrumentPresetLibrary,
    getDefaultInstrumentPresetId,
  } = await vite.ssrLoadModule(
    "/src/domain/instrument-presets.ts",
  );
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
    WebAudioEngine,
  } = await vite.ssrLoadModule("/src/audio/web-audio-engine.ts");
  const {
    SubtractiveInstrumentRenderer,
  } = await vite.ssrLoadModule(
    "/src/audio/instruments/subtractive-instrument-renderer.ts",
  );
  const {
    countOverlappingVoiceWindows,
    findOldestOverlappingVoiceIndex,
  } = await vite.ssrLoadModule("/src/audio/voice-allocation.ts");
  const {
    parseNativeProjectFile,
    serializeNativeProjectFile,
  } = await vite.ssrLoadModule(
    "/src/persistence/native-project-file.ts",
  );
  const {
    DEFAULT_PITCH_SNAP_SETTINGS,
    getPitchScaleDegreeColorIndex,
    getScaleDegreeColorIndex,
    getScaleDegreeTriadQuality,
    getTonalPatternDefinition,
    isPitchAllowedByTonalPattern,
    snapPitchToTonalPattern,
  } = await vite.ssrLoadModule(
    "/src/music/pitch-snap.ts",
  );
  const {
    getMidiNoteLabel,
    getPreferredTonicLabel,
    getScaleDegreeLabel,
  } = await vite.ssrLoadModule(
    "/src/ui/rendering/pitch-label.ts",
  );
  const {
    resolveNoteEnvelopePeakLevel,
  } = await vite.ssrLoadModule(
    "/src/audio/note-dynamics.ts",
  );

  let transactionSequence = 0;

  function createProjectInstrument(instrumentId, instrumentIndex = 0) {
    return {
      id: instrumentId,
      name: `Instrument ${instrumentIndex + 1}`,
      color: instrumentIndex % 2 === 0 ? "#79a7ff" : "#a77bf3",
      presetId: getDefaultInstrumentPresetId(instrumentIndex),
      pan: 0,
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
    instrumentId,
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
      instrumentId,
      enabled: true,
    };
  }

  function createProject(options = {}) {
    const {
      measureCount = 4,
      notesByInstrumentId = {},
      revision = 0,
      masterGain = createDefaultMasterBusState().gain,
      masterMuted = createDefaultMasterBusState().muted,
      masterTuningFrequencyHz =
        createDefaultMasterBusState().tuningFrequencyHz,
      transport: transportChanges = {},
      instrumentOrder = ["voice-a"],
      instrumentStateChangesById = {},
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
    const projectInstrumentsById = {};
    const tracksByInstrumentId = {};
    const instrumentStatesById = {};

    for (
      let instrumentIndex = 0;
      instrumentIndex < instrumentOrder.length;
      instrumentIndex += 1
    ) {
      const instrumentId = instrumentOrder[instrumentIndex];

      if (instrumentId === undefined) {
        continue;
      }

      const notes = notesByInstrumentId[instrumentId] ?? [];
      const notesById = {};

      for (const note of notes) {
        notesById[note.id] = note;
      }

      projectInstrumentsById[instrumentId] = createProjectInstrument(instrumentId, instrumentIndex);
      tracksByInstrumentId[instrumentId] = {
        instrumentId,
        notesById,
      };
      instrumentStatesById[instrumentId] = {
        gain: 0.8,
        muted: false,
        locked: false,
        solo: false,
        ...instrumentStateChangesById[instrumentId],
      };
    }

    const clipId = "clip-test";

    const presetLibrary = createDefaultInstrumentPresetLibrary();

    return {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      revision,
      title: "Audio test project",
      projectInstrumentsById,
      instrumentOrder: [...instrumentOrder],
      instrumentPresetsById: presetLibrary.instrumentPresetsById,
      instrumentPresetOrder: presetLibrary.instrumentPresetOrder,
      clipsById: {
        [clipId]: {
          id: clipId,
          name: "Test Clip",
          measureCount,
          tracksByInstrumentId,
          instrumentStatesById,
          transportSettings,
        },
      },
      clipOrder: [clipId],
      activeClipId: clipId,
      masterBus: {
        gain: masterGain,
        muted: masterMuted,
        tuningFrequencyHz: masterTuningFrequencyHz,
      },
    };
  }

  function getActiveTestClip(state) {
    return state.clipsById[state.activeClipId];
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

  function createEditorState(overrides = {}) {
    return {
      selectedInstrumentId: "voice-a",
      selectionMode: "add",
      noteColorMode: "pitch",
      pitchPreviewEnabled: false,
      clipStatesById: {
        "clip-test": {
          playheadTick: 960,
          pitchSnapSettings: {
            ...DEFAULT_PITCH_SNAP_SETTINGS,
            enabled: true,
            visualGuideEnabled: true,
            tonicPitchClass: 2,
          },
          gridSettings: {
            baseResolutionTicks: 480,
            subdivision: "triplet",
            resolutionTicks: 320,
          },
          viewport: {
            zoomX: 1.4,
            zoomY: 1.2,
            scrollX: 240,
            scrollY: 360,
          },
        },
      },
      ...overrides,
    };
  }

  function dispatchCommands(state, commands, label) {
    transactionSequence += 1;

    return projectReducer(state, {
      transactionId: `audio-test-${transactionSequence}`,
      label,
      createdAt: transactionSequence,
      commands,
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
      this.instrumentGainPreviews = [];
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

    previewInstrumentGain(instrumentId, gain) {
      this.instrumentGainPreviews.push({
        instrumentId,
        gain,
      });
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

  test("centralizes editor transactions behind the application port", () => {
    const store = new ProjectStore(createProject());
    const commands = new EditorCommandService(store);
    const transactionIds = [];

    store.subscribe((_state, _previousState, transaction) => {
      transactionIds.push(transaction.transactionId);
    });

    const nextState = commands.dispatch(
      [{ type: "UpdateProjectTitle", title: "Refactored" }],
      "Rename project",
    );

    assert.equal(nextState.title, "Refactored");
    assert.equal(commands.getState(), nextState);
    assert.match(transactionIds[0], /^editor-\d+-1$/);
    assert.equal(commands.dispatch([], "No operation"), null);
    assert.equal(transactionIds.length, 1);
  });

  test("keeps one canonical editor selection across project revisions", () => {
    const first = createNote("first", "voice-a", 60, 0, 120);
    const second = createNote("second", "voice-a", 64, 240, 120);
    const selection = new EditorSelection();

    assert.equal(selection.add(first), true);
    assert.equal(selection.add(first), false);
    selection.add(second);
    assert.equal(selection.size, 2);
    assert.equal(selection.getSoleInstrumentId(), "voice-a");

    const movedFirst = { ...first, startTick: 480 };
    const nextState = createProject({
      notesByInstrumentId: {
        "voice-a": [movedFirst],
      },
    });

    selection.reconcile(nextState);
    assert.deepEqual(selection.copyNotes(), [movedFirst]);

    const toggleState = createProject({
      instrumentOrder: ["voice-a", "voice-b"],
      notesByInstrumentId: {
        "voice-a": [movedFirst, second],
        "voice-b": [
          createNote("third", "voice-b", 60, 720, 120),
        ],
      },
    });

    selection.toggleInstrument(toggleState, "voice-a");
    assert.equal(selection.size, 2);
    selection.toggleInstrument(toggleState, "voice-a");
    assert.equal(selection.size, 0);
    selection.togglePitch(toggleState, 60);
    assert.equal(selection.size, 2);
    selection.togglePitch(toggleState, 60);
    assert.equal(selection.size, 0);
  });

  test("delivers repeated selection intentions without signal invalidation", () => {
    const requests = new EditorSelectionRequests();
    const received = [];
    const unsubscribe = requests.subscribe((request) => {
      received.push(request);
    });

    requests.toggleInstrument("voice-a");
    requests.toggleInstrument("voice-a");
    requests.clear();
    unsubscribe();
    requests.clear();

    assert.deepEqual(received, [
      { type: "toggleInstrument", instrumentId: "voice-a" },
      { type: "toggleInstrument", instrumentId: "voice-a" },
      { type: "clear" },
    ]);
  });

  test("commits completed note gestures through one application workflow", () => {
    const selected = createNote(
      "selected",
      "voice-a",
      60,
      240,
      120,
    );
    const store = new ProjectStore(createProject({
      notesByInstrumentId: {
        "voice-a": [selected],
      },
    }));
    const commands = new EditorCommandService(store);
    const selection = new EditorSelection();
    selection.add(selected);
    const workflow = new NoteGestureWorkflow(
      commands,
      selection,
      {
        onCollision: undefined,
        onTransactionRejected: undefined,
        onSelectionChanged: undefined,
      },
    );
    const moved = {
      ...selected,
      startTick: 480,
      pitch: 62,
    };

    assert.equal(workflow.commitMove([moved]), "committed");
    assert.equal(
      getActiveTestClip(store.getState()).tracksByInstrumentId["voice-a"]
        .notesById["selected"].startTick,
      480,
    );
    assert.deepEqual(selection.copyNotes(), [
      getActiveTestClip(store.getState()).tracksByInstrumentId["voice-a"]
        .notesById["selected"],
    ]);

    assert.equal(workflow.commitResize(120, "end"), "committed");
    assert.equal(
      selection.copyNotes()[0].durationTicks,
      240,
    );

    const drawn = createNote(
      "drawn",
      "voice-a",
      67,
      720,
      120,
    );
    assert.equal(workflow.commitDraw(drawn), "committed");
    assert.deepEqual(
      selection.copyNotes().map((note) => note.id),
      ["drawn"],
    );
    assert.equal(
      workflow.commitDelete(
        selection.copyNotes(),
        "Delete selected notes",
      ),
      "committed",
    );
    assert.equal(selection.size, 0);
    assert.equal(
      getActiveTestClip(store.getState()).tracksByInstrumentId["voice-a"]
        .notesById["drawn"],
      undefined,
    );
  });

  test("defers colliding gestures and reconciles their resolution", () => {
    const existing = createNote(
      "existing",
      "voice-a",
      60,
      0,
      480,
    );
    const selected = createNote(
      "selected",
      "voice-a",
      60,
      600,
      240,
    );
    const store = new ProjectStore(createProject({
      notesByInstrumentId: {
        "voice-a": [existing, selected],
      },
    }));
    const selection = new EditorSelection();
    selection.add(selected);
    let collisionRequest = null;
    let selectionChangeCount = 0;
    const workflow = new NoteGestureWorkflow(
      new EditorCommandService(store),
      selection,
      {
        onCollision(request) {
          collisionRequest = request;
        },
        onTransactionRejected: undefined,
        onSelectionChanged() {
          selectionChangeCount += 1;
        },
      },
    );

    assert.equal(
      workflow.commitMove([{
        ...selected,
        startTick: 360,
      }]),
      "collision",
    );
    assert.equal(collisionRequest.collisionCount, 1);
    assert.equal(
      getActiveTestClip(store.getState()).tracksByInstrumentId["voice-a"]
        .notesById["selected"].startTick,
      600,
    );

    const resolvedState = createProject({
      notesByInstrumentId: {
        "voice-a": [{
          ...selected,
          startTick: 360,
        }],
      },
    });
    collisionRequest.onResolved(resolvedState, ["selected"]);
    assert.equal(selection.copyNotes()[0].startTick, 360);
    assert.equal(selectionChangeCount, 1);
  });

  test("publishes editing-mask changes and builds instrument-grouped commands", () => {
    const first = createNote("first", "voice-a", 60, 0, 120);
    const second = createNote("second", "voice-b", 64, 240, 120);
    const mask = new EditingNoteMask();
    let invalidationCount = 0;

    mask.subscribe(() => {
      invalidationCount += 1;
    });
    mask.replace([first, second]);
    assert.equal(mask.get().has("first"), true);
    mask.clear();
    mask.clear();
    assert.equal(invalidationCount, 2);
    assert.equal(buildDeleteNoteCommands([first, second]).length, 2);
    assert.equal(
      buildRepositionNoteCommands([first, second])[0].type,
      "RepositionNotes",
    );
    assert.equal(createInteractionDraft().mode, "IDLE");
  });

  test("calculates note gesture constraints without a UI runtime", () => {
    const first = createNote("first", "voice-a", 60, 120, 240);
    const second = createNote("second", "voice-a", 67, 480, 120);

    assert.deepEqual(measureNoteSelection([first, second]), {
      minimumStartTick: 120,
      maximumEndTick: 600,
      minimumPitch: 60,
      maximumPitch: 67,
    });
    assert.deepEqual(
      calculateResizeDeltaBounds(
        [first, second],
        "end",
        120,
        960,
      ),
      {
        minimumDeltaTicks: 0,
        maximumDeltaTicks: 360,
      },
    );
    assert.equal(quantizeTick(179, 120), 120);
    assert.equal(quantizeTick(181, 120), 240);
    assert.equal(snapTickToCellStart(239, 120), 120);

    const moved = buildGestureRepositionedNotes(
      [first],
      120,
      1,
      {
        ...DEFAULT_PITCH_SNAP_SETTINGS,
        enabled: true,
      },
    );

    assert.equal(moved[0].startTick, 240);
    assert.equal(moved[0].pitch, 62);
  });

  test("runs piano-roll gesture transitions without React or the DOM", () => {
    const draft = createInteractionDraft();
    const gesture = new PianoRollGestureStateMachine(draft);
    const beginPointer = (overrides = {}) => gesture.beginPointer({
      pointerId: 7,
      overlayLeft: 10,
      overlayTop: 20,
      localX: 100,
      localY: 80,
      pointerTick: 120,
      pointerPitch: 60,
      targetNoteId: null,
      snapResolutionTicks: 120,
      pitchSnapSettings: DEFAULT_PITCH_SNAP_SETTINGS,
      selectionMode: "replace",
      ...overrides,
    });

    assert.equal(beginPointer(), true);
    gesture.beginPendingLasso();
    assert.equal(
      gesture.updatePointer(7, 106, 84, 180, 60, 960, 8),
      "none",
    );
    assert.equal(gesture.isTap(8), true);
    assert.equal(
      gesture.updatePointer(7, 112, 84, 240, 60, 960, 8),
      "beginLasso",
    );
    assert.equal(draft.mode, "LASSO_SELECTING");
    assert.equal(
      gesture.updatePointer(7, 130, 90, 360, 59, 960, 8),
      "updateLasso",
    );

    gesture.reset();
    assert.equal(beginPointer(), true);
    gesture.beginDrag({
      minimumStartTick: 120,
      maximumEndTick: 600,
      minimumPitch: 60,
      maximumPitch: 67,
    });
    assert.equal(
      gesture.updatePointer(7, 400, 20, 900, 200, 960, 8),
      "updateDrag",
    );
    assert.equal(draft.deltaTicks, 360);
    assert.equal(draft.deltaPitch, 60);

    gesture.reset();
    assert.equal(beginPointer({ pointerTick: 300 }), true);
    gesture.beginResize(
      "end",
      360,
      {
        minimumStartTick: 120,
        maximumEndTick: 600,
        minimumPitch: 60,
        maximumPitch: 67,
      },
      {
        minimumDeltaTicks: 0,
        maximumDeltaTicks: 240,
      },
    );
    assert.equal(
      gesture.updatePointer(7, 500, 80, 1_000, 60, 960, 8),
      "updateResize",
    );
    assert.equal(draft.deltaTicks, 240);

    gesture.reset();
    assert.equal(beginPointer(), true);
    gesture.beginDrawing(120, 60, 120, "voice-a");
    assert.equal(
      gesture.updatePointer(7, 400, 80, 480, 60, 960, 8),
      "updateDraw",
    );
    assert.equal(draft.drawDurationTicks, 360);
    assert.equal(gesture.isPointerActive(8), false);
    assert.equal(beginPointer(), false);
    const completion = gesture.completePointer(7, 8);

    assert.equal(completion.mode, "DRAWING");
    assert.equal(completion.drawDurationTicks, 360);
    assert.equal(completion.pointerWasTap, false);
    assert.equal(draft.mode, "IDLE");
    assert.equal(gesture.completePointer(7, 8), null);
    assert.equal(beginPointer(), true);
  });

  test("keeps pinch viewport math independent from browser events", () => {
    const settings = {
      minimumDistanceCssPixels: 8,
      axisLockRatio: 1.35,
      minimumScale: 0.8,
      maximumScale: 1.25,
      scaleDeadZone: 0.004,
      maximumZoomX: 8,
      maximumZoomY: 4,
    };
    const gesture = new PinchViewportGesture(settings);
    const pointer = (pointerId, clientX, clientY) => ({
      pointerId,
      pointerType: "touch",
      clientX,
      clientY,
      button: 0,
      buttons: 1,
      shiftKey: false,
      timeStamp: 0,
    });

    assert.equal(classifyPinchZoomAxis(100, 10, 1.35), "horizontal");
    assert.equal(classifyPinchZoomAxis(10, 100, 1.35), "vertical");
    assert.equal(classifyPinchZoomAxis(100, 100, 1.35), "both");

    gesture.begin(pointer(1, 0, 0), pointer(2, 100, 10), 0, 0);
    const nextViewport = gesture.update(
      pointer(1, 0, 0),
      pointer(2, 120, 10),
      0,
      0,
      800,
      600,
      15_360,
      {
        zoomX: 1,
        zoomY: 1,
        scrollX: 0,
        scrollY: 0,
        pitchHeight: 18,
        ticksPerPixel: 10,
        devicePixelRatio: 2,
      },
    );

    assert.equal(nextViewport.zoomX > 1, true);
    assert.equal(nextViewport.zoomY, 1);
    gesture.reset();
    assert.equal(gesture.active, false);
  });

  test("recognizes only nearby consecutive two-pointer taps", () => {
    const gesture = new TwoPointerDoubleTapGesture({
      maximumDelayMs: 360,
      maximumDistanceCssPixels: 32,
    });

    assert.equal(gesture.recordTap(1_000, 100, 120), false);
    assert.equal(gesture.recordTap(1_240, 112, 128), true);
    assert.equal(gesture.recordTap(2_000, 100, 120), false);
    assert.equal(gesture.recordTap(2_200, 180, 120), false);
    gesture.reset();
    assert.equal(gesture.recordTap(3_000, 100, 120), false);
    assert.equal(gesture.recordTap(3_500, 100, 120), false);
  });

  test("derives zoom limits from the current content and viewport", () => {
    const viewport = {
      zoomX: 0.01,
      zoomY: 0.01,
      scrollX: 500,
      scrollY: 500,
      pitchHeight: 18,
      ticksPerPixel: 5,
      devicePixelRatio: 2,
    };
    const viewportWidth = 1_200;
    const viewportHeight = 720;
    const totalTicks = 61_440;
    const minimumZoomX = getMinimumHorizontalZoom(
      viewportWidth,
      totalTicks,
      viewport.ticksPerPixel,
    );
    const minimumZoomY = getMinimumVerticalZoom(
      viewportHeight,
      viewport.pitchHeight,
    );
    const constrained = constrainViewportToContent(
      viewport,
      viewportWidth,
      viewportHeight,
      totalTicks,
    );

    assert.equal(minimumZoomX, viewportWidth * 5 / totalTicks);
    assert.equal(minimumZoomY, viewportHeight / (128 * 18));
    assert.equal(constrained.zoomX, minimumZoomX);
    assert.equal(constrained.zoomY, minimumZoomY);
    assert.equal(getMaximumHorizontalScroll(
      constrained,
      viewportWidth,
      totalTicks,
    ), 0);
    assert.equal(getMaximumVerticalScroll(
      constrained,
      viewportHeight,
    ), 0);

    const longerClipMinimum = getMinimumHorizontalZoom(
      viewportWidth,
      totalTicks * 2,
      viewport.ticksPerPixel,
    );

    assert.equal(longerClipMinimum, minimumZoomX / 2);
  });

  test("pages the viewport only when playback crosses a visible edge", () => {
    const viewport = {
      zoomX: 1,
      zoomY: 1,
      scrollX: 0,
      scrollY: 0,
      pitchHeight: 18,
      ticksPerPixel: 5,
      devicePixelRatio: 1,
    };
    const viewportWidth = 800;
    const totalTicks = 12_000;

    assert.equal(
      getPagedScrollXForTick(viewport, viewportWidth, totalTicks, 3_999),
      0,
    );
    assert.equal(
      getPagedScrollXForTick(viewport, viewportWidth, totalTicks, 4_000),
      800,
    );
    assert.equal(
      getPagedScrollXForTick(viewport, viewportWidth, totalTicks, 8_000),
      1_600,
    );
    assert.equal(
      getPagedScrollXForTick(viewport, viewportWidth, totalTicks, 12_000),
      1_600,
    );
  });

  test("reveals externally moved playheads without disturbing visible ones", () => {
    const viewport = {
      zoomX: 1,
      zoomY: 1,
      scrollX: 800,
      scrollY: 0,
      pitchHeight: 18,
      ticksPerPixel: 5,
      devicePixelRatio: 1,
    };

    assert.equal(
      getScrollXToRevealTick(viewport, 800, 16_000, 5_000),
      800,
    );
    assert.equal(
      getScrollXToRevealTick(viewport, 800, 16_000, 8_500),
      1_700,
    );
    assert.equal(
      getScrollXToRevealTick(viewport, 800, 16_000, 500),
      100,
    );
  });

  test("suspends playback following during horizontal navigation", () => {
    const viewport = {
      zoomX: 1,
      zoomY: 1,
      scrollX: 800,
      scrollY: 0,
      pitchHeight: 18,
      ticksPerPixel: 5,
      devicePixelRatio: 1,
    };

    assert.equal(
      getPlaybackFollowScrollX(viewport, 800, 16_000, 8_500, true),
      800,
    );
    assert.equal(
      getPlaybackFollowScrollX(viewport, 800, 16_000, 5_000, false),
      800,
    );
    assert.equal(
      getPlaybackFollowScrollX(viewport, 800, 16_000, 8_500, false),
      1_700,
    );
  });

  test("aligns a revealed playhead deterministically after horizontal zoom", () => {
    const viewport = {
      zoomX: 2,
      zoomY: 1,
      scrollX: 800,
      scrollY: 0,
      pitchHeight: 18,
      ticksPerPixel: 5,
      devicePixelRatio: 1,
    };

    assert.equal(
      getScrollXToRevealTick(viewport, 800, 16_000, 4_000),
      800,
    );
    assert.equal(
      getScrollXToRevealTick(viewport, 800, 16_000, 4_001),
      1_600.4,
    );
  });

  test("owns a piano-roll gesture lifecycle outside React", () => {
    const initialViewport = {
      zoomX: 1,
      zoomY: 1,
      scrollX: 0,
      scrollY: 0,
      pitchHeight: 18,
      ticksPerPixel: 10,
      devicePixelRatio: 1,
    };
    const session = new PianoRollInteractionSession(
      initialViewport,
      0,
    );
    const note = createNote("selected", "voice-a", 60, 0, 120);

    session.selection.add(note);
    session.captureGestureSelection();
    session.selection.clear();
    assert.equal(
      session.restoreGestureSelectionOnce(() => true),
      true,
    );
    assert.equal(
      session.restoreGestureSelectionOnce(() => true),
      false,
    );
    assert.deepEqual(session.selection.notes, [note]);

    session.draft.mode = "DRAGGING";
    session.draft.deltaTicks = 120;
    session.resetDraft();
    assert.equal(session.draft.mode, "IDLE");
    assert.equal(session.draft.deltaTicks, 0);
    assert.equal(session.createNoteId(100), "note-100-1");
    assert.equal(session.createNoteId(100), "note-100-2");

    const movedConverter = session.synchronizeConverter(
      {
        ...initialViewport,
        scrollX: 20,
      },
      1,
    );

    assert.equal(movedConverter.tickToCssPixelX(200), 0);
  });

  test("plans selection edits without application component state", () => {
    const source = createNote("source", "voice-a", 60, 120, 240);
    const target = createNote("target", "voice-b", 64, 480, 120);
    const state = createProject({
      instrumentOrder: ["voice-a", "voice-b"],
      notesByInstrumentId: {
        "voice-a": [source],
        "voice-b": [target],
      },
    });
    const clipboard = {
      notes: [source],
      originTick: source.startTick,
    };
    const pasted = createPastedNotes(clipboard, 600, 100, 2);

    assert.equal(pasted[0].startTick, 600);
    assert.equal(pasted[0].id, "source-copy-100-2-0");
    assert.equal(canPlacePastedNotes(state, pasted), true);
    assert.deepEqual(findNotesByIds(state, ["target", "source"]), [
      target,
      source,
    ]);

    const slicePlan = buildSliceCommandsForNotes(
      [source, target],
      240,
      100,
      2,
    );

    assert.equal(slicePlan.commands.length, 1);
    assert.deepEqual(slicePlan.resultingNoteIds, [
      "source",
      "slice-100-2-0",
      "target",
    ]);

    const transferPlan = createInstrumentTransferPlan(
      state,
      [source],
      "voice-b",
    );

    assert.equal(transferPlan.valid, true);
    assert.equal(transferPlan.commands[0].type, "MoveNotes");
    assert.equal(transferPlan.proposedNotes[0].instrumentId, "voice-b");
  });

  test("extends the timeline and pastes notes as one undoable transaction", () => {
    const store = new ProjectStore(createProject({ measureCount: 1 }));
    const commands = new EditorCommandService(store);
    const pastedNote = createNote(
      "pasted",
      "voice-a",
      60,
      3_840,
      240,
    );
    const requiredMeasureCount = getRequiredMeasureCountForNotes(
      store.getState(),
      [pastedNote],
    );

    assert.equal(requiredMeasureCount, 2);
    assert.equal(canPlacePastedNotes(store.getState(), [pastedNote]), true);

    commands.dispatch(
      [
        {
          type: "AppendMeasures",
          count: requiredMeasureCount - getActiveTestClip(store.getState()).measureCount,
        },
        {
          type: "AddNotes",
          trackInstrumentId: "voice-a",
          notes: [pastedNote],
        },
      ],
      "Paste notes",
    );

    assert.equal(getActiveTestClip(store.getState()).measureCount, 2);
    assert.equal(
      getActiveTestClip(store.getState()).tracksByInstrumentId["voice-a"]
        .notesById["pasted"],
      pastedNote,
    );

    store.undo();

    assert.equal(getActiveTestClip(store.getState()).measureCount, 1);
    assert.equal(
      getActiveTestClip(store.getState()).tracksByInstrumentId["voice-a"]
        .notesById["pasted"],
      undefined,
    );
  });

  test("keeps disabled notes editable while excluding them from playback", () => {
    const note = createNote("toggle", "voice-a", 60, 0, 240);
    const store = new ProjectStore(createProject({
      notesByInstrumentId: {
        "voice-a": [note],
      },
    }));
    const commands = new EditorCommandService(store);

    commands.dispatch(
      buildSetNotesEnabledCommands([note], false),
      "Disable selected notes",
    );

    const disabledNote = getActiveTestClip(store.getState())
      .tracksByInstrumentId["voice-a"].notesById["toggle"];

    assert.equal(disabledNote.enabled, false);
    assert.deepEqual(
      compilePlaybackSnapshot(store.getState()).instruments[0].noteIds,
      [],
    );

    commands.dispatch(
      buildRepositionNoteCommands([{
        ...disabledNote,
        startTick: 480,
      }]),
      "Move disabled note",
    );

    assert.equal(
      getActiveTestClip(store.getState()).tracksByInstrumentId["voice-a"]
        .notesById["toggle"].startTick,
      480,
    );
    assert.equal(
      getActiveTestClip(store.getState()).tracksByInstrumentId["voice-a"]
        .notesById["toggle"].enabled,
      false,
    );
  });

  test("compiles deterministic, instrument-ordered playback snapshots", () => {
    const state = createProject({
      revision: 7,
      instrumentOrder: ["voice-b", "voice-a"],
      notesByInstrumentId: {
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
    assert.equal(snapshot.masterMuted, false);
    assert.deepEqual(
      snapshot.instruments.map((instrument) => instrument.instrumentId),
      ["voice-b", "voice-a"],
    );

    const instrumentA = snapshot.instruments[1];
    assert.ok(instrumentA !== undefined);
    assert.deepEqual(instrumentA.noteIds, ["low", "high", "late"]);
    assert.deepEqual([...instrumentA.startTicks], [240, 240, 960]);
    assert.deepEqual([...instrumentA.pitches], [60, 72, 50]);
    assert.deepEqual([...instrumentA.durationTicks], [480, 120, 240]);
    assert.equal(instrumentA.instrument.kind, "subtractive");
    assert.equal(
      instrumentA.instrument.polyphony,
      DEFAULT_SUBTRACTIVE_SYNTH_POLYPHONY,
    );
    assert.notEqual(
      instrumentA.instrument,
      state.instrumentPresetsById[
        state.projectInstrumentsById["voice-a"].presetId
      ].config,
    );
    assert.equal(instrumentA.instrument.pulseWidth, 0.5);
    assert.equal(instrumentA.instrument.filterEnvelopeAmountOctaves, 0.25);
    assert.equal(Object.isFrozen(instrumentA.instrument), true);
    assert.equal(Object.isFrozen(instrumentA.instrument.envelope), true);
    assert.equal(Object.isFrozen(instrumentA.instrument.filterEnvelope), true);
  });

  test("renders pulse width and filter modulation from the subtractive snapshot", () => {
    const baseSnapshot = compilePlaybackSnapshot(createProject());
    const baseInstrument = baseSnapshot.instruments[0];
    const parameterEvents = [];
    const oscillators = [];
    const filters = [];
    let periodicWaveCount = 0;
    const createAudioParam = (value) => ({
      value,
      cancelScheduledValues(time) {
        parameterEvents.push(["cancel", time]);
      },
      setValueAtTime(nextValue, time) {
        this.value = nextValue;
        parameterEvents.push(["set", nextValue, time]);
      },
      setTargetAtTime(nextValue, time, constant) {
        this.value = nextValue;
        parameterEvents.push(["target", nextValue, time, constant]);
      },
    });
    const context = {
      currentTime: 0,
      sampleRate: 48_000,
      createOscillator() {
        const oscillator = {
          type: "sine",
          frequency: createAudioParam(440),
          detune: createAudioParam(0),
          periodicWave: null,
          setPeriodicWave(periodicWave) {
            this.periodicWave = periodicWave;
          },
          connect() {},
          disconnect() {},
          start() {},
          stop() {},
          onended: null,
        };

        oscillators.push(oscillator);
        return oscillator;
      },
      createBiquadFilter() {
        const filter = {
          type: "allpass",
          frequency: createAudioParam(350),
          Q: createAudioParam(1),
          connect() {},
          disconnect() {},
        };

        filters.push(filter);
        return filter;
      },
      createGain() {
        return {
          gain: createAudioParam(1),
          connect() {},
          disconnect() {},
        };
      },
      createPeriodicWave() {
        periodicWaveCount += 1;
        return { id: periodicWaveCount };
      },
    };
    const playbackInstrument = {
      ...baseInstrument,
      instrument: {
        ...baseInstrument.instrument,
        oscillatorWaveform: "square",
        pulseWidth: 0.25,
        filterCutoffHz: 1_000,
        filterEnvelopeAmountOctaves: 2,
      },
    };
    const renderer = new SubtractiveInstrumentRenderer();
    const schedule = (occurrenceId) => renderer.schedule({
      context,
      destination: {},
      event: {
        occurrenceId,
        generation: 1,
        instrument: playbackInstrument,
        pitch: 60,
        velocity: 100,
        startAudioTimeSeconds: 1,
        endAudioTimeSeconds: 2,
      },
      startAudioTimeSeconds: 1,
      noteEndAudioTimeSeconds: 2,
      tuningFrequencyHz: 440,
      releaseTailSeconds: 2,
      onEnded() {},
    });

    schedule("pulse-a");
    schedule("pulse-b");

    assert.equal(periodicWaveCount, 1);
    assert.equal(oscillators[0].periodicWave.id, 1);
    assert.equal(filters[0].type, "lowpass");
    assert.ok(parameterEvents.some(
      ([kind, value]) => kind === "target" && value === 4_000,
    ));
  });

  test("keeps a zero-sustain envelope silent until note-off", () => {
    const baseSnapshot = compilePlaybackSnapshot(createProject());
    const baseInstrument = baseSnapshot.instruments[0];
    const amplitudeEvents = [];
    const createAudioParam = (value, events = undefined) => ({
      value,
      cancelScheduledValues(time) {
        events?.push(["cancel", time]);
      },
      setValueAtTime(nextValue, time) {
        this.value = nextValue;
        events?.push(["set", nextValue, time]);
      },
      setTargetAtTime(nextValue, time, constant) {
        this.value = nextValue;
        events?.push(["target", nextValue, time, constant]);
      },
    });
    const context = {
      currentTime: 0,
      sampleRate: 48_000,
      createOscillator() {
        return {
          type: "sine",
          frequency: createAudioParam(440),
          detune: createAudioParam(0),
          connect() {},
          disconnect() {},
          start() {},
          stop() {},
          onended: null,
        };
      },
      createBiquadFilter() {
        return {
          type: "allpass",
          frequency: createAudioParam(350),
          Q: createAudioParam(1),
          connect() {},
          disconnect() {},
        };
      },
      createGain() {
        return {
          gain: createAudioParam(1, amplitudeEvents),
          connect() {},
          disconnect() {},
        };
      },
    };
    const playbackInstrument = {
      ...baseInstrument,
      instrument: {
        ...baseInstrument.instrument,
        envelope: {
          attackSeconds: 0,
          decaySeconds: 0,
          sustainLevel: 0,
          releaseSeconds: 2,
        },
        filterEnvelope: {
          attackSeconds: 0,
          decaySeconds: 0,
          sustainLevel: 0,
          releaseSeconds: 2,
        },
      },
    };
    const renderer = new SubtractiveInstrumentRenderer();

    renderer.schedule({
      context,
      destination: {},
      event: {
        occurrenceId: "zero-sustain",
        generation: 1,
        instrument: playbackInstrument,
        pitch: 60,
        velocity: 100,
        startAudioTimeSeconds: 1,
        endAudioTimeSeconds: 2,
      },
      startAudioTimeSeconds: 1,
      noteEndAudioTimeSeconds: 2,
      tuningFrequencyHz: 440,
      releaseTailSeconds: 2,
      onEnded() {},
    });

    const noteOffValues = amplitudeEvents
      .filter(([kind, , time]) => kind === "set" && time === 2)
      .map(([, value]) => value);

    assert.ok(noteOffValues.length > 0);
    assert.ok(noteOffValues.every((value) => value === 0));
  });

  test("delegates instrument rendering while retaining shared audio buses", async () => {
    const snapshot = compilePlaybackSnapshot(createProject());
    const gainNodes = [];
    const panNodes = [];
    const createAudioParam = (value) => ({
      value,
      cancelAndHoldAtTime() {},
      cancelScheduledValues() {},
      linearRampToValueAtTime(nextValue) {
        this.value = nextValue;
      },
      setValueAtTime(nextValue) {
        this.value = nextValue;
      },
    });
    const createNode = (parameterName, initialValue, collection) => {
      const node = {
        [parameterName]: createAudioParam(initialValue),
        connections: [],
        connect(destination) {
          this.connections.push(destination);
        },
        disconnect() {
          this.connections.length = 0;
        },
      };

      collection.push(node);
      return node;
    };
    const context = {
      currentTime: 2,
      state: "running",
      sampleRate: 48_000,
      destination: {},
      createGain() {
        return createNode("gain", 1, gainNodes);
      },
      createStereoPanner() {
        return createNode("pan", 0, panNodes);
      },
      async resume() {},
      async close() {
        this.state = "closed";
      },
    };
    const scheduledRequests = [];
    const cancelledAt = [];
    const renderer = {
      kind: "subtractive",
      getMaximumPolyphony(instrument, config) {
        return Math.min(
          instrument.instrument.polyphony,
          config.maximumRendererPolyphony,
        );
      },
      schedule(request) {
        scheduledRequests.push(request);
        return {
          occurrenceId: request.event.occurrenceId,
          instrumentId: request.event.instrument.instrumentId,
          startAudioTimeSeconds: request.startAudioTimeSeconds,
          stopAudioTimeSeconds: request.noteEndAudioTimeSeconds,
          ended: false,
          stop() {},
          cancelBeforeStart(atAudioTimeSeconds) {
            cancelledAt.push(atAudioTimeSeconds);
          },
        };
      },
    };
    const engine = new WebAudioEngine(
      DEFAULT_AUDIO_ENGINE_CONFIG,
      snapshot,
      () => context,
      [renderer],
    );
    const playbackInstrument = snapshot.instruments[0];

    assert.ok(playbackInstrument !== undefined);
    await engine.resume();
    engine.scheduleNote({
      occurrenceId: "delegated-note",
      generation: 1,
      instrument: playbackInstrument,
      pitch: 64,
      velocity: 100,
      startAudioTimeSeconds: 4,
      endAudioTimeSeconds: 5,
    });

    assert.equal(scheduledRequests.length, 1);
    assert.equal(scheduledRequests[0].context, context);
    assert.equal(scheduledRequests[0].destination, gainNodes[1]);
    assert.equal(
      scheduledRequests[0].tuningFrequencyHz,
      snapshot.masterTuningFrequencyHz,
    );
    assert.equal(gainNodes.length, 2);
    assert.equal(panNodes.length, 1);

    engine.cancelScheduledAfter(3);
    assert.deepEqual(cancelledAt, [3]);
    await engine.dispose();
    assert.equal(context.state, "closed");
  });

  test("updates and validates persistent master controls", () => {
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
    const mutedState = dispatch(updatedState, {
      type: "SetMasterMuted",
      muted: true,
    });
    assert.equal(mutedState.masterBus.muted, true);
    const tunedState = dispatch(mutedState, {
      type: "UpdateMasterTuning",
      tuningFrequencyHz: 442,
    });
    assert.equal(tunedState.masterBus.tuningFrequencyHz, 442);
    assert.equal(
      compilePlaybackSnapshot(tunedState)
        .masterTuningFrequencyHz,
      442,
    );
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
    assert.throws(
      () => dispatch(state, {
        type: "UpdateMasterTuning",
        tuningFrequencyHz: 399.9,
      }),
      (error) => (
        error instanceof CommandRejectedError
        && error.code === "INVALID_COMMAND"
        && error.commandType === "UpdateMasterTuning"
      ),
    );
  });

  test("keeps preset selection on the global project instrument", () => {
    const state = createProject();
    const projectInstrument = state.projectInstrumentsById["voice-a"];

    assert.equal(
      projectInstrument.presetId,
      getDefaultInstrumentPresetId(0),
    );
    assert.equal(
      "presetId" in getActiveTestClip(state).instrumentStatesById["voice-a"],
      false,
    );
    const renamedState = dispatch(state, {
      type: "UpdateProjectInstrument",
      instrumentId: projectInstrument.id,
      changes: {
        name: "Renamed Instrument",
        presetId: getDefaultInstrumentPresetId(1),
      },
    });
    assert.equal(
      renamedState.projectInstrumentsById["voice-a"].presetId,
      projectInstrument.presetId,
    );
    assert.throws(
      () => dispatch(state, {
        type: "AddProjectInstrument",
        instrument: {
          ...createProjectInstrument("missing-preset-instrument", 1),
          presetId: "missing-preset",
        },
        clipInstrumentStatesById: {
          "clip-test": {
            gain: 0.8,
            muted: false,
            locked: false,
            solo: false,
          },
        },
      }),
      (error) => (
        error instanceof CommandRejectedError
        && error.code === "INVALID_COMMAND"
        && error.commandType === "AddProjectInstrument"
      ),
    );
  });

  test("round-trips the current Pianola native document", () => {
    const state = createProject({
      masterGain: 0.41,
      masterTuningFrequencyHz: 442,
      notesByInstrumentId: {
        "voice-a": [{
          ...createNote("disabled", "voice-a", 60, 0, 240),
          enabled: false,
        }],
      },
    });
    const metadata = {
      documentId: "audio-test-document",
      createdAt: "2026-07-29T10:00:00.000Z",
      savedAt: "2026-07-29T10:01:00.000Z",
    };
    const editorState = createEditorState();
    const serialized = serializeNativeProjectFile(
      state,
      metadata,
      editorState,
    );
    const loaded = parseNativeProjectFile(serialized);
    const nativeDocument = JSON.parse(serialized);

    assert.equal(nativeDocument.formatVersion, 1);
    assert.equal(loaded.projectState.masterBus.gain, 0.41);
    assert.equal(loaded.projectState.masterBus.tuningFrequencyHz, 442);
    assert.equal(
      getActiveTestClip(loaded.projectState).tracksByInstrumentId["voice-a"]
        .notesById["disabled"].enabled,
      false,
    );
    assert.deepEqual(loaded.editorState, editorState);
    assert.equal(
      loaded.projectState.schemaVersion,
      PROJECT_SCHEMA_VERSION,
    );
    assert.equal(
      loaded.projectState.instrumentPresetsById[
        loaded.projectState.projectInstrumentsById["voice-a"].presetId
      ].config.polyphony,
      DEFAULT_SUBTRACTIVE_SYNTH_POLYPHONY,
    );

    const invalidCurrentDocument = JSON.parse(serialized);
    delete invalidCurrentDocument.project.instrumentPresetsById[
      invalidCurrentDocument.project.instrumentPresetOrder[0]
    ].config.polyphony;
    assert.throws(
      () => parseNativeProjectFile(
        JSON.stringify(invalidCurrentDocument),
      ),
      (error) => (
        error.code === "INVALID_DATA"
        && error.path.endsWith(".config.polyphony")
      ),
    );
  });

  test("round-trips clip order and per-clip editor state", () => {
    const state = dispatch(createProject(), {
      type: "AddClip",
      clip: {
        id: "clip-native-second",
        name: "Native Second",
        measureCount: 2,
        tracksByInstrumentId: {
          "voice-a": {
            instrumentId: "voice-a",
            notesById: {
              second: createNote("second", "voice-a", 65, 240),
            },
          },
        },
        instrumentStatesById: {
          "voice-a": {
            gain: 0.64,
            muted: true,
            locked: true,
            solo: true,
          },
        },
        transportSettings: {
          ...createDefaultTransportState(),
          bpm: 84,
        },
      },
    });
    const firstEditorState = createEditorState();
    const editorState = {
      ...firstEditorState,
      clipStatesById: {
        ...firstEditorState.clipStatesById,
        "clip-native-second": {
          playheadTick: 720,
          pitchSnapSettings: DEFAULT_PITCH_SNAP_SETTINGS,
          gridSettings: {
            baseResolutionTicks: 240,
            subdivision: "straight",
            resolutionTicks: 240,
          },
          viewport: {
            zoomX: 0.75,
            zoomY: 1.5,
            scrollX: 120,
            scrollY: 480,
          },
        },
      },
    };
    const metadata = {
      documentId: "multi-clip-document",
      createdAt: "2026-08-10T10:00:00.000Z",
      savedAt: "2026-08-10T10:01:00.000Z",
    };
    const loaded = parseNativeProjectFile(
      serializeNativeProjectFile(state, metadata, editorState),
    );

    assert.deepEqual(
      loaded.projectState.clipOrder,
      ["clip-test", "clip-native-second"],
    );
    assert.equal(loaded.projectState.activeClipId, "clip-native-second");
    assert.equal(
      loaded.projectState.clipsById["clip-native-second"]
        .transportSettings.bpm,
      84,
    );
    assert.deepEqual(
      loaded.projectState.clipsById["clip-native-second"]
        .instrumentStatesById["voice-a"],
      {
        gain: 0.64,
        muted: true,
        locked: true,
        solo: true,
      },
    );
    assert.deepEqual(loaded.editorState, editorState);
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
      notesByInstrumentId: {
        "voice-a": [
          createNote("existing", "voice-a", 60, 240, 480),
        ],
      },
    });

    assertOverlapRejected(state, {
      type: "AddNotes",
      trackInstrumentId: "voice-a",
      notes: [
        createNote("overlap", "voice-a", 60, 0, 480),
      ],
    });
    assertOverlapRejected(createProject(), {
      type: "AddNotes",
      trackInstrumentId: "voice-a",
      notes: [
        createNote("batch-a", "voice-a", 65, 0, 480),
        createNote("batch-b", "voice-a", 65, 240, 480),
      ],
    });
    assert.equal(
      Object.keys(getActiveTestClip(state).tracksByInstrumentId["voice-a"].notesById).length,
      1,
    );
  });

  test("rejects ResizeNotes overlaps", () => {
    const state = createProject({
      notesByInstrumentId: {
        "voice-a": [
          createNote("left", "voice-a", 60, 0, 480),
          createNote("right", "voice-a", 60, 480, 240),
        ],
      },
    });

    assertOverlapRejected(state, {
      type: "ResizeNotes",
      trackInstrumentId: "voice-a",
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
      notesByInstrumentId: {
        "voice-a": [
          createNote("root", "voice-a", 60, 0, 480),
        ],
      },
    });
    const addedState = dispatch(initialState, {
      type: "AddNotes",
      trackInstrumentId: "voice-a",
      notes: [
        createNote("third", "voice-a", 64, 0, 480),
      ],
    });
    const resizedState = dispatch(addedState, {
      type: "ResizeNotes",
      trackInstrumentId: "voice-a",
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
        getActiveTestClip(resizedState).tracksByInstrumentId["voice-a"].notesById,
      ).length,
      2,
    );
    assert.equal(
      getActiveTestClip(resizedState).tracksByInstrumentId["voice-a"]
        .notesById["third"].durationTicks,
      600,
    );
  });

  test("snaps pitches to the selected mode or derived degree triad", () => {
    const cIonian = {
      ...DEFAULT_PITCH_SNAP_SETTINGS,
      enabled: true,
      tonicPitchClass: 0,
      patternId: "ionian",
    };
    const cIonianFirstDegree = {
      ...cIonian,
      scaleDegreeIndex: 0,
    };

    assert.equal(
      snapPitchToTonalPattern(61, cIonian, -1),
      60,
    );
    assert.equal(
      snapPitchToTonalPattern(61, cIonian, 1),
      62,
    );
    assert.equal(
      snapPitchToTonalPattern(62, cIonianFirstDegree, -1),
      60,
    );
    assert.equal(
      snapPitchToTonalPattern(62, cIonianFirstDegree, 1),
      64,
    );
    assert.equal(
      snapPitchToTonalPattern(
        61,
        DEFAULT_PITCH_SNAP_SETTINGS,
        1,
      ),
      61,
    );
  });

  test("spells modes enharmonically and supports variable degree counts", () => {
    const cPhrygian = {
      ...DEFAULT_PITCH_SNAP_SETTINGS,
      tonicPitchClass: 0,
      patternId: "phrygian",
    };
    const cMinorSecondDegree = {
      ...DEFAULT_PITCH_SNAP_SETTINGS,
      enabled: true,
      tonicPitchClass: 0,
      patternId: "aeolian",
      scaleDegreeIndex: 1,
    };
    const minorPentatonic = getTonalPatternDefinition(
      "minor-pentatonic",
    );
    const harmonicMinor = getTonalPatternDefinition(
      "harmonic-minor",
    );
    const melodicMinor = getTonalPatternDefinition(
      "melodic-minor",
    );
    const diminishedWholeHalf = getTonalPatternDefinition(
      "diminished-whole-half",
    );
    const cMinorPentatonic = {
      ...DEFAULT_PITCH_SNAP_SETTINGS,
      tonicPitchClass: 0,
      patternId: "minor-pentatonic",
    };
    const cBlues = {
      ...DEFAULT_PITCH_SNAP_SETTINGS,
      tonicPitchClass: 0,
      patternId: "blues",
    };

    assert.equal(getMidiNoteLabel(61, cPhrygian), "Db4");
    assert.equal(getPreferredTonicLabel(1, "ionian"), "Db");
    assert.equal(getPreferredTonicLabel(1, "dorian"), "C#");
    assert.equal(
      getMidiNoteLabel(61, {
        ...DEFAULT_PITCH_SNAP_SETTINGS,
        tonicPitchClass: 1,
        patternId: "ionian",
      }),
      "Db4",
    );
    assert.equal(minorPentatonic.intervals.length, 5);
    assert.deepEqual(
      [...harmonicMinor.intervals],
      [0, 2, 3, 5, 7, 8, 11],
    );
    assert.deepEqual(
      [...melodicMinor.intervals],
      [0, 2, 3, 5, 7, 9, 11],
    );
    assert.equal(diminishedWholeHalf.intervals.length, 8);
    assert.match(getScaleDegreeLabel(cPhrygian, 1), /^bII/);
    assert.match(
      getScaleDegreeLabel(cMinorPentatonic, 1),
      /^bIII/,
    );
    assert.match(getScaleDegreeLabel(cBlues, 3), /^#IV/);
    assert.equal(getScaleDegreeColorIndex(cPhrygian, 1), 1);
    assert.equal(
      getPitchScaleDegreeColorIndex(61, cPhrygian),
      1,
    );
    assert.equal(
      getScaleDegreeTriadQuality(cMinorSecondDegree, 1),
      "diminished",
    );
    assert.match(
      getScaleDegreeLabel(cMinorSecondDegree, 1),
      /^II° · D diminished$/,
    );
    assert.equal(
      isPitchAllowedByTonalPattern(62, cMinorSecondDegree),
      true,
    );
    assert.equal(
      isPitchAllowedByTonalPattern(65, cMinorSecondDegree),
      true,
    );
    assert.equal(
      isPitchAllowedByTonalPattern(68, cMinorSecondDegree),
      true,
    );
    assert.equal(
      isPitchAllowedByTonalPattern(67, cMinorSecondDegree),
      false,
    );
  });

  test("keeps playback level independent from stored velocity", () => {
    const quietLevel = resolveNoteEnvelopePeakLevel(1);
    const drawnLevel = resolveNoteEnvelopePeakLevel(100);
    const loudLevel = resolveNoteEnvelopePeakLevel(127);

    assert.equal(quietLevel, drawnLevel);
    assert.equal(loudLevel, drawnLevel);
    assert.equal(drawnLevel, 100 / 127);
  });

  test("repositions a note group atomically", () => {
    const state = createProject({
      notesByInstrumentId: {
        "voice-a": [
          createNote("first", "voice-a", 60, 0, 240),
          createNote("second", "voice-a", 62, 0, 240),
        ],
      },
    });
    const repositionedState = dispatch(state, {
      type: "RepositionNotes",
      trackInstrumentId: "voice-a",
      changes: [
        {
          noteId: "first",
          startTick: 240,
          pitch: 64,
        },
        {
          noteId: "second",
          startTick: 240,
          pitch: 67,
        },
      ],
    });

    assert.equal(
      getActiveTestClip(repositionedState).tracksByInstrumentId["voice-a"]
        .notesById["first"].pitch,
      64,
    );
    assert.equal(
      getActiveTestClip(repositionedState).tracksByInstrumentId["voice-a"]
        .notesById["second"].startTick,
      240,
    );
    assertOverlapRejected(repositionedState, {
      type: "RepositionNotes",
      trackInstrumentId: "voice-a",
      changes: [
        {
          noteId: "first",
          startTick: 240,
          pitch: 67,
        },
      ],
    });
  });

  test("merges transitive same-pitch collisions atomically", () => {
    const existing = createNote(
      "existing",
      "voice-a",
      60,
      0,
      480,
      70,
    );
    const selected = createNote(
      "selected",
      "voice-a",
      60,
      600,
      240,
      110,
    );
    const proposed = {
      ...selected,
      startTick: 360,
    };
    const state = createProject({
      notesByInstrumentId: {
        "voice-a": [
          existing,
          selected,
        ],
      },
    });
    const intent = {
      originalNotes: [selected],
      proposedNotes: [proposed],
    };

    assert.equal(countNoteEditCollisions(state, intent), 1);

    const plan = createNoteCollisionResolutionPlan(
      state,
      intent,
      "merge",
      "merge-test",
    );
    const nextState = dispatchCommands(
      state,
      plan.commands,
      "Merge collisions",
    );
    const notes = Object.values(
      getActiveTestClip(nextState).tracksByInstrumentId["voice-a"].notesById,
    );

    assert.equal(notes.length, 1);
    assert.deepEqual(notes[0], {
      ...selected,
      startTick: 0,
      durationTicks: 600,
    });
    assert.deepEqual(
      plan.resultingSelectionNoteIds,
      ["selected"],
    );
  });

  test("slices existing notes at edited-note anchors", () => {
    const existing = createNote(
      "existing",
      "voice-a",
      60,
      0,
      960,
      75,
    );
    const selected = createNote(
      "selected",
      "voice-a",
      60,
      1_200,
      240,
      105,
    );
    const proposed = {
      ...selected,
      startTick: 360,
    };
    const state = createProject({
      notesByInstrumentId: {
        "voice-a": [
          existing,
          selected,
        ],
      },
    });
    const plan = createNoteCollisionResolutionPlan(
      state,
      {
        originalNotes: [selected],
        proposedNotes: [proposed],
      },
      "slice",
      "slice-test",
    );
    const nextState = dispatchCommands(
      state,
      plan.commands,
      "Slice collisions",
    );
    const notes = Object.values(
      getActiveTestClip(nextState).tracksByInstrumentId["voice-a"].notesById,
    ).sort((left, right) => left.startTick - right.startTick);

    assert.equal(notes.length, 3);
    assert.deepEqual(
      notes.map((note) => [
        note.startTick,
        note.durationTicks,
        note.velocity,
      ]),
      [
        [0, 360, 75],
        [360, 240, 105],
        [600, 360, 75],
      ],
    );
    assert.equal(notes[0].id, "existing");
    assert.match(notes[2].id, /^existing-slice-/);
    assert.deepEqual(
      plan.resultingSelectionNoteIds,
      ["selected"],
    );
  });

  test("consolidates colliding edited notes before slicing", () => {
    const existing = createNote(
      "existing",
      "voice-a",
      60,
      0,
      360,
    );
    const selectedA = createNote(
      "selected-a",
      "voice-a",
      60,
      960,
      120,
    );
    const selectedB = createNote(
      "selected-b",
      "voice-a",
      60,
      1_200,
      120,
    );
    const state = createProject({
      notesByInstrumentId: {
        "voice-a": [
          existing,
          selectedA,
          selectedB,
        ],
      },
    });
    const intent = {
      originalNotes: [
        selectedA,
        selectedB,
      ],
      proposedNotes: [
        {
          ...selectedA,
          startTick: 300,
          durationTicks: 300,
        },
        {
          ...selectedB,
          startTick: 480,
          durationTicks: 300,
        },
      ],
    };
    const plan = createNoteCollisionResolutionPlan(
      state,
      intent,
      "slice",
      "consolidate-test",
    );
    const nextState = dispatchCommands(
      state,
      plan.commands,
      "Consolidate and slice",
    );
    const notes = Object.values(
      getActiveTestClip(nextState).tracksByInstrumentId["voice-a"].notesById,
    ).sort((left, right) => left.startTick - right.startTick);

    assert.deepEqual(
      notes.map((note) => [
        note.id,
        note.startTick,
        note.durationTicks,
      ]),
      [
        ["existing", 0, 300],
        ["selected-a", 300, 480],
      ],
    );
    assert.deepEqual(
      plan.resultingSelectionNoteIds,
      ["selected-a"],
    );
  });

  test("keeps collision planning inert and undoes resolution once", () => {
    const existing = createNote(
      "existing",
      "voice-a",
      60,
      0,
      960,
    );
    const selected = createNote(
      "selected",
      "voice-a",
      60,
      1_200,
      240,
    );
    const state = createProject({
      notesByInstrumentId: {
        "voice-a": [
          existing,
          selected,
        ],
      },
    });
    const originalTracks = structuredClone(
      getActiveTestClip(state).tracksByInstrumentId,
    );
    const plan = createNoteCollisionResolutionPlan(
      state,
      {
        originalNotes: [selected],
        proposedNotes: [
          {
            ...selected,
            startTick: 360,
          },
        ],
      },
      "slice",
      "undo-test",
    );

    assert.deepEqual(getActiveTestClip(state).tracksByInstrumentId, originalTracks);

    const store = new ProjectStore(state);
    store.dispatch({
      transactionId: "collision-resolution",
      label: "Slice collisions",
      createdAt: 1,
      commands: plan.commands,
    });

    assert.equal(store.canUndo(), true);
    store.undo();
    assert.deepEqual(
      getActiveTestClip(store.getState()).tracksByInstrumentId,
      originalTracks,
    );
    assert.equal(store.canUndo(), false);
  });

  test("applies the four selection transformations deterministically", () => {
    const notes = [
      createNote("a", "voice-a", 60, 0, 120),
      createNote("b", "voice-a", 64, 240, 240),
      createNote("c", "voice-a", 67, 480, 120),
    ];

    assert.deepEqual(
      transformNoteSelection(notes, "invert", 10_000).map(
        (note) => [note.pitch, note.startTick, note.durationTicks],
      ),
      [
        [60, 0, 120],
        [56, 240, 240],
        [53, 480, 120],
      ],
    );
    assert.deepEqual(
      transformNoteSelection(notes, "retrograde", 10_000).map(
        (note) => [note.pitch, note.startTick, note.durationTicks],
      ),
      [
        [60, 480, 120],
        [64, 120, 240],
        [67, 0, 120],
      ],
    );
    assert.deepEqual(
      transformNoteSelection(notes, "augment", 10_000).map(
        (note) => [note.startTick, note.durationTicks],
      ),
      [
        [0, 240],
        [480, 480],
        [960, 240],
      ],
    );
    assert.deepEqual(
      transformNoteSelection(notes, "diminish", 10_000).map(
        (note) => [note.startTick, note.durationTicks],
      ),
      [
        [0, 60],
        [120, 120],
        [240, 60],
      ],
    );
    assert.deepEqual(
      notes.map((note) => [note.pitch, note.startTick, note.durationTicks]),
      [
        [60, 0, 120],
        [64, 240, 240],
        [67, 480, 120],
      ],
    );
  });

  test("rejects transformed notes outside project bounds", () => {
    assert.throws(
      () => transformNoteSelection(
        [createNote("high", "voice-a", 100, 0, 120)],
        "augment",
        100,
      ),
      SelectionTransformationError,
    );

    assert.throws(
      () => transformNoteSelection(
        [
          createNote("axis", "voice-a", 20, 0, 120),
          createNote("target", "voice-a", 80, 240, 120),
        ],
        "invert",
        10_000,
      ),
      SelectionTransformationError,
    );
  });

  test("stores a note transformation as one undoable transaction", () => {
    const noteA = createNote("a", "voice-a", 60, 0, 300);
    const noteB = createNote("b", "voice-a", 60, 400, 120);
    const state = createProject({
      notesByInstrumentId: {
        "voice-a": [noteA, noteB],
      },
    });
    const originalTracks = structuredClone(getActiveTestClip(state).tracksByInstrumentId);
    const store = new ProjectStore(state);

    store.dispatch({
      transactionId: "transform-selection",
      label: "Invert selected intervals",
      createdAt: 1,
      commands: [
        {
          type: "TransformNotes",
          trackInstrumentId: "voice-a",
          changes: [
            {
              noteId: "a",
              pitch: 60,
              startTick: 200,
              durationTicks: 100,
            },
            {
              noteId: "b",
              pitch: 60,
              startTick: 400,
              durationTicks: 120,
            },
          ],
        },
      ],
    });

    assert.equal(
      getActiveTestClip(store.getState()).tracksByInstrumentId["voice-a"].notesById.a.startTick,
      200,
    );
    assert.equal(
      getActiveTestClip(store.getState()).tracksByInstrumentId["voice-a"].notesById.a.durationTicks,
      100,
    );
    assert.equal(store.canUndo(), true);
    store.undo();
    assert.deepEqual(getActiveTestClip(store.getState()).tracksByInstrumentId, originalTracks);
    assert.equal(store.canUndo(), false);
  });

  test("slices selected notes atomically and restores them on undo", () => {
    const note = createNote("whole", "voice-a", 60, 120, 480);
    const state = createProject({
      notesByInstrumentId: {
        "voice-a": [note],
      },
    });
    const store = new ProjectStore(state);

    store.dispatch({
      transactionId: "slice-selection",
      label: "Slice selected notes at playhead",
      createdAt: 1,
      commands: [
        {
          type: "SliceNotes",
          trackInstrumentId: "voice-a",
          sliceTick: 360,
          slices: [
            {
              noteId: "whole",
              rightNoteId: "right-half",
            },
          ],
        },
      ],
    });

    const slicedTrack = getActiveTestClip(store.getState()).tracksByInstrumentId["voice-a"];

    assert.deepEqual(
      [
        slicedTrack.notesById.whole.startTick,
        slicedTrack.notesById.whole.durationTicks,
      ],
      [120, 240],
    );
    assert.deepEqual(
      [
        slicedTrack.notesById["right-half"].startTick,
        slicedTrack.notesById["right-half"].durationTicks,
      ],
      [360, 240],
    );
    store.undo();
    assert.deepEqual(
      getActiveTestClip(store.getState()).tracksByInstrumentId,
      getActiveTestClip(state).tracksByInstrumentId,
    );
  });

  test("steals the oldest overlapping voice when polyphony is exhausted", () => {
    const voices = [
      {
        startAudioTimeSeconds: 0.4,
        stopAudioTimeSeconds: 2.2,
      },
      {
        startAudioTimeSeconds: 0.1,
        stopAudioTimeSeconds: 3,
      },
      {
        startAudioTimeSeconds: 0.8,
        stopAudioTimeSeconds: 1,
      },
      {
        startAudioTimeSeconds: 4,
        stopAudioTimeSeconds: 5,
      },
    ];

    assert.equal(
      countOverlappingVoiceWindows(voices, 0.9, 1.5),
      3,
    );
    assert.equal(
      findOldestOverlappingVoiceIndex(voices, 0.9, 1.5),
      1,
    );
    assert.equal(
      findOldestOverlappingVoiceIndex(voices, 3.2, 3.8),
      -1,
    );
  });

  test("schedules same-time polyphony with a fake engine", async () => {
    const state = createProject({
      measureCount: 1,
      notesByInstrumentId: {
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
      getActiveTestClip(state).transportSettings,
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

  test("auditions a pitch with the selected project instrument", async () => {
    const state = createProject({
      instrumentOrder: ["voice-a", "voice-b"],
    });
    const snapshot = compilePlaybackSnapshot(state);
    const engine = new FakeAudioEngine();
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      getActiveTestClip(state).transportSettings,
    );

    engine.currentTimeSeconds = 1.25;
    await scheduler.auditionPitch("voice-b", 73);

    assert.equal(engine.resumeCount, 1);
    assert.equal(engine.events.length, 1);
    assert.equal(engine.events[0].pitch, 73);
    assert.equal(engine.events[0].instrument.instrumentId, "voice-b");
    assert.equal(
      engine.events[0].instrument.instrument.oscillatorWaveform,
      "sine",
    );
    assertClose(engine.events[0].startAudioTimeSeconds, 1.25);
    assertClose(engine.events[0].endAudioTimeSeconds, 1.65);
    scheduler.previewInstrumentGain("voice-b", 0.46);
    assert.deepEqual(engine.instrumentGainPreviews, [
      {
        instrumentId: "voice-b",
        gain: 0.46,
      },
    ]);
    await assert.rejects(
      scheduler.auditionPitch("voice-b", 128),
      /between 0 and 127/,
    );

    await scheduler.dispose();
  });

  test("keeps active notes sounding while refreshing future events", async () => {
    const state = createProject({
      measureCount: 1,
      notesByInstrumentId: {
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
      getActiveTestClip(state).transportSettings,
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
      getActiveTestClip(refreshedState).transportSettings,
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

  test("schedules only soloed instruments when solo is active", async () => {
    const state = createProject({
      measureCount: 1,
      notesByInstrumentId: {
        "voice-a": [
          createNote("solo-note", "voice-a", 60, 0, 120),
        ],
        "voice-b": [
          createNote("other-note", "voice-b", 67, 0, 120),
        ],
      },
      instrumentOrder: ["voice-a", "voice-b"],
      instrumentStateChangesById: {
        "voice-a": { solo: true },
      },
    });
    const soloState = state;
    const snapshot = compilePlaybackSnapshot(soloState);
    const engine = new FakeAudioEngine();
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      getActiveTestClip(soloState).transportSettings,
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
      notesByInstrumentId: {
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
      getActiveTestClip(state).transportSettings,
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
      notesByInstrumentId: {
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
      getActiveTestClip(state).transportSettings,
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
      notesByInstrumentId: {
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
      getActiveTestClip(state).transportSettings,
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
      notesByInstrumentId: {
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
      getActiveTestClip(state).transportSettings,
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
      notesByInstrumentId: {
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
      getActiveTestClip(state).transportSettings,
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
      notesByInstrumentId: {
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
      getActiveTestClip(state).transportSettings,
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

  test("isolates notes and transport data between clips", () => {
    const initialState = createProject({
      notesByInstrumentId: {
        "voice-a": [createNote("clip-a-note", "voice-a", 60, 0)],
      },
    });
    const secondClip = {
      id: "clip-second",
      name: "Second Clip",
      measureCount: 2,
      tracksByInstrumentId: {
        "voice-a": {
          instrumentId: "voice-a",
          notesById: {},
        },
      },
      instrumentStatesById: {
        "voice-a": {
          gain: 0.8,
          muted: false,
          locked: false,
          solo: false,
        },
      },
      transportSettings: {
        ...createDefaultTransportState(),
        bpm: 90,
      },
    };
    const withSecondClip = dispatch(initialState, {
      type: "AddClip",
      clip: secondClip,
    });
    const editedSecondClip = dispatch(withSecondClip, {
      type: "AddNotes",
      trackInstrumentId: "voice-a",
      notes: [createNote("clip-b-note", "voice-a", 67, 480)],
    });

    assert.deepEqual(
      Object.keys(
        editedSecondClip.clipsById["clip-test"]
          .tracksByInstrumentId["voice-a"].notesById,
      ),
      ["clip-a-note"],
    );
    assert.deepEqual(
      Object.keys(
        editedSecondClip.clipsById["clip-second"]
          .tracksByInstrumentId["voice-a"].notesById,
      ),
      ["clip-b-note"],
    );
    assert.equal(
      editedSecondClip.clipsById["clip-test"].transportSettings.bpm,
      120,
    );
    assert.equal(
      editedSecondClip.clipsById["clip-second"].transportSettings.bpm,
      90,
    );
  });

  test("isolates instrument playback and editing state between clips", () => {
    const initialState = createProject();
    const withSecondClip = dispatch(initialState, {
      type: "AddClip",
      clip: {
        id: "clip-voice-state-second",
        name: "ProjectInstrument State Second",
        measureCount: 2,
        tracksByInstrumentId: {
          "voice-a": {
            instrumentId: "voice-a",
            notesById: {},
          },
        },
        instrumentStatesById: {
          "voice-a": {
            gain: 0.8,
            muted: false,
            locked: false,
            solo: false,
          },
        },
        transportSettings: createDefaultTransportState(),
      },
    });
    const store = new ProjectStore(withSecondClip);

    store.dispatch({
      transactionId: "update-second-clip-voice-state",
      createdAt: 1,
      commands: [{
        type: "UpdateClipInstrumentState",
        instrumentId: "voice-a",
        changes: {
          gain: 0.35,
          muted: true,
          locked: true,
          solo: true,
        },
      }],
    });

    assert.deepEqual(
      store.getState().clipsById["clip-test"]
        .instrumentStatesById["voice-a"],
      {
        gain: 0.8,
        muted: false,
        locked: false,
        solo: false,
      },
    );
    assert.deepEqual(
      store.getState().clipsById["clip-voice-state-second"]
        .instrumentStatesById["voice-a"],
      {
        gain: 0.35,
        muted: true,
        locked: true,
        solo: true,
      },
    );
    assert.equal(
      compilePlaybackSnapshot(store.getState())
        .instruments[0].instrument.oscillatorWaveform,
      "sawtooth",
    );

    store.undo();
    assert.deepEqual(
      store.getState().clipsById["clip-voice-state-second"]
        .instrumentStatesById["voice-a"],
      {
        gain: 0.8,
        muted: false,
        locked: false,
        solo: false,
      },
    );

    store.redo();
    assert.deepEqual(
      store.getState().clipsById["clip-voice-state-second"]
        .instrumentStatesById["voice-a"],
      {
        gain: 0.35,
        muted: true,
        locked: true,
        solo: true,
      },
    );
  });

  test("refreshes rendered instrument styles after clip-local state changes", () => {
    const runtime = createEditorRuntime(createProject());

    assert.deepEqual(runtime.instrumentStyles.get()["voice-a"], {
      fillStyle: "#79a7ff",
      opacity: 1,
      locked: false,
    });

    runtime.editorCommands.dispatch(
      [{
        type: "UpdateClipInstrumentState",
        instrumentId: "voice-a",
        changes: { muted: true, locked: true },
      }],
      "Update rendered instrument state",
    );

    assert.deepEqual(runtime.instrumentStyles.get()["voice-a"], {
      fillStyle: "#79a7ff",
      opacity: 0.16,
      locked: true,
    });
  });

  test("propagates instrument lifecycle changes to every clip", () => {
    const initialState = createProject();
    const withSecondClip = dispatch(initialState, {
      type: "AddClip",
      clip: {
        id: "clip-second",
        name: "Second Clip",
        measureCount: 4,
        tracksByInstrumentId: {
          "voice-a": {
            instrumentId: "voice-a",
            notesById: {},
          },
        },
        instrumentStatesById: {
          "voice-a": {
            gain: 0.8,
            muted: false,
            locked: false,
            solo: false,
          },
        },
        transportSettings: createDefaultTransportState(),
      },
    });
    const withInstrument = dispatch(withSecondClip, {
      type: "AddProjectInstrument",
      instrument: createProjectInstrument("voice-b", 1),
      clipInstrumentStatesById: {
        "clip-test": {
          gain: 0.82,
          muted: false,
          locked: false,
          solo: false,
        },
        "clip-second": {
          gain: 0.82,
          muted: false,
          locked: false,
          solo: false,
        },
      },
    });

    for (const clipId of withInstrument.clipOrder) {
      assert.ok(
        withInstrument.clipsById[clipId].tracksByInstrumentId["voice-b"],
      );
      assert.equal(
        withInstrument.clipsById[clipId]
          .instrumentStatesById["voice-b"].gain,
        0.82,
      );
      assert.equal(
        withInstrument.projectInstrumentsById["voice-b"].presetId,
        getDefaultInstrumentPresetId(1),
      );
    }

    const withoutInstrument = dispatch(withInstrument, {
      type: "DeleteProjectInstrument",
      instrumentId: "voice-b",
    });

    for (const clipId of withoutInstrument.clipOrder) {
      assert.equal(
        withoutInstrument.clipsById[clipId].tracksByInstrumentId["voice-b"],
        undefined,
      );
      assert.equal(
        withoutInstrument.clipsById[clipId].instrumentStatesById["voice-b"],
        undefined,
      );
    }
  });

  test("keeps clip navigation outside global undo history", () => {
    const store = new ProjectStore(createProject());

    store.dispatch({
      transactionId: "add-second-clip",
      createdAt: 1,
      commands: [{
        type: "AddClip",
        clip: {
          id: "clip-second",
          name: "Second Clip",
          measureCount: 4,
          tracksByInstrumentId: {
            "voice-a": {
              instrumentId: "voice-a",
              notesById: {},
            },
          },
          instrumentStatesById: {
          "voice-a": {
            gain: 0.8,
            muted: false,
            locked: false,
            solo: false,
          },
          },
          transportSettings: createDefaultTransportState(),
        },
      }],
    });
    store.dispatch({
      transactionId: "select-first-clip",
      createdAt: 2,
      commands: [{ type: "ActivateClip", clipId: "clip-test" }],
    });
    store.dispatch({
      transactionId: "edit-first-clip",
      createdAt: 3,
      commands: [{
        type: "AddNotes",
        trackInstrumentId: "voice-a",
        notes: [createNote("history-note", "voice-a", 60, 0)],
      }],
    });
    store.dispatch({
      transactionId: "select-second-clip",
      createdAt: 4,
      commands: [{ type: "ActivateClip", clipId: "clip-second" }],
    });

    store.undo();
    assert.equal(store.getState().activeClipId, "clip-second");
    assert.equal(
      store.getState().clipsById["clip-test"]
        .tracksByInstrumentId["voice-a"].notesById["history-note"],
      undefined,
    );

    store.redo();
    assert.equal(store.getState().activeClipId, "clip-second");
    assert.ok(
      store.getState().clipsById["clip-test"]
        .tracksByInstrumentId["voice-a"].notesById["history-note"],
    );
  });

  test("restores playhead position independently for each clip", () => {
    const runtime = createEditorRuntime(createProject());
    const secondClip = {
      id: "clip-playhead-second",
      name: "Playhead Second",
      measureCount: 4,
      tracksByInstrumentId: {
        "voice-a": {
          instrumentId: "voice-a",
          notesById: {},
        },
      },
      instrumentStatesById: {
        "voice-a": {
          gain: 0.8,
          muted: false,
          locked: false,
          solo: false,
        },
      },
      transportSettings: createDefaultTransportState(),
    };

    runtime.playheadTick.set(640);
    runtime.editorCommands.dispatch(
      [{ type: "AddClip", clip: secondClip }],
      "Add second clip",
    );
    assert.equal(runtime.playheadTick.get(), 0);

    runtime.playheadTick.set(1_280);
    runtime.editorCommands.dispatch(
      [{ type: "ActivateClip", clipId: "clip-test" }],
      "Select first clip",
    );
    assert.equal(runtime.playheadTick.get(), 640);

    runtime.editorCommands.dispatch(
      [{ type: "ActivateClip", clipId: secondClip.id }],
      "Select second clip",
    );
    assert.equal(runtime.playheadTick.get(), 1_280);
  });

  test("replaces an audio snapshot at a restored clip position", () => {
    const state = createProject({ measureCount: 1 });
    const snapshot = compilePlaybackSnapshot(state);
    const engine = new FakeAudioEngine();
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      getActiveTestClip(state).transportSettings,
      {},
      new FakeSchedulerTimer(),
      240,
    );

    scheduler.replacePlaybackState(
      snapshot,
      getActiveTestClip(state).transportSettings,
      1_440,
    );

    assert.equal(scheduler.getPositionTick(), 1_440);
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
