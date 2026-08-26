import { describe, expect, test } from "vitest";
import {
  DEFAULT_CLIP_COLOR,
  type ClipTimeline,
} from "../../../domain/clips/clip";
import { INSTRUMENT_CONSTANTS } from "../../../config/domain-limits";
import {
  createDefaultNativeEditorState,
  createNativeProjectFileMetadata,
} from "../../../use-cases/project-files/native-editor-state";
import {
  DEFAULT_CLIP_GROUP_COLOR,
  getClipPlaybackOrder,
} from "../../../domain/clips/clip-hierarchy";
import {
  createTestProject,
  createTestNote,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../../../../tests/support/test-builders";
import { NativeProjectFileError } from "../native-project-error";
import { parseNativeProjectFile } from "../parse-native-project";
import { serializeNativeProjectFile } from "../serialize-native-project";
import { NATIVE_PROJECT_FILE_FORMAT } from "../version";

describe("native project parser", () => {
  test("builds domain and workspace state from the current document", () => {
    const project = createTestProject({
      clips: [{
        id: TEST_CLIP_ID,
        bypassEnabled: true,
        notes: [createTestNote({
          id: "current-note",
          muted: true,
          locked: false,
        })],
      }],
    });
    const editor = createDefaultNativeEditorState(project);
    const metadata = createNativeProjectFileMetadata();
    const storedFixture = serializeNativeProjectFile(project, metadata, editor);

    expect(parseNativeProjectFile(storedFixture)).toEqual({
      metadata,
      projectState: project,
      editorState: editor,
    });
    const storedNote = JSON.parse(storedFixture).project
      .clipsById[TEST_CLIP_ID]
      .tracksByInstrumentId[TEST_INSTRUMENT_ID]
      .notesById["current-note"];

    expect(storedNote).toMatchObject({ muted: true, locked: false });
    expect(storedNote).not.toHaveProperty("status");
  });

  test("combines legacy note mute and instrument lock into note flags", () => {
    const project = createTestProject({
      clips: [{
        id: TEST_CLIP_ID,
        notes: [createTestNote({ id: "legacy-note" })],
      }],
    });
    const serialized = serializeNativeProjectFile(
      project,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    );
    const legacy = JSON.parse(serialized) as {
      project: {
        schemaVersion: number;
        clipsById: Record<string, {
          tracksByInstrumentId: Record<string, {
            notesById: Record<string, {
              muted?: boolean;
              locked?: boolean;
              enabled?: boolean;
            }>;
          }>;
          instrumentStatesById?: Record<string, { locked: boolean }>;
        }>;
      };
    };
    const clip = legacy.project.clipsById[TEST_CLIP_ID]!;
    const note = clip.tracksByInstrumentId[TEST_INSTRUMENT_ID]!
      .notesById["legacy-note"]!;

    legacy.project.schemaVersion = 7;
    delete note.muted;
    delete note.locked;
    note.enabled = false;
    clip.instrumentStatesById = {
      [TEST_INSTRUMENT_ID]: { locked: true },
    };

    const loaded = parseNativeProjectFile(JSON.stringify(legacy));

    expect(loaded.projectState.clipsById[TEST_CLIP_ID]!
      .tracksByInstrumentId[TEST_INSTRUMENT_ID]!
      .notesById["legacy-note"]!).toMatchObject({ muted: true, locked: true });
    expect("instrumentStatesById" in loaded.projectState.clipsById[TEST_CLIP_ID]!)
      .toBe(false);
  });

  test("migrates the v8 frozen status to muted and locked flags", () => {
    const project = createTestProject({
      clips: [{
        id: TEST_CLIP_ID,
        notes: [createTestNote({ id: "v8-note" })],
      }],
    });
    const stored = JSON.parse(serializeNativeProjectFile(
      project,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    )) as {
      project: {
        schemaVersion: number;
        clipsById: Record<string, {
          tracksByInstrumentId: Record<string, {
            notesById: Record<string, {
              muted?: boolean;
              locked?: boolean;
              status?: string;
            }>;
          }>;
        }>;
      };
    };

    stored.project.schemaVersion = 8;
    const note = stored.project.clipsById[TEST_CLIP_ID]!
      .tracksByInstrumentId[TEST_INSTRUMENT_ID]!
      .notesById["v8-note"]!;
    delete note.muted;
    delete note.locked;
    note.status = "frozen";

    const loaded = parseNativeProjectFile(JSON.stringify(stored));

    expect(loaded.projectState.schemaVersion).toBe(10);
    expect(loaded.projectState.clipsById[TEST_CLIP_ID]!
      .tracksByInstrumentId[TEST_INSTRUMENT_ID]!
      .notesById["v8-note"]!).toMatchObject({ muted: true, locked: true });
  });

  test("migrates every v9 note status to independent flags", () => {
    const project = createTestProject({
      clips: [{
        id: TEST_CLIP_ID,
        notes: [
          createTestNote({ id: "active", pitch: 60 }),
          createTestNote({ id: "muted", pitch: 61 }),
          createTestNote({ id: "locked", pitch: 62 }),
          createTestNote({ id: "disabled", pitch: 63 }),
        ],
      }],
    });
    const stored = JSON.parse(serializeNativeProjectFile(
      project,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    )) as {
      project: {
        schemaVersion: number;
        clipsById: Record<string, {
          tracksByInstrumentId: Record<string, {
            notesById: Record<string, {
              muted?: boolean;
              locked?: boolean;
              status?: string;
            }>;
          }>;
        }>;
      };
    };
    const notes = stored.project.clipsById[TEST_CLIP_ID]!
      .tracksByInstrumentId[TEST_INSTRUMENT_ID]!.notesById;

    stored.project.schemaVersion = 9;
    for (const status of ["active", "muted", "locked", "disabled"] as const) {
      delete notes[status]!.muted;
      delete notes[status]!.locked;
      notes[status]!.status = status;
    }

    const migratedNotes = parseNativeProjectFile(JSON.stringify(stored))
      .projectState.clipsById[TEST_CLIP_ID]!
      .tracksByInstrumentId[TEST_INSTRUMENT_ID]!.notesById;

    expect(migratedNotes["active"]).toMatchObject({ muted: false, locked: false });
    expect(migratedNotes["muted"]).toMatchObject({ muted: true, locked: false });
    expect(migratedNotes["locked"]).toMatchObject({ muted: false, locked: true });
    expect(migratedNotes["disabled"]).toMatchObject({ muted: true, locked: true });
  });

  test("round-trips bypassed clip groups", () => {
    const base = createTestProject();
    const project = {
      ...base,
      clipHierarchy: [{
        kind: "group" as const,
        id: "group-bypassed",
        name: "Bypassed group",
        color: "#79a7ff",
        bypassEnabled: true,
        children: base.clipHierarchy,
      }],
    };
    const editor = createDefaultNativeEditorState(project);
    const metadata = createNativeProjectFileMetadata();

    expect(parseNativeProjectFile(
      serializeNativeProjectFile(project, metadata, editor),
    )).toEqual({
      metadata,
      projectState: project,
      editorState: editor,
    });
  });

  test("defaults clip bypass to disabled when loading a schema v5 project", () => {
    const project = createTestProject();
    const serialized = serializeNativeProjectFile(
      project,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    );
    const stored = JSON.parse(serialized) as {
      project: {
        schemaVersion: number;
        clipsById: Record<string, { bypassEnabled?: boolean }>;
      };
    };

    stored.project.schemaVersion = 5;
    delete stored.project.clipsById[TEST_CLIP_ID]?.bypassEnabled;

    const loaded = parseNativeProjectFile(JSON.stringify(stored));

    expect(loaded.projectState.clipsById[TEST_CLIP_ID]?.bypassEnabled)
      .toBe(false);
    expect(serializeNativeProjectFile(
      loaded.projectState,
      loaded.metadata,
      loaded.editorState,
    )).toContain('"bypassEnabled": false');
  });

  test("defaults group bypass to disabled when loading a schema v6 project", () => {
    const project = createTestProject();
    const serialized = serializeNativeProjectFile(
      project,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    );
    const stored = JSON.parse(serialized) as {
      project: {
        schemaVersion: number;
        clipHierarchy: unknown[];
      };
    };

    stored.project.schemaVersion = 6;
    stored.project.clipHierarchy = [{
      kind: "group",
      id: "legacy-group",
      name: "Legacy group",
      color: "#79a7ff",
      children: stored.project.clipHierarchy,
    }];

    const loaded = parseNativeProjectFile(JSON.stringify(stored));

    expect(loaded.projectState.clipHierarchy[0]).toMatchObject({
      kind: "group",
      id: "legacy-group",
      bypassEnabled: false,
    });
    expect(serializeNativeProjectFile(
      loaded.projectState,
      loaded.metadata,
      loaded.editorState,
    )).toContain('"bypassEnabled": false');
  });

  test("migrates the first legacy clip auto-advance to project scope", () => {
    const project = createTestProject();
    const serialized = serializeNativeProjectFile(
      project,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    );
    const stored = JSON.parse(serialized) as {
      formatVersion: number;
      project: {
        schemaVersion: number;
        autoAdvanceEnabled?: boolean;
        clipsById: Record<string, {
          transportSettings: Record<string, unknown>;
        }>;
      };
    };
    const storedClip = stored.project.clipsById[TEST_CLIP_ID];

    expect(storedClip).toBeDefined();
    stored.formatVersion = 2;
    stored.project.schemaVersion = 2;
    const legacyProject = stored.project as unknown as Record<string, unknown>;
    legacyProject["clipOrder"] = getClipPlaybackOrder(project.clipHierarchy);
    delete legacyProject["clipHierarchy"];
    delete stored.project.autoAdvanceEnabled;
    storedClip!.transportSettings["autoAdvanceEnabled"] = false;

    const loaded = parseNativeProjectFile(JSON.stringify(stored));

    expect(loaded.projectState.autoAdvanceEnabled).toBe(false);
    expect("autoAdvanceEnabled" in (
      loaded.projectState.clipsById[TEST_CLIP_ID]?.transportSettings ?? {}
    )).toBe(false);
    const migratedSerialization = serializeNativeProjectFile(
      loaded.projectState,
      loaded.metadata,
      loaded.editorState,
    );
    const migratedSource = JSON.parse(migratedSerialization) as {
      project: {
        autoAdvanceEnabled: boolean;
        clipsById: Record<string, {
          transportSettings: Record<string, unknown>;
        }>;
      };
    };

    expect(migratedSource.project.autoAdvanceEnabled).toBe(false);
    expect("autoAdvanceEnabled" in migratedSource.project
      .clipsById[TEST_CLIP_ID]!.transportSettings).toBe(false);
  });

  test("adds the default color when loading a clip saved before colors", () => {
    const project = createTestProject();
    const serialized = serializeNativeProjectFile(
      project,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    );
    const stored = JSON.parse(serialized) as {
      project: {
        clipsById: Record<string, { color?: string }>;
      };
    };

    delete stored.project.clipsById[TEST_CLIP_ID]?.color;

    expect(parseNativeProjectFile(JSON.stringify(stored))
      .projectState.clipsById[TEST_CLIP_ID]?.color).toBe(DEFAULT_CLIP_COLOR);
  });

  test("adds the default group color when loading a schema v4 project", () => {
    const project = createTestProject();
    const serialized = serializeNativeProjectFile(
      project,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    );
    const stored = JSON.parse(serialized) as {
      project: {
        schemaVersion: number;
        clipHierarchy: unknown[];
      };
    };
    const previousHierarchy = stored.project.clipHierarchy;

    stored.project.schemaVersion = 4;
    stored.project.clipHierarchy = [{
      kind: "group",
      id: "legacy-group",
      name: "Legacy group",
      children: previousHierarchy,
    }];

    const loaded = parseNativeProjectFile(JSON.stringify(stored));

    expect(loaded.projectState.schemaVersion).toBe(10);
    expect(loaded.projectState.clipHierarchy[0]).toMatchObject({
      kind: "group",
      id: "legacy-group",
      color: DEFAULT_CLIP_GROUP_COLOR,
    });
  });

  test("adds neutral synth controls when loading projects saved before them", () => {
    const project = createTestProject();
    const serialized = serializeNativeProjectFile(
      project,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    );
    const stored = JSON.parse(serialized) as {
      project: {
        projectInstrumentsById: Record<string, {
          instrument: Record<string, unknown> & {
            envelope: Record<string, unknown>;
            filterEnvelope: Record<string, unknown>;
          };
        }>;
        instrumentPresetsById: Record<string, {
          config: Record<string, unknown> & {
            envelope: Record<string, unknown>;
            filterEnvelope: Record<string, unknown>;
          };
        }>;
      };
    };
    const configs = [
      ...Object.values(stored.project.projectInstrumentsById)
        .map(({ instrument }) => instrument),
      ...Object.values(stored.project.instrumentPresetsById)
        .map(({ config }) => config),
    ];

    for (const config of configs) {
      delete config["oscillatorFreePhase"];
      delete config["filterKeyTracking"];
      delete config.envelope["curve"];
      delete config.filterEnvelope["curve"];
    }

    const loaded = parseNativeProjectFile(JSON.stringify(stored));
    const config = loaded.projectState.projectInstrumentsById[
      project.instrumentOrder[0]!
    ]?.instrument;

    expect(config?.oscillatorFreePhase)
      .toBe(INSTRUMENT_CONSTANTS.oscillatorFreePhase);
    expect(config?.filterKeyTracking)
      .toBe(INSTRUMENT_CONSTANTS.filterKeyTracking);
    expect(config?.envelope.curve)
      .toBe(INSTRUMENT_CONSTANTS.legacyEnvelopeCurve);
    expect(config?.filterEnvelope.curve)
      .toBe(INSTRUMENT_CONSTANTS.legacyEnvelopeCurve);
  });

  test("reports a stable code and path for invalid JSON", () => {
    try {
      parseNativeProjectFile("{not-json");
      throw new Error("Expected parsing to fail.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NativeProjectFileError);
      expect(error).toMatchObject({ code: "INVALID_JSON", path: "$" });
    }
  });

  test("rejects unsupported stored versions before domain parsing", () => {
    try {
      parseNativeProjectFile(JSON.stringify({
        format: NATIVE_PROJECT_FILE_FORMAT,
        formatVersion: 4,
      }));
      throw new Error("Expected version recognition to fail.");
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: "UNSUPPORTED_VERSION",
        path: "$.formatVersion",
      });
    }
  });

  test("loads v1 playhead fields without persisting them again", () => {
    const project = createTestProject();
    const serialized = serializeNativeProjectFile(
      project,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    );
    const legacy = JSON.parse(serialized) as {
      formatVersion: number;
      project: {
        schemaVersion: number;
        clipsById: Record<string, {
          transportSettings: Record<string, unknown>;
        }>;
      };
      editor: {
        clipStatesById: Record<string, Record<string, unknown>>;
      };
    };

    legacy.formatVersion = 1;
    legacy.project.schemaVersion = 1;
    const legacyProject = legacy.project as unknown as Record<string, unknown>;
    legacyProject["clipOrder"] = getClipPlaybackOrder(project.clipHierarchy);
    delete legacyProject["clipHierarchy"];

    for (const clipId of getClipPlaybackOrder(project.clipHierarchy)) {
      legacy.project.clipsById[clipId]!.transportSettings["anchorTick"] = 240;
      legacy.editor.clipStatesById[clipId]!["playheadTick"] = 240;
    }

    const loaded = parseNativeProjectFile(JSON.stringify(legacy));
    const loadedClip = loaded.projectState.clipsById[TEST_CLIP_ID];
    const loadedEditor = loaded.editorState.clipStatesById[TEST_CLIP_ID];

    expect(loaded.projectState.schemaVersion).toBe(10);
    expect(loadedClip).toBeDefined();
    expect(loadedEditor).toBeDefined();
    expect("anchorTick" in (loadedClip?.transportSettings ?? {})).toBe(false);
    expect("playheadTick" in (loadedEditor ?? {})).toBe(false);
    expect(serializeNativeProjectFile(
      loaded.projectState,
      loaded.metadata,
      loaded.editorState,
    )).not.toContain("playheadTick");
  });

  test("round-trips clips with multiple meter and tempo markers", () => {
    const project = createTestProject();
    const clip = project.clipsById[TEST_CLIP_ID];

    expect(clip).toBeDefined();

    if (clip === undefined) {
      return;
    }

    // 2 × 4/4 then 2 × 7/8 (2+2+3), with a tempo change in between.
    const timeline: ClipTimeline = {
      durationTicks: 2 * 3_840 + 2 * 3_360,
      timeMap: {
        meterMarkers: [
          { startTick: 0, timeSignature: { numerator: 4, denominator: 4 } },
          {
            startTick: 7_680,
            timeSignature: {
              numerator: 7,
              denominator: 8,
              beatGroups: [2, 2, 3],
            },
          },
        ],
        tempoMarkers: [
          { startTick: 0, bpm: 120 },
          { startTick: 3_840, bpm: 92.5 },
        ],
        scaleMarkers: clip.timeline.timeMap.scaleMarkers,
      },
    };
    const customProject = {
      ...project,
      clipsById: {
        ...project.clipsById,
        [TEST_CLIP_ID]: { ...clip, timeline },
      },
    };
    const serialized = serializeNativeProjectFile(
      customProject,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(customProject),
    );
    const loaded = parseNativeProjectFile(serialized);

    expect(loaded.projectState.clipsById[TEST_CLIP_ID]?.timeline)
      .toEqual(timeline);
  });

  test("rejects a meter marker off a measure boundary", () => {
    const project = createTestProject();
    const serialized = serializeNativeProjectFile(
      project,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    );
    const tampered = JSON.parse(serialized) as {
      project: {
        clipsById: Record<string, {
          timeline: {
            timeMap: {
              meterMarkers: { startTick: number; timeSignature: unknown }[];
            };
          };
        }>;
      };
    };
    const storedClip = tampered.project.clipsById[TEST_CLIP_ID];

    expect(storedClip).toBeDefined();

    storedClip?.timeline.timeMap.meterMarkers.push({
      startTick: 1_000,
      timeSignature: { numerator: 3, denominator: 4 },
    });

    try {
      parseNativeProjectFile(JSON.stringify(tampered));
      throw new Error("Expected timeline validation to fail.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NativeProjectFileError);
      expect(error).toMatchObject({ code: "INVALID_DATA" });
    }
  });
});
