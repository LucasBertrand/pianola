import { describe, expect, test } from "vitest";
import {
  type ClipTimeline,
} from "../../../domain/clips/clip";
import {
  createDefaultNativeEditorState,
  createNativeProjectFileMetadata,
} from "../../../use-cases/project-files/native-editor-state";
import {
  createTestProject,
  TEST_CLIP_ID,
} from "../../../../tests/support/test-builders";
import { NativeProjectFileError } from "../native-project-error";
import { parseNativeProjectFile } from "../parse-native-project";
import { serializeNativeProjectFile } from "../serialize-native-project";
import { NATIVE_PROJECT_FILE_FORMAT } from "../version";

describe("native project parser", () => {
  test("builds domain and workspace state from the current document", () => {
    const project = createTestProject();
    const editor = createDefaultNativeEditorState(project);
    const metadata = createNativeProjectFileMetadata();
    const storedFixture = serializeNativeProjectFile(project, metadata, editor);

    expect(parseNativeProjectFile(storedFixture)).toEqual({
      metadata,
      projectState: project,
      editorState: editor,
    });
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
      .projectState.clipsById[TEST_CLIP_ID]?.color).toBe("#79a7ff");
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

    for (const clipId of project.clipOrder) {
      legacy.project.clipsById[clipId]!.transportSettings["anchorTick"] = 240;
      legacy.editor.clipStatesById[clipId]!["playheadTick"] = 240;
    }

    const loaded = parseNativeProjectFile(JSON.stringify(legacy));
    const loadedClip = loaded.projectState.clipsById[TEST_CLIP_ID];
    const loadedEditor = loaded.editorState.clipStatesById[TEST_CLIP_ID];

    expect(loaded.projectState.schemaVersion).toBe(3);
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
