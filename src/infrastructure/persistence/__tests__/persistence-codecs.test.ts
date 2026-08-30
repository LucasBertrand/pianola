import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createTestProject,
} from "../../../../tests/support/test-builders";
import {
  parsePianolaProject,
  serializePianolaProject,
} from "../../project-files/pianola/pianola-project-codec";
import {
  createDefaultPersistedEditorWorkspace,
} from "../../../application/editor-session/workspace-persistence";
import {
  InMemoryProjectRepository,
} from "../memory/in-memory-project-repository";
import {
  DIRECT_STORED_PROJECT_CODEC,
} from "../codecs/direct-stored-project-codec";
import {
  parseUserSettingsEnvelope,
  serializeUserSettings,
} from "../codecs/user-settings-codec";
import {
  recoverDefaultUserSettings,
} from "../../../application/ports/user-settings-repository";
import {
  createDefaultInstrumentConfig,
} from "../../../domain/instrument-presets";
import {
  createPersonalInstrumentPreset,
} from "../../../domain/personal-instrument-presets";

describe("persistence codecs", () => {
  test("round-trips the new portable document and workspace", () => {
    const baseDocument = createTestProject();
    const activeClipId = baseDocument.workspace.activeClipId;
    const activeClip = baseDocument.clipsById[activeClipId]!;
    const document = {
      ...baseDocument,
      autoScrollEnabled: true,
      clipsById: {
        ...baseDocument.clipsById,
        [activeClipId]: {
          ...activeClip,
          timeline: {
            ...activeClip.timeline,
            timeMap: {
              ...activeClip.timeline.timeMap,
              sectionMarkers: [{ startTick: 960, comment: "Verse" }],
            },
          },
        },
      },
    };
    const defaultWorkspace = createDefaultPersistedEditorWorkspace(document);
    const activeClipState = defaultWorkspace.clipStatesById[activeClipId]!;
    const workspace = {
      ...defaultWorkspace,
      clipStatesById: {
        ...defaultWorkspace.clipStatesById,
        [activeClipId]: {
          ...activeClipState,
          pitchSnapSettings: {
            ...activeClipState.pitchSnapSettings,
            enabled: true,
            visualGuideEnabled: true,
            rootNote: "C",
            patternType: "chord" as const,
            patternId: "m13",
          },
        },
      },
    };
    const serialized = serializePianolaProject({
      sourceDocumentId: "pianola-project",
      exportedAt: "2026-08-22T12:00:00.000Z",
      document,
      workspace,
    });

    expect(parsePianolaProject(serialized)).toMatchObject({
      migration: { sourceVersion: 1, targetVersion: 1, changes: [] },
      project: {
        sourceDocumentId: "pianola-project",
        document: {
          title: document.title,
          autoScrollEnabled: true,
        },
        workspace: {
          activeClipId: document.workspace.activeClipId,
          clipStatesById: {
            [activeClipId]: {
              pitchSnapSettings: {
                rootNote: "C",
                patternType: "chord",
                patternId: "m13",
              },
            },
          },
        },
      },
    });
    expect(serialized).not.toContain("selectionMode");
    expect(serialized).not.toContain("pitchPreviewEnabled");
    expect(serialized).not.toContain("playheadTick");
    expect(parsePianolaProject(serialized).project.document
      .clipsById[activeClipId]?.timeline.timeMap.sectionMarkers)
      .toEqual([{ startTick: 960, comment: "Verse" }]);
  });

  test("rejects unsupported pitch patterns in a persisted workspace", () => {
    const document = createTestProject();
    const activeClipId = document.workspace.activeClipId;
    const serialized = serializePianolaProject({
      sourceDocumentId: "invalid-pitch-pattern",
      exportedAt: "2026-08-22T12:00:00.000Z",
      document,
      workspace: createDefaultPersistedEditorWorkspace(document),
    });
    const source = JSON.parse(serialized) as {
      workspace: {
        clipStatesById: Record<string, {
          pitchSnapSettings: { patternType: string; patternId: string };
        }>;
      };
    };
    source.workspace.clipStatesById[activeClipId]!.pitchSnapSettings = {
      ...source.workspace.clipStatesById[activeClipId]!.pitchSnapSettings,
      patternType: "chord",
      patternId: "not-a-chord",
    };

    expect(() => parsePianolaProject(JSON.stringify(source)))
      .toThrow("Unsupported pitch pattern");
  });

  test("keeps an embedded personal preset in portable project exports", () => {
    const document = createTestProject();
    const preset = createPersonalInstrumentPreset(
      "personal-portable-preset",
      "Portable Keys",
      createDefaultInstrumentConfig(2),
    );
    const withPreset = {
      ...document,
      instrumentPresetsById: {
        ...document.instrumentPresetsById,
        [preset.id]: preset,
      },
      instrumentPresetOrder: [...document.instrumentPresetOrder, preset.id],
    };
    const serialized = serializePianolaProject({
      sourceDocumentId: "portable-personal-preset",
      exportedAt: "2026-08-24T12:00:00.000Z",
      document: withPreset,
      workspace: createDefaultPersistedEditorWorkspace(withPreset),
    });

    expect(parsePianolaProject(serialized)
      .project.document.instrumentPresetsById[preset.id]).toEqual(preset);
  });

  test("refuses a future portable version", () => {
    const document = createTestProject();
    const serialized = serializePianolaProject({
      sourceDocumentId: "pianola-project",
      exportedAt: "2026-08-22T12:00:00.000Z",
      document,
      workspace: createDefaultPersistedEditorWorkspace(document),
    });
    const source = JSON.parse(serialized) as Record<string, unknown>;
    source["schemaVersion"] = 999;

    expect(() => parsePianolaProject(JSON.stringify(source)))
      .toThrow("Project file version 999 is not supported");
  });

  test("rejects unknown portable fields", () => {
    const document = createTestProject();
    const source = JSON.parse(serializePianolaProject({
      sourceDocumentId: "unknown-field",
      exportedAt: "2026-08-22T12:00:00.000Z",
      document,
      workspace: createDefaultPersistedEditorWorkspace(document),
    })) as Record<string, unknown>;
    source["unexpected"] = true;

    expect(() => parsePianolaProject(JSON.stringify(source)))
      .toThrow("unknown fields");
  });

  test("rejects the pre-baseline document schema", () => {
    const document = createTestProject();
    const serialized = serializePianolaProject({
      sourceDocumentId: "pianola-project",
      exportedAt: "2026-08-22T12:00:00.000Z",
      document,
      workspace: createDefaultPersistedEditorWorkspace(document),
    });
    const previous = JSON.parse(serialized) as {
      document: { schemaVersion: number };
    };
    previous.document.schemaVersion = 12;

    expect(() => parsePianolaProject(JSON.stringify(previous)))
      .toThrow("Project schema version 12 is not supported");
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

  test("round-trips personal presets and rejects incomplete settings", () => {
    const settings = recoverDefaultUserSettings();
    const preset = createPersonalInstrumentPreset(
      "personal-preset-test",
      "My Warm Keys",
      {
        ...createDefaultInstrumentConfig(0),
        filterKeyTracking: 0.75,
      },
    );
    const withPreset = {
      ...settings,
      personalInstrumentPresetsById: { [preset.id]: preset },
      personalInstrumentPresetOrder: [preset.id],
    };
    const roundTrip = parseUserSettingsEnvelope(serializeUserSettings(
      withPreset,
      "2026-08-24T12:00:00.000Z",
    )).settings;

    expect(roundTrip.personalInstrumentPresetOrder).toEqual([preset.id]);
    expect(roundTrip.personalInstrumentPresetsById[preset.id])
      .toEqual(preset);

    const incompleteEnvelope = JSON.parse(serializeUserSettings(
      settings,
      "2026-08-24T12:00:00.000Z",
    )) as { settings: Record<string, unknown> };

    delete incompleteEnvelope.settings["personalInstrumentPresetsById"];
    delete incompleteEnvelope.settings["personalInstrumentPresetOrder"];

    expect(() => parseUserSettingsEnvelope(
      JSON.stringify(incompleteEnvelope),
    )).toThrow("Expected an array");
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

    expect(() => parsePianolaProject("{invalid-json"))
      .toThrow("valid JSON");
    await expect(repository.list()).resolves.toEqual([]);
  });
});
