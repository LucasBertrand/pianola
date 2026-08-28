import { IDBFactory } from "fake-indexeddb";
import {
  describe,
  expect,
  test,
} from "vitest";
import {
  InMemoryUserSettingsRepository,
} from "../memory/in-memory-user-settings-repository";
import {
  IndexedDbUserSettingsRepository,
} from "../indexed-db/indexed-db-user-settings-repository";
import {
  idbRequest,
  idbTransaction,
  PianolaIndexedDb,
  PIANOLA_STORES,
} from "../indexed-db/pianola-indexed-db";
import {
  createDefaultInstrumentConfig,
} from "../../../domain/instrument-presets";
import {
  createPersonalInstrumentPreset,
} from "../../../domain/personal-instrument-presets";

describe("user settings repository", () => {
  test("serializes atomic updates", async () => {
    const repository = new InMemoryUserSettingsRepository();
    const first = repository.update((current) => ({
      ...current,
      noteColorMode: "pitch",
    }));
    const second = repository.update((current) => ({
      ...current,
      pitchPreviewEnabled: !current.pitchPreviewEnabled,
    }));

    await Promise.all([first, second]);
    await expect(repository.load()).resolves.toMatchObject({
      noteColorMode: "pitch",
      pitchPreviewEnabled: false,
    });
  });

  test("keeps independent personal preset snapshots", async () => {
    const repository = new InMemoryUserSettingsRepository();
    const preset = createPersonalInstrumentPreset(
      "personal-preset-repository",
      "Repository Lead",
      createDefaultInstrumentConfig(0),
    );

    await repository.update((current) => ({
      ...current,
      personalInstrumentPresetsById: { [preset.id]: preset },
      personalInstrumentPresetOrder: [preset.id],
    }));
    const loaded = await repository.load();

    expect(loaded.personalInstrumentPresetsById[preset.id]).toEqual(preset);
    expect(loaded.personalInstrumentPresetsById[preset.id])
      .not.toBe(preset);
    expect(loaded.personalInstrumentPresetsById[preset.id]?.config)
      .not.toBe(preset.config);
  });

  test("updates an existing personal preset without duplicating it", async () => {
    const repository = new InMemoryUserSettingsRepository();
    const preset = createPersonalInstrumentPreset(
      "personal-preset-update",
      "Mutable Lead",
      createDefaultInstrumentConfig(0),
    );

    await repository.update((current) => ({
      ...current,
      personalInstrumentPresetsById: { [preset.id]: preset },
      personalInstrumentPresetOrder: [preset.id],
    }));
    await repository.update((current) => ({
      ...current,
      personalInstrumentPresetsById: {
        ...current.personalInstrumentPresetsById,
        [preset.id]: createPersonalInstrumentPreset(
          preset.id,
          preset.name,
          {
            ...preset.config,
            filterCutoffHz: 4_200,
          },
        ),
      },
    }));

    await expect(repository.load()).resolves.toMatchObject({
      personalInstrumentPresetOrder: [preset.id],
      personalInstrumentPresetsById: {
        [preset.id]: {
          id: preset.id,
          name: preset.name,
          config: { filterCutoffHz: 4_200 },
        },
      },
    });
  });

  test("preserves invalid settings diagnostically and restores defaults", async () => {
    const repository = new InMemoryUserSettingsRepository({
      serialized: "{broken",
      diagnostic: null,
    });

    await expect(repository.load()).resolves.toMatchObject({
      selectionMode: "replace",
      noteColorMode: "instrument",
    });
    expect(repository.storage.diagnostic).toBe("{broken");
  });

  test("recovers invalid IndexedDB settings and keeps a diagnostic copy", async () => {
    const database = new PianolaIndexedDb(
      new IDBFactory(),
      `pianola-settings-${crypto.randomUUID()}`,
    );
    const connection = await database.open();
    const write = connection.transaction(
      PIANOLA_STORES.userSettings,
      "readwrite",
    );
    const writeDone = idbTransaction(write);
    write.objectStore(PIANOLA_STORES.userSettings).put({
      key: "current",
      serialized: "{broken-indexeddb-settings",
    });
    await writeDone;
    const repository = new IndexedDbUserSettingsRepository(database);

    await expect(repository.load()).resolves.toMatchObject({
      selectionMode: "replace",
      noteColorMode: "instrument",
    });

    const read = connection.transaction(
      PIANOLA_STORES.diagnostics,
      "readonly",
    );
    const readDone = idbTransaction(read);
    const diagnostics = await idbRequest(
      read.objectStore(PIANOLA_STORES.diagnostics).getAll(),
    ) as Array<Record<string, unknown>>;
    await readDone;
    expect(diagnostics).toMatchObject([{
      kind: "invalid-user-settings",
      serialized: "{broken-indexeddb-settings",
    }]);
  });
});
