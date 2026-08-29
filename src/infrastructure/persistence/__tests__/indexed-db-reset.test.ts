import { IDBFactory } from "fake-indexeddb";
import {
  expect,
  test,
} from "vitest";
import {
  idbRequest,
  idbTransaction,
  PIANOLA_DATABASE_VERSION,
  PIANOLA_STORES,
  PianolaIndexedDb,
} from "../indexed-db/pianola-indexed-db";

test("resets local data from an older IndexedDB baseline", async () => {
  const factory = new IDBFactory();
  const databaseName = `pianola-reset-older-${crypto.randomUUID()}`;
  const olderDatabase = await openDatabase(
    factory,
    databaseName,
    PIANOLA_DATABASE_VERSION - 1,
    (database) => {
      database.createObjectStore(
        PIANOLA_STORES.projectCatalog,
        { keyPath: "documentId" },
      );
      database.createObjectStore(
        PIANOLA_STORES.userSettings,
        { keyPath: "key" },
      );
    },
  );
  const seed = olderDatabase.transaction(
    [PIANOLA_STORES.projectCatalog, PIANOLA_STORES.userSettings],
    "readwrite",
  );
  const seedDone = idbTransaction(seed);
  seed.objectStore(PIANOLA_STORES.projectCatalog).put({
    documentId: "unsupported-project",
  });
  seed.objectStore(PIANOLA_STORES.userSettings).put({
    key: "current",
    serialized: "unsupported-settings",
  });
  await seedDone;
  olderDatabase.close();

  const database = new PianolaIndexedDb(factory, databaseName);
  const current = await database.open();

  expect(database.resetReason).toBe("schema-version-upgrade");
  expect(Array.from(current.objectStoreNames).sort()).toEqual(
    Object.values(PIANOLA_STORES).sort(),
  );
  await expect(readAll(current, PIANOLA_STORES.projectCatalog))
    .resolves.toEqual([]);
  await expect(readAll(current, PIANOLA_STORES.userSettings))
    .resolves.toEqual([]);
  database.close();
});

test("resets local data created by a newer incompatible database", async () => {
  const factory = new IDBFactory();
  const databaseName = `pianola-reset-newer-${crypto.randomUUID()}`;
  const future = await openDatabase(
    factory,
    databaseName,
    PIANOLA_DATABASE_VERSION + 1,
    (database) => {
      database.createObjectStore("future-data");
    },
  );
  const seed = future.transaction("future-data", "readwrite");
  const seedDone = idbTransaction(seed);
  seed.objectStore("future-data").put("future", "key");
  await seedDone;
  future.close();

  const database = new PianolaIndexedDb(factory, databaseName);
  const current = await database.open();

  expect(database.resetReason).toBe("database-version-newer");
  expect(current.version).toBe(PIANOLA_DATABASE_VERSION);
  expect(current.objectStoreNames.contains("future-data")).toBe(false);
  expect(Array.from(current.objectStoreNames).sort()).toEqual(
    Object.values(PIANOLA_STORES).sort(),
  );
  database.close();
});

function openDatabase(
  factory: IDBFactory,
  databaseName: string,
  version: number,
  upgrade: (database: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, version);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll(
  database: IDBDatabase,
  storeName: string,
): Promise<unknown[]> {
  const transaction = database.transaction(storeName, "readonly");
  const done = idbTransaction(transaction);
  const records = await idbRequest(transaction.objectStore(storeName).getAll());
  await done;
  return records;
}
