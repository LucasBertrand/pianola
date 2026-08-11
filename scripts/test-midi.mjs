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
    MidiCodecError,
  } = await vite.ssrLoadModule("/src/midi/errors.ts");
  const {
    readStandardMidiFile,
  } = await vite.ssrLoadModule("/src/midi/smf-reader.ts");
  const {
    writeStandardMidiFile,
  } = await vite.ssrLoadModule("/src/midi/smf-writer.ts");
  const {
    analyzeMidiImport,
    createProjectFromMidiImport,
  } = await vite.ssrLoadModule("/src/midi/midi-importer.ts");
  const {
    createMidiExport,
  } = await vite.ssrLoadModule("/src/midi/midi-exporter.ts");
  const {
    PROJECT_SCHEMA_VERSION,
    createDefaultMasterBusState,
    createDefaultTransportState,
  } = await vite.ssrLoadModule("/src/domain/model.ts");
  const {
    createDefaultProjectInstrument,
  } = await vite.ssrLoadModule("/src/domain/project-instrument-factory.ts");
  const {
    getDefaultInstrumentPresetId,
  } = await vite.ssrLoadModule("/src/domain/instrument-presets.ts");

  const tests = [];

  function test(name, callback) {
    tests.push({
      name,
      callback,
    });
  }

  function parseWrittenFile(file) {
    return readStandardMidiFile(
      writeStandardMidiFile(file),
    );
  }

  function assertMidiError(callback, expectedCode) {
    assert.throws(
      callback,
      (error) => (
        error instanceof MidiCodecError
        && error.code === expectedCode
      ),
      `Expected MIDI codec error ${expectedCode}.`,
    );
  }

  function createRawFormatZeroFile(
    trackBytes,
    division = 480,
  ) {
    const bytes = new Uint8Array(22 + trackBytes.length);
    bytes.set([
      0x4d, 0x54, 0x68, 0x64,
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x00,
      0x00, 0x01,
      (division >>> 8) & 0xff,
      division & 0xff,
      0x4d, 0x54, 0x72, 0x6b,
      (trackBytes.length >>> 24) & 0xff,
      (trackBytes.length >>> 16) & 0xff,
      (trackBytes.length >>> 8) & 0xff,
      trackBytes.length & 0xff,
    ]);
    bytes.set(trackBytes, 22);
    return bytes;
  }

  function createImportAnalysis(
    projectInstrument,
    notes,
    collisionCount,
  ) {
    return {
      title: "Collision import",
      sourceFormat: 1,
      sourceTicksPerQuarterNote: 960,
      tempoBpm: 120,
      timeSignature: {
        numerator: 4,
        denominator: 4,
      },
      timelineEndTick: notes.reduce(
        (maximum, note) => Math.max(
          maximum,
          note.startTick + note.durationTicks,
        ),
        0,
      ),
      instrumentCandidates: [
        {
          projectInstrument,
          presetId: getDefaultInstrumentPresetId(0),
          notes,
        },
      ],
      noteCount: notes.length,
      collisionCount,
      ignoredControlChangeCount: 0,
      ignoredSustainControlChangeCount: 0,
      warnings: [],
    };
  }

  function getProjectNotes(state, instrumentId) {
    return Object.values(
      getActiveTestClip(state).tracksByInstrumentId[instrumentId].notesById,
    ).sort((left, right) =>
      left.startTick - right.startTick
      || left.pitch - right.pitch
      || left.id.localeCompare(right.id));
  }

  function getActiveTestClip(state) {
    return state.clipsById[state.activeClipId];
  }

  function normalizeProjectInstruments(state) {
    return state.instrumentOrder.map((instrumentId) => {
      const instrument = state.projectInstrumentsById[instrumentId];
      const notes = getProjectNotes(state, instrumentId);

      return {
        name: instrument.name,
        notes: notes.map((note) => [
          note.pitch,
          note.startTick,
          note.durationTicks,
          note.velocity,
        ]),
      };
    });
  }

  test("round-trips deterministic SMF tracks and metadata", () => {
    const sourceFile = {
      format: 1,
      ticksPerQuarterNote: 480,
      tracks: [
        {
          events: [
            {
              kind: "track-name",
              absoluteTick: 0,
              text: "Conductor",
            },
            {
              kind: "tempo",
              absoluteTick: 0,
              microsecondsPerQuarterNote: 500_000,
            },
            {
              kind: "time-signature",
              absoluteTick: 0,
              numerator: 3,
              denominator: 4,
              midiClocksPerMetronome: 24,
              thirtySecondNotesPerQuarter: 8,
            },
            {
              kind: "end-of-track",
              absoluteTick: 960,
            },
          ],
        },
        {
          events: [
            {
              kind: "track-name",
              absoluteTick: 0,
              text: "Mélodie",
            },
            {
              kind: "note-on",
              absoluteTick: 0,
              channel: 2,
              note: 60,
              velocity: 100,
            },
            {
              kind: "note-on",
              absoluteTick: 240,
              channel: 2,
              note: 64,
              velocity: 90,
            },
            {
              kind: "note-on",
              absoluteTick: 480,
              channel: 2,
              note: 67,
              velocity: 80,
            },
            {
              kind: "note-off",
              absoluteTick: 480,
              channel: 2,
              note: 60,
              velocity: 0,
            },
            {
              kind: "note-off",
              absoluteTick: 720,
              channel: 2,
              note: 64,
              velocity: 0,
            },
            {
              kind: "note-off",
              absoluteTick: 960,
              channel: 2,
              note: 67,
              velocity: 0,
            },
            {
              kind: "end-of-track",
              absoluteTick: 960,
            },
          ],
        },
      ],
    };
    const firstEncoding = writeStandardMidiFile(sourceFile);
    const secondEncoding = writeStandardMidiFile(sourceFile);
    const parsed = readStandardMidiFile(firstEncoding);

    assert.deepEqual(firstEncoding, secondEncoding);
    assert.equal(parsed.format, 1);
    assert.equal(parsed.ticksPerQuarterNote, 480);
    assert.equal(parsed.tracks.length, 2);
    assert.deepEqual(
      parsed.tracks[0].events.map((event) => event.kind),
      [
        "track-name",
        "tempo",
        "time-signature",
        "end-of-track",
      ],
    );
    assert.equal(parsed.tracks[0].events[1].microsecondsPerQuarterNote, 500_000);
    assert.deepEqual(
      parsed.tracks[0].events[2],
      {
        kind: "time-signature",
        absoluteTick: 0,
        numerator: 3,
        denominator: 4,
        midiClocksPerMetronome: 24,
        thirtySecondNotesPerQuarter: 8,
      },
    );
    assert.equal(parsed.tracks[1].events[0].text, "Mélodie");
    assert.deepEqual(
      parsed.tracks[1].events
        .filter((event) =>
          event.kind === "note-on"
          || event.kind === "note-off")
        .map((event) => [
          event.kind,
          event.absoluteTick,
          event.note,
          event.velocity,
        ]),
      [
        ["note-on", 0, 60, 100],
        ["note-on", 240, 64, 90],
        ["note-off", 480, 60, 0],
        ["note-on", 480, 67, 80],
        ["note-off", 720, 64, 0],
        ["note-off", 960, 67, 0],
      ],
    );

    for (
      const boundaryTick of [
        0x7f,
        0x80,
        0x3fff,
        0x4000,
        0x1f_ffff,
        0x20_0000,
        0x0fff_ffff,
      ]
    ) {
      const boundaryFile = parseWrittenFile({
        format: 0,
        ticksPerQuarterNote: 480,
        tracks: [
          {
            events: [
              {
                kind: "end-of-track",
                absoluteTick: boundaryTick,
              },
            ],
          },
        ],
      });

      assert.equal(
        boundaryFile.tracks[0].events[0].absoluteTick,
        boundaryTick,
      );
    }
  });

  test("decodes channel running status across variable-length deltas", () => {
    const trackBytes = new Uint8Array([
      0x00, 0x90, 0x3c, 0x64,
      0x81, 0x70, 0x3e, 0x6e,
      0x81, 0x70, 0x3c, 0x00,
      0x00, 0x3e, 0x00,
      0x00, 0xff, 0x2f, 0x00,
    ]);
    const parsed = readStandardMidiFile(
      createRawFormatZeroFile(trackBytes),
    );

    assert.equal(parsed.summary.noteEventCount, 4);
    assert.deepEqual(
      parsed.tracks[0].events
        .filter((event) => event.kind === "note-on")
        .map((event) => [
          event.absoluteTick,
          event.note,
          event.velocity,
        ]),
      [
        [0, 60, 100],
        [240, 62, 110],
        [480, 60, 0],
        [480, 62, 0],
      ],
    );
  });

  test("rejects truncated, malformed, and SMPTE-timed files", () => {
    const trackBytes = new Uint8Array([
      0x00, 0x90, 0x3c, 0x64,
      0x00, 0xff, 0x2f, 0x00,
    ]);
    const validFile = createRawFormatZeroFile(trackBytes);
    const malformedFile = validFile.slice();
    const smpteFile = validFile.slice();

    malformedFile[23] = 0x3c;
    smpteFile[12] = 0xe7;
    smpteFile[13] = 0x28;

    assertMidiError(
      () => readStandardMidiFile(
        validFile.slice(0, validFile.length - 1),
      ),
      "TRUNCATED_FILE",
    );
    assertMidiError(
      () => readStandardMidiFile(malformedFile),
      "INVALID_RUNNING_STATUS",
    );
    assertMidiError(
      () => readStandardMidiFile(smpteFile),
      "UNSUPPORTED_TIME_DIVISION",
    );

    const missingEndAnalysis = analyzeMidiImport(
      readStandardMidiFile(
        createRawFormatZeroFile(
          new Uint8Array([
            0x00, 0x90, 0x3c, 0x64,
            0x78, 0x80, 0x3c, 0x00,
          ]),
        ),
      ),
      "Missing end.mid",
    );

    assert.ok(
      missingEndAnalysis.warnings.some(
        (warning) => warning.includes("End of Track"),
      ),
    );
  });

  test("maps format-zero channels to instruments and ignores CC64 semantics", () => {
    const parsed = parseWrittenFile({
      format: 0,
      ticksPerQuarterNote: 480,
      tracks: [
        {
          events: [
            {
              kind: "track-name",
              absoluteTick: 0,
              text: "Combined channels",
            },
            {
              kind: "note-on",
              absoluteTick: 0,
              channel: 0,
              note: 60,
              velocity: 100,
            },
            {
              kind: "note-on",
              absoluteTick: 0,
              channel: 1,
              note: 67,
              velocity: 90,
            },
            {
              kind: "control-change",
              absoluteTick: 120,
              channel: 0,
              controller: 64,
              value: 127,
            },
            {
              kind: "note-off",
              absoluteTick: 240,
              channel: 0,
              note: 60,
              velocity: 0,
            },
            {
              kind: "control-change",
              absoluteTick: 300,
              channel: 0,
              controller: 64,
              value: 0,
            },
            {
              kind: "note-off",
              absoluteTick: 480,
              channel: 1,
              note: 67,
              velocity: 0,
            },
            {
              kind: "end-of-track",
              absoluteTick: 480,
            },
          ],
        },
      ],
    });
    const analysis = analyzeMidiImport(
      parsed,
      "Two channels.mid",
    );
    const project = createProjectFromMidiImport(
      analysis,
      "merge",
    );

    assert.equal(parsed.summary.controlChangeCount, 2);
    assert.equal(parsed.summary.sustainControlChangeCount, 2);
    assert.equal(analysis.ignoredControlChangeCount, 2);
    assert.equal(analysis.ignoredSustainControlChangeCount, 2);
    assert.equal(analysis.instrumentCandidates.length, 2);
    assert.deepEqual(
      analysis.instrumentCandidates.map(
        (candidate) => candidate.projectInstrument.id,
      ),
      [
        "midi-instrument-0-0",
        "midi-instrument-0-1",
      ],
    );
    assert.deepEqual(
      analysis.instrumentCandidates.map(
        (candidate) => candidate.projectInstrument.name,
      ),
      [
        "Channel 1",
        "Channel 2",
      ],
    );
    assert.ok(
      analysis.warnings.some(
        (warning) => warning.includes("CC64 sustain"),
      ),
    );
    assert.equal(
      analysis.warnings.filter(
        (warning) => warning.includes("Control Change"),
      ).length,
      0,
      "CC64 must not also produce a generic Control Change warning.",
    );
    assert.equal(
      getProjectNotes(project, "midi-instrument-0-0")[0]
        .durationTicks,
      480,
      "Sustain must not extend the channel-zero note.",
    );
    assert.equal(
      getProjectNotes(project, "midi-instrument-0-1")[0]
        .durationTicks,
      960,
    );
  });

  test("resolves imported collisions by merge or latest-note slicing", () => {
    const instrument = createDefaultProjectInstrument({
      id: "collision-instrument",
      name: "Collision Instrument",
      color: "#79a7ff",
    });
    const notes = [
      {
        id: "older",
        pitch: 60,
        startTick: 0,
        durationTicks: 960,
        velocity: 70,
        instrumentId: instrument.id,
        enabled: true,
      },
      {
        id: "newer",
        pitch: 60,
        startTick: 240,
        durationTicks: 480,
        velocity: 110,
        instrumentId: instrument.id,
        enabled: true,
      },
    ];
    const analysis = createImportAnalysis(
      instrument,
      notes,
      1,
    );
    const merged = createProjectFromMidiImport(
      analysis,
      "merge",
    );
    const sliced = createProjectFromMidiImport(
      analysis,
      "slice",
    );
    const mergedNotes = getProjectNotes(
      merged,
      instrument.id,
    );
    const slicedNotes = getProjectNotes(
      sliced,
      instrument.id,
    );

    assert.deepEqual(
      mergedNotes.map((note) => [
        note.id,
        note.startTick,
        note.durationTicks,
        note.velocity,
      ]),
      [
        ["older", 0, 960, 70],
      ],
    );
    assert.deepEqual(
      slicedNotes.map((note) => [
        note.startTick,
        note.durationTicks,
        note.velocity,
      ]),
      [
        [0, 240, 70],
        [240, 480, 110],
        [720, 240, 70],
      ],
    );
    assert.equal(slicedNotes[0].id, "older");
    assert.equal(slicedNotes[1].id, "newer");
    assert.match(slicedNotes[2].id, /^older-slice-/u);

    const invalidTimingAnalysis = {
      ...createImportAnalysis(
        instrument,
        [
          {
            ...notes[0],
            startTick: 0.5,
          },
        ],
        0,
      ),
      timelineEndTick: 960,
    };

    assert.throws(
      () => createProjectFromMidiImport(
        invalidTimingAnalysis,
        "merge",
      ),
      /tick|note|integer/iu,
    );
  });

  test("pairs dense repeated notes without shifting an active-note array", () => {
    const repeatedNoteCount = 2_000;
    const events = [];

    for (let index = 0; index < repeatedNoteCount; index += 1) {
      events.push({
        kind: "note-on",
        absoluteTick: index,
        channel: 0,
        note: 60,
        velocity: 80,
      });
    }

    for (let index = 0; index < repeatedNoteCount; index += 1) {
      events.push({
        kind: "note-off",
        absoluteTick: repeatedNoteCount + index,
        channel: 0,
        note: 60,
        velocity: 0,
      });
    }

    events.push({
      kind: "end-of-track",
      absoluteTick: repeatedNoteCount * 2,
    });

    const analysis = analyzeMidiImport(
      parseWrittenFile({
        format: 0,
        ticksPerQuarterNote: 960,
        tracks: [
          {
            events,
          },
        ],
      }),
      "Dense repeated notes.mid",
    );
    const notes = analysis.instrumentCandidates[0].notes;

    assert.equal(notes.length, repeatedNoteCount);
    assert.equal(notes[0].startTick, 0);
    assert.equal(notes[0].durationTicks, repeatedNoteCount);
    assert.equal(
      notes[repeatedNoteCount - 1].startTick,
      repeatedNoteCount - 1,
    );
    assert.equal(
      notes[repeatedNoteCount - 1].durationTicks,
      repeatedNoteCount,
    );
  });

  test("normalizes tempo limits while preserving supported imported meters", () => {
    const analysis = analyzeMidiImport(
      parseWrittenFile({
        format: 0,
        ticksPerQuarterNote: 480,
        tracks: [
          {
            events: [
              {
                kind: "tempo",
                absoluteTick: 0,
                microsecondsPerQuarterNote: 100_000,
              },
              {
                kind: "time-signature",
                absoluteTick: 0,
                numerator: 7,
                denominator: 8,
                midiClocksPerMetronome: 24,
                thirtySecondNotesPerQuarter: 8,
              },
              {
                kind: "end-of-track",
                absoluteTick: 0,
              },
            ],
          },
        ],
      }),
      "Fast seven.mid",
    );

    assert.equal(analysis.tempoBpm, 240);
    assert.deepEqual(
      analysis.timeSignature,
      {
        numerator: 7,
        denominator: 8,
      },
    );
    assert.ok(
      analysis.warnings.some(
        (warning) => warning.includes("editor limits"),
      ),
    );
  });

  test("keeps quantized one-tick notes inside converted measure boundaries", () => {
    const importedAnalysis = analyzeMidiImport(
      parseWrittenFile({
        format: 0,
        ticksPerQuarterNote: 1_920,
        tracks: [
          {
            events: [
              {
                kind: "note-on",
                absoluteTick: 7_679,
                channel: 0,
                note: 72,
                velocity: 100,
              },
              {
                kind: "note-off",
                absoluteTick: 7_680,
                channel: 0,
                note: 72,
                velocity: 0,
              },
              {
                kind: "end-of-track",
                absoluteTick: 7_680,
              },
            ],
          },
        ],
      }),
      "Boundary note.mid",
    );
    const importedProject = createProjectFromMidiImport(
      importedAnalysis,
      "merge",
    );
    const importedNote = getProjectNotes(
      importedProject,
      importedProject.instrumentOrder[0],
    )[0];

    assert.equal(getActiveTestClip(importedProject).measureCount, 1);
    assert.deepEqual(
      [
        importedNote.startTick,
        importedNote.durationTicks,
      ],
      [
        3_839,
        1,
      ],
    );

    const instrument = createDefaultProjectInstrument({
      id: "boundary-instrument",
      name: "Boundary Instrument",
      color: "#79a7ff",
    });
    const sourceTransport = createDefaultTransportState();
    const sourceClipId = "boundary-clip";
    const sourceProject = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      revision: 0,
      title: "Boundary export",
      projectInstrumentsById: {
        [instrument.id]: instrument,
      },
      instrumentOrder: [
        instrument.id,
      ],
      clipsById: {
        [sourceClipId]: {
          id: sourceClipId,
          name: "Boundary Clip",
          measureCount: 1,
          tracksByInstrumentId: {
            [instrument.id]: {
              instrumentId: instrument.id,
              notesById: {
                boundary: {
                  id: "boundary",
                  pitch: 72,
                  startTick: 191_999,
                  durationTicks: 1,
                  velocity: 100,
                  instrumentId: instrument.id,
                  enabled: true,
                },
              },
            },
          },
          transportSettings: {
            ...sourceTransport,
            ppqn: 48_000,
            loop: {
              startTick: 0,
              endTick: 192_000,
            },
          },
        },
      },
      clipOrder: [sourceClipId],
      activeClipId: sourceClipId,
      masterBus: createDefaultMasterBusState(),
    };
    const exported = createMidiExport(sourceProject);
    const exportedNoteEvents = exported.file.tracks[1].events
      .filter((event) =>
        event.kind === "note-on"
        || event.kind === "note-off");

    assert.equal(exported.file.ticksPerQuarterNote, 960);
    assert.deepEqual(
      exportedNoteEvents.map((event) => event.absoluteTick),
      [
        3_839,
        3_840,
      ],
    );
  });

  test("round-trips project notes, instruments, tempo, and meter through MIDI", () => {
    const lead = createDefaultProjectInstrument({
      id: "lead",
      name: "Lead",
      color: "#79a7ff",
    });
    const bass = createDefaultProjectInstrument({
      id: "bass",
      name: "Bass",
      color: "#a77bf3",
    });
    const defaultTransport = createDefaultTransportState();
    const sourceClipId = "round-trip-clip";
    const sourceProject = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      revision: 7,
      title: "MIDI round trip",
      projectInstrumentsById: {
        [lead.id]: lead,
        [bass.id]: bass,
      },
      instrumentOrder: [
        lead.id,
        bass.id,
      ],
      clipsById: {
        [sourceClipId]: {
          id: sourceClipId,
          name: "Round Trip Clip",
          measureCount: 4,
          tracksByInstrumentId: {
        [lead.id]: {
          instrumentId: lead.id,
          notesById: {
            "lead-c": {
              id: "lead-c",
              pitch: 60,
              startTick: 0,
              durationTicks: 480,
              velocity: 100,
              instrumentId: lead.id,
              enabled: true,
            },
            "lead-e": {
              id: "lead-e",
              pitch: 64,
              startTick: 240,
              durationTicks: 720,
              velocity: 88,
              instrumentId: lead.id,
              enabled: true,
            },
            "lead-c-next": {
              id: "lead-c-next",
              pitch: 60,
              startTick: 480,
              durationTicks: 240,
              velocity: 105,
              instrumentId: lead.id,
              enabled: true,
            },
          },
        },
        [bass.id]: {
          instrumentId: bass.id,
          notesById: {
            "bass-c": {
              id: "bass-c",
              pitch: 36,
              startTick: 120,
              durationTicks: 960,
              velocity: 92,
              instrumentId: bass.id,
              enabled: true,
            },
          },
        },
          },
          transportSettings: {
            ...defaultTransport,
            bpm: 120,
            timeSignature: {
              numerator: 3,
              denominator: 4,
            },
            loop: {
              startTick: 0,
              endTick: 2_880,
            },
          },
        },
      },
      clipOrder: [sourceClipId],
      activeClipId: sourceClipId,
      masterBus: createDefaultMasterBusState(),
    };
    const exported = createMidiExport(sourceProject);
    const parsed = parseWrittenFile(exported.file);
    const analysis = analyzeMidiImport(
      parsed,
      "MIDI round trip.mid",
    );
    const imported = createProjectFromMidiImport(
      analysis,
      "merge",
    );

    assert.deepEqual(exported.warnings, []);
    assert.equal(exported.file.format, 1);
    assert.equal(exported.file.tracks.length, 3);
    assert.equal(
      getActiveTestClip(imported).transportSettings.bpm,
      120,
    );
    assert.equal(
      getActiveTestClip(imported).measureCount,
      getActiveTestClip(sourceProject).measureCount,
    );
    assert.deepEqual(
      getActiveTestClip(imported).transportSettings.timeSignature,
      {
        numerator: 3,
        denominator: 4,
      },
    );
    assert.deepEqual(
      normalizeProjectInstruments(imported),
      normalizeProjectInstruments(sourceProject),
    );

    const disabledNoteProject = {
      ...sourceProject,
      clipsById: {
        ...sourceProject.clipsById,
        [sourceClipId]: {
          ...getActiveTestClip(sourceProject),
          tracksByInstrumentId: {
            ...getActiveTestClip(sourceProject).tracksByInstrumentId,
            [bass.id]: {
              ...getActiveTestClip(sourceProject).tracksByInstrumentId[bass.id],
              notesById: {
                ...getActiveTestClip(sourceProject).tracksByInstrumentId[bass.id].notesById,
                disabled: {
                  id: "disabled",
                  pitch: 71,
                  startTick: 0,
                  durationTicks: 240,
                  velocity: 100,
                  instrumentId: bass.id,
                  enabled: false,
                },
              },
            },
          },
        },
      },
    };
    const disabledNoteExport = createMidiExport(
      disabledNoteProject,
    );

    assert.equal(
      disabledNoteExport.file.tracks.some((track) =>
        track.events.some((event) =>
          event.kind === "note-on" && event.note === 71)),
      false,
    );

    const alternatePpqnProject = {
      ...sourceProject,
      clipsById: {
        ...sourceProject.clipsById,
        [sourceClipId]: {
          ...getActiveTestClip(sourceProject),
          transportSettings: {
            ...getActiveTestClip(sourceProject).transportSettings,
            ppqn: 480,
          },
        },
      },
    };
    const alternatePpqnExport =
      createMidiExport(alternatePpqnProject);

    assert.equal(
      alternatePpqnExport.file.ticksPerQuarterNote,
      480,
    );
    assert.equal(
      alternatePpqnExport.file.tracks[1].events.find(
        (event) =>
          event.kind === "note-on"
          && event.note === 64,
      ).absoluteTick,
      240,
    );
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

  console.log(`\n${passedTestCount} MIDI integration tests passed.`);
} finally {
  await vite.close();
}
