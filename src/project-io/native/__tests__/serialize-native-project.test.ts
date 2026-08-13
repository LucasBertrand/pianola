import { describe, expect, test } from "vitest";
import {
  createDefaultNativeEditorState,
  createNativeProjectFileMetadata,
} from "../../../use-cases/project-files/native-editor-state";
import { createTestProject } from "../../../../tests/support/test-builders";
import { serializeNativeProjectFile } from "../serialize-native-project";

describe("native v1 serializer", () => {
  test("produces deterministic, readable JSON for identical input", () => {
    const project = createTestProject();
    const metadata = {
      ...createNativeProjectFileMetadata(),
      documentId: "native-v1-test",
      createdAt: "2026-08-13T08:00:00.000Z",
      savedAt: "2026-08-13T08:00:00.000Z",
    };
    const editor = createDefaultNativeEditorState(project);

    expect(serializeNativeProjectFile(project, metadata, editor))
      .toBe(serializeNativeProjectFile(project, metadata, editor));
  });

  test("rejects values that cannot belong to the stored JSON schema", () => {
    const project = createTestProject();
    const invalidProject = {
      ...project,
      masterBus: { ...project.masterBus, gain: Number.NaN },
    };

    expect(() => serializeNativeProjectFile(
      invalidProject,
      createNativeProjectFileMetadata(),
      createDefaultNativeEditorState(project),
    )).toThrow("finite numbers");
  });
});
