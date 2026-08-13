import { describe, expect, test } from "vitest";
import {
  createDefaultNativeEditorState,
  createNativeProjectFileMetadata,
} from "../../../use-cases/project-files/native-editor-state";
import { createTestProject } from "../../../../tests/support/test-builders";
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
});
