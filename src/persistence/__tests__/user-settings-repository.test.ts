import { IDBFactory } from "fake-indexeddb";
import {
  describe,
  expect,
  test,
} from "vitest";
import {
  InMemoryUserSettingsRepository,
} from "../in-memory-user-settings-repository";
import {
  IndexedDbUserSettingsRepository,
} from "../../pwa/persistence/indexed-db-user-settings-repository";
import {
  idbRequest,
  idbTransaction,
  PianolaIndexedDb,
  PIANOLA_STORES,
} from "../../pwa/persistence/pianola-indexed-db";

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
