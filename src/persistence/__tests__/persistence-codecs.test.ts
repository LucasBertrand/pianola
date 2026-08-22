import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createTestProject,
} from "../../../tests/support/test-builders";
import {
  parsePortableProject,
  serializePortableProject,
} from "../../project-io/portable/portable-project-codec";
import {
  createDefaultProjectWorkspace,
} from "../../use-cases/persistence/project-workspace";
import {
  InMemoryProjectRepository,
} from "../in-memory-project-repository";
import {
  DIRECT_STORED_PROJECT_CODEC,
} from "../../project-io/local/direct-stored-project-codec";
import {
  parseUserSettingsEnvelope,
  recoverDefaultUserSettings,
  serializeUserSettings,
} from "../user-settings-codec";

describe("persistence codecs", () => {
  test("round-trips the new portable document and workspace", () => {
    const document = createTestProject();
    const serialized = serializePortableProject({
      sourceDocumentId: "portable-project",
      exportedAt: "2026-08-22T12:00:00.000Z",
      document,
      workspace: createDefaultProjectWorkspace(document),
    });

    expect(parsePortableProject(serialized)).toMatchObject({
      sourceDocumentId: "portable-project",
      document: { title: document.title },
      workspace: { activeClipId: document.workspace.activeClipId },
    });
    expect(serialized).not.toContain("selectionMode");
    expect(serialized).not.toContain("pitchPreviewEnabled");
  });

  test("refuses a future portable version", () => {
    const document = createTestProject();
    const serialized = serializePortableProject({
      sourceDocumentId: "portable-project",
      exportedAt: "2026-08-22T12:00:00.000Z",
      document,
      workspace: createDefaultProjectWorkspace(document),
    });
    const source = JSON.parse(serialized) as Record<string, unknown>;
    source["schemaVersion"] = 999;

    expect(() => parsePortableProject(JSON.stringify(source)))
      .toThrow("newer than this application");
  });

  test("validates user settings and rejects duplicate shortcuts", () => {
    const settings = recoverDefaultUserSettings();
    const duplicate = {
      ...settings,
      shortcuts: {
        ...settings.shortcuts,
        "editor.redo": settings.shortcuts["editor.undo"],
      },
    };

    expect(() => serializeUserSettings(
      duplicate,
      "2026-08-22T12:00:00.000Z",
    )).toThrow("same binding");
    expect(parseUserSettingsEnvelope(serializeUserSettings(
      settings,
      "2026-08-22T12:00:00.000Z",
    )).settings).toEqual(settings);
  });

  test("rejects browser-reserved shortcut bindings", () => {
    const settings = recoverDefaultUserSettings();

    expect(() => serializeUserSettings({
      ...settings,
      shortcuts: {
        ...settings.shortcuts,
        "editor.undo": {
          code: "KeyW",
          control: true,
          shift: false,
          alt: false,
          meta: false,
        },
      },
    }, "2026-08-22T12:00:00.000Z")).toThrow("reserved or inaccessible");
  });

  test("an invalid import cannot mutate the local library", async () => {
    const repository = new InMemoryProjectRepository(
      DIRECT_STORED_PROJECT_CODEC,
    );

    expect(() => parsePortableProject("{invalid-json"))
      .toThrow("valid JSON");
    await expect(repository.list()).resolves.toEqual([]);
  });
});
