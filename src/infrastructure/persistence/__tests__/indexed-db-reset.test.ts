import { IDBFactory } from "fake-indexeddb";
import {
  expect,
  test,
} from "vitest";
import {
  idbTransaction,
  PIANOLA_DATABASE_NAME,
  PIANOLA_DATABASE_VERSION,
  PIANOLA_STORES,
  PianolaIndexedDb,
} from "../indexed-db/pianola-indexed-db";

test("creates the complete first IndexedDB layout", async () => {
  const factory = new IDBFactory();
  const database = new PianolaIndexedDb(factory);
  const current = await database.open();

  expect(PIANOLA_DATABASE_NAME).toBe("pianola");
  expect(PIANOLA_DATABASE_VERSION).toBe(1);
  expect(database.layoutMigration).toBeNull();
  expect(Array.from(current.objectStoreNames).sort()).toEqual(
    Object.values(PIANOLA_STORES).sort(),
  );
  database.close();
});

test("recreates an incompatible newer IndexedDB layout", async () => {
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
