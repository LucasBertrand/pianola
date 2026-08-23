import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createTestProject,
} from "../../../../tests/support/test-builders";
import {
  createDefaultProjectWorkspace,
} from "../project-workspace";
import {
  createStoredProjectClone,
} from "../clone-stored-project";

describe("stored project cloning", () => {
  test("creates a distinct revision-zero project with the same content", () => {
    const document = { ...createTestProject(), revision: 14 };
    const source = {
      documentId: "project-source",
      revision: 8,
      updatedAt: "2026-08-22T12:00:00.000Z",
      document,
      workspace: createDefaultProjectWorkspace(document),
    };

    const clone = createStoredProjectClone(
      source,
      "project-clone",
      "2026-08-23T12:00:00.000Z",
    );

    expect(clone).toMatchObject({
      documentId: "project-clone",
      revision: 0,
      updatedAt: "2026-08-23T12:00:00.000Z",
      document: {
        revision: 0,
        title: `${document.title} Copy`,
        clipsById: document.clipsById,
      },
      workspace: source.workspace,
    });
  });
});
