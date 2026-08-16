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

describe("native v1 parser", () => {
  test("builds domain and workspace state from a stored v1 document", () => {
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
        formatVersion: 2,
      }));
      throw new Error("Expected version recognition to fail.");
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: "UNSUPPORTED_VERSION",
        path: "$.formatVersion",
      });
    }
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
scaleMarkers: [],
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
