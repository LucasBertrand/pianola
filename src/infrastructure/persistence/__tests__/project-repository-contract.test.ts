import { IDBFactory } from "fake-indexeddb";
import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createTestProject,
} from "../../../../tests/support/test-builders";
import {
  DIRECT_STORED_PROJECT_CODEC,
} from "../codecs/direct-stored-project-codec";
import {
  IndexedDbProjectRepository,
} from "../indexed-db/indexed-db-project-repository";
import {
  PianolaIndexedDb,
  PIANOLA_STORES,
  idbTransaction,
} from "../indexed-db/pianola-indexed-db";
import {
  createDefaultPersistedEditorWorkspace,
} from "../../../application/editor-session/workspace-persistence";
import {
  createInMemoryProjectStorage,
  InMemoryProjectRepository,
  type InMemoryProjectStorage,
} from "../memory/in-memory-project-repository";
import {
  type ProjectRepository,
  type StoredProject,
} from "../../../application/ports/project-repository";

interface RepositoryHarness {
  readonly repository: ProjectRepository;
  readonly restart: () => ProjectRepository;
  readonly corruptCurrent: (documentId: string) => Promise<void>;
}

describe("project repository contract", () => {
  runRepositoryContract("memory", createMemoryHarness);
  runRepositoryContract("IndexedDB", createIndexedDbHarness);

  test("reports quota exhaustion without publishing a project", async () => {
    const repository = new InMemoryProjectRepository(
      DIRECT_STORED_PROJECT_CODEC,
      createInMemoryProjectStorage(),
      1,
    );

    await expect(repository.save(createSnapshot(), null)).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
    });
    await expect(repository.list()).resolves.toEqual([]);
  });

  test("an aborted IndexedDB publication leaves the prior revision visible", async () => {
    const factory = new IDBFactory();
    const database = new PianolaIndexedDb(
      factory,
      `pianola-abort-${crypto.randomUUID()}`,
    );
    const repository = new IndexedDbProjectRepository(
      database,
      DIRECT_STORED_PROJECT_CODEC,
    );
    const snapshot = createSnapshot();
    await repository.save(snapshot, null);
    const connection = await database.open();
    const transaction = connection.transaction(
      [
        PIANOLA_STORES.projectCatalog,
        PIANOLA_STORES.projectGenerations,
      ],
      "readwrite",
    );
    const done = idbTransaction(transaction);
    transaction.objectStore(PIANOLA_STORES.projectGenerations).put({
      documentId: snapshot.documentId,
      revision: 2,
      serialized: "interrupted-generation",
      byteSize: 22,
    });
    transaction.abort();
    await expect(done).rejects.toThrow();

    await expect(repository.load(snapshot.documentId)).resolves.toMatchObject({
      revision: 1,
      document: { title: snapshot.document.title },
    });
  });

  test("refuses a future local envelope without falling back", async () => {
    const storage = createInMemoryProjectStorage();
    const repository = createMemoryRepository(storage);
    const snapshot = createSnapshot();
    await repository.save(snapshot, null);
    const generation = storage.generations.get(snapshot.documentId)?.[0];

    if (generation === undefined) {
      throw new Error("Stored generation is missing.");
    }

    const source = JSON.parse(generation.serialized) as Record<string, unknown>;
    source["schemaVersion"] = 999;
    storage.generations.set(snapshot.documentId, [{
      ...generation,
      serialized: JSON.stringify(source),
    }]);

    await expect(repository.load(snapshot.documentId)).rejects.toMatchObject({
      code: "FUTURE_VERSION",
    });
  });
});

function runRepositoryContract(
  label: string,
  createHarness: () => RepositoryHarness,
): void {
  describe(label, () => {
    test("survives a repository restart", async () => {
      const harness = createHarness();
      const snapshot = createSnapshot();
      const saved = await harness.repository.save(snapshot, null);
      const restarted = harness.restart();

      expect(saved.revision).toBe(1);
      await expect(restarted.load(snapshot.documentId)).resolves.toMatchObject({
        documentId: snapshot.documentId,
        revision: 1,
        document: { title: snapshot.document.title },
      });
      await expect(restarted.list()).resolves.toMatchObject([{
        schemaVersion: snapshot.document.schemaVersion,
      }]);
    });

    test("rejects a stale concurrent revision", async () => {
      const harness = createHarness();
      const snapshot = createSnapshot();
      await harness.repository.save(snapshot, null);
      const changed = {
        ...snapshot,
        updatedAt: "2026-08-22T10:01:00.000Z",
        document: { ...snapshot.document, title: "Changed" },
      };
      const first = harness.repository.save(changed, 1);
      const second = harness.repository.save(changed, 1);

      await expect(first).resolves.toMatchObject({ revision: 2 });
      await expect(second).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(harness.repository.load(snapshot.documentId))
        .resolves.toMatchObject({
          revision: 2,
          document: { title: "Changed" },
        });
    });

    test("falls back to the previous valid generation", async () => {
      const harness = createHarness();
      const snapshot = createSnapshot();
      await harness.repository.save(snapshot, null);
      await harness.repository.save({
        ...snapshot,
        updatedAt: "2026-08-22T10:02:00.000Z",
        document: { ...snapshot.document, title: "Second generation" },
      }, 1);
      await harness.corruptCurrent(snapshot.documentId);

      await expect(harness.repository.load(snapshot.documentId))
        .resolves.toMatchObject({
          revision: 1,
          document: { title: snapshot.document.title },
        });
      await expect(harness.repository.list()).resolves.toMatchObject([
        { revision: 1 },
      ]);
    });

    test("removes both catalog and payload generations", async () => {
      const harness = createHarness();
      const snapshot = createSnapshot();
      await harness.repository.save(snapshot, null);
      await harness.repository.remove(snapshot.documentId);

      await expect(harness.repository.load(snapshot.documentId))
        .resolves.toBeNull();
      await expect(harness.repository.list()).resolves.toEqual([]);
    });
  });
}

function createSnapshot(): StoredProject {
  const document = createTestProject();

  return {
    documentId: "repository-contract-project",
    revision: 0,
    updatedAt: "2026-08-22T10:00:00.000Z",
    document,
    workspace: createDefaultPersistedEditorWorkspace(document),
  };
}

function createMemoryHarness(): RepositoryHarness {
  const storage = createInMemoryProjectStorage();

  return {
    repository: createMemoryRepository(storage),
    restart: () => createMemoryRepository(storage),
    async corruptCurrent(documentId) {
      const generations = storage.generations.get(documentId);
      const current = generations?.[generations.length - 1];

      if (generations === undefined || current === undefined) {
        throw new Error("Current generation is missing.");
      }

      generations[generations.length - 1] = {
        ...current,
        serialized: "{not-json",
      };
    },
  };
}

function createMemoryRepository(storage: InMemoryProjectStorage) {
  return new InMemoryProjectRepository(
    DIRECT_STORED_PROJECT_CODEC,
    storage,
  );
}

function createIndexedDbHarness(): RepositoryHarness {
  const factory = new IDBFactory();
  const databaseName = `pianola-test-${crypto.randomUUID()}`;
  const database = new PianolaIndexedDb(factory, databaseName);

  return {
    repository: new IndexedDbProjectRepository(
      database,
      DIRECT_STORED_PROJECT_CODEC,
    ),
    restart: () => new IndexedDbProjectRepository(
      new PianolaIndexedDb(factory, databaseName),
      DIRECT_STORED_PROJECT_CODEC,
    ),
    async corruptCurrent(documentId) {
      const connection = await database.open();
      const transaction = connection.transaction(
        PIANOLA_STORES.projectGenerations,
        "readwrite",
      );
      const done = idbTransaction(transaction);
      transaction.objectStore(PIANOLA_STORES.projectGenerations).put({
        documentId,
        revision: 2,
        serialized: "{not-json",
        byteSize: 9,
      });
      await done;
    },
  };
}
