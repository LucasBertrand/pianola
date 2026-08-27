import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createTestProject,
} from "../../../tests/support/test-builders";
import {
  parsePianolaProject,
  serializePianolaProject,
} from "../../infrastructure/project-files/pianola/pianola-project-codec";
import {
  createDefaultPersistedEditorWorkspace,
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
import {
  createDefaultInstrumentConfig,
} from "../../domain/instrument-presets";
import {
  createPersonalInstrumentPreset,
} from "../../domain/personal-instrument-presets";
import {
  getClipPlaybackOrder,
} from "../../domain/clips/clip-hierarchy";

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
    const serialized = serializePianolaProject({
      sourceDocumentId: "pianola-project",
      exportedAt: "2026-08-22T12:00:00.000Z",
      document,
      workspace: createDefaultPersistedEditorWorkspace(document),
    });

    expect(parsePianolaProject(serialized)).toMatchObject({
      sourceDocumentId: "pianola-project",
      document: {
        title: document.title,
        autoScrollEnabled: true,
      },
      workspace: { activeClipId: document.workspace.activeClipId },
    });
    expect(serialized).not.toContain("selectionMode");
    expect(serialized).not.toContain("pitchPreviewEnabled");
    expect(serialized).not.toContain("playheadTick");
    expect(parsePianolaProject(serialized).document
      .clipsById[activeClipId]?.timeline.timeMap.sectionMarkers)
      .toEqual([{ startTick: 960, comment: "Verse" }]);
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
      .document.instrumentPresetsById[preset.id]).toEqual(preset);
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

  test("migrates v1 portable playhead fields to transient state", () => {
    const document = createTestProject();
    const serialized = serializePianolaProject({
      sourceDocumentId: "pianola-project",
      exportedAt: "2026-08-22T12:00:00.000Z",
      document,
      workspace: createDefaultPersistedEditorWorkspace(document),
    });
    const legacy = JSON.parse(serialized) as {
      schemaVersion: number;
      document: {
        schemaVersion: number;
        clipsById: Record<string, {
          transportSettings: Record<string, unknown>;
        }>;
      };
      workspace: {
        clipStatesById: Record<string, Record<string, unknown>>;
      };
    };

    legacy.schemaVersion = 1;
    legacy.document.schemaVersion = 1;
    const legacyDocument = legacy.document as unknown as Record<string, unknown>;
    legacyDocument["clipOrder"] = getClipPlaybackOrder(document.clipHierarchy);
    delete legacyDocument["clipHierarchy"];

    for (const clipId of getClipPlaybackOrder(document.clipHierarchy)) {
      legacy.document.clipsById[clipId]!
        .transportSettings["anchorTick"] = 480;
      legacy.workspace.clipStatesById[clipId]!["playheadTick"] = 480;
    }

    const migrated = parsePianolaProject(JSON.stringify(legacy));
    const clipId = getClipPlaybackOrder(document.clipHierarchy)[0]!;

    expect(migrated.document.schemaVersion).toBe(12);
    expect("anchorTick" in migrated.document.clipsById[clipId]!
      .transportSettings).toBe(false);
    expect("playheadTick" in migrated.workspace.clipStatesById[clipId]!)
      .toBe(false);
    expect(serializePianolaProject(migrated)).not.toContain("playheadTick");
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

  test("round-trips personal presets and migrates settings saved before them", () => {
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

    const legacyEnvelope = JSON.parse(serializeUserSettings(
      settings,
      "2026-08-24T12:00:00.000Z",
    )) as { settings: Record<string, unknown> };

    delete legacyEnvelope.settings["personalInstrumentPresetsById"];
    delete legacyEnvelope.settings["personalInstrumentPresetOrder"];

    const migrated = parseUserSettingsEnvelope(
      JSON.stringify(legacyEnvelope),
    ).settings;

    expect(migrated.personalInstrumentPresetOrder).toEqual([]);
    expect(migrated.personalInstrumentPresetsById).toEqual({});
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
