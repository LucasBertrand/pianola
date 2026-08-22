import {
  ProjectPersistenceError,
  type ProjectRepository,
  type ProjectSummary,
  type StoredProject,
  type StoredProjectCodec,
  type StoredRevision,
} from "../../persistence/project-persistence-model";
import {
  idbRequest,
  idbTransaction,
  PIANOLA_STORES,
  type PianolaIndexedDb,
} from "./pianola-indexed-db";
import {
  assertStorageCapacity,
} from "./browser-storage-policy";

interface StoredProjectGenerationRecord {
  readonly documentId: string;
  readonly revision: number;
  readonly serialized: string;
  readonly byteSize: number;
}

export class IndexedDbProjectRepository implements ProjectRepository {
  private operation = Promise.resolve();

  public constructor(
    private readonly database: PianolaIndexedDb,
    private readonly codec: StoredProjectCodec,
  ) {}

  public list(): Promise<readonly ProjectSummary[]> {
    return this.enqueue(async () => {
      const database = await this.database.open();
      const transaction = database.transaction(
        PIANOLA_STORES.projectCatalog,
        "readonly",
      );
      const done = idbTransaction(transaction);
      const summaries = await idbRequest(
        transaction.objectStore(PIANOLA_STORES.projectCatalog).getAll(),
      ) as ProjectSummary[];
      await done;
      return summaries
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((summary) => ({ ...summary }));
    });
  }

  public load(documentId: string): Promise<StoredProject | null> {
    return this.enqueue(async () => {
      const database = await this.database.open();
      const transaction = database.transaction(
        [
          PIANOLA_STORES.projectCatalog,
          PIANOLA_STORES.projectGenerations,
        ],
        "readonly",
      );
      const done = idbTransaction(transaction);
      const summary = await idbRequest(
        transaction.objectStore(PIANOLA_STORES.projectCatalog).get(documentId),
      ) as ProjectSummary | undefined;

      if (summary === undefined) {
        await done;
        return null;
      }

      const generationStore = transaction.objectStore(
        PIANOLA_STORES.projectGenerations,
      );
      const current = await idbRequest(generationStore.get([
        documentId,
        summary.revision,
      ])) as StoredProjectGenerationRecord | undefined;
      const previous = summary.revision <= 1
        ? undefined
        : await idbRequest(generationStore.get([
            documentId,
            summary.revision - 1,
          ])) as StoredProjectGenerationRecord | undefined;
      await done;

      const candidates = [current, previous].filter(
        (entry): entry is StoredProjectGenerationRecord =>
          entry !== undefined,
      );
      let failure: unknown = null;

      for (const candidate of candidates) {
        try {
          const project = await this.codec.decode(candidate.serialized);
          assertGenerationMatches(project, candidate);

          if (candidate.revision !== summary.revision) {
            await this.publishRecovery(project, candidate.byteSize);
          }

          return project;
        } catch (error: unknown) {
          if (
            error instanceof ProjectPersistenceError
            && error.code === "FUTURE_VERSION"
          ) {
            throw error;
          }

          failure = error;
        }
      }

      throw new ProjectPersistenceError(
        "CORRUPT_DATA",
        `No valid recovery generation exists for project ${documentId}.`,
        { cause: failure },
      );
    });
  }

  public save(
    snapshot: StoredProject,
    expectedRevision: number | null,
  ): Promise<StoredRevision> {
    return this.enqueue(async () => {
      const nextRevision = (expectedRevision ?? 0) + 1;
      const candidate: StoredProject = {
        ...snapshot,
        revision: nextRevision,
      };
      const encoded = await this.codec.encode(candidate);
      await assertStorageCapacity(encoded.byteSize);
      const database = await this.database.open();
      const transaction = database.transaction(
        [
          PIANOLA_STORES.projectCatalog,
          PIANOLA_STORES.projectGenerations,
        ],
        "readwrite",
      );
      const done = idbTransaction(transaction);

      try {
        const catalog = transaction.objectStore(
          PIANOLA_STORES.projectCatalog,
        );
        const generations = transaction.objectStore(
          PIANOLA_STORES.projectGenerations,
        );
        const current = await idbRequest(
          catalog.get(snapshot.documentId),
        ) as ProjectSummary | undefined;
        const actualRevision = current?.revision ?? null;

        if (actualRevision !== expectedRevision) {
          transaction.abort();

          try {
            await done;
          } catch {
            // The explicit abort is expected for optimistic conflicts.
          }

          throw new ProjectPersistenceError(
            "CONFLICT",
            `Expected project revision ${String(expectedRevision)}, `
              + `but found ${String(actualRevision)}.`,
          );
        }

        generations.put({
          documentId: snapshot.documentId,
          revision: nextRevision,
          serialized: encoded.serialized,
          byteSize: encoded.byteSize,
        } satisfies StoredProjectGenerationRecord);
        catalog.put(createSummary(candidate, encoded.byteSize));

        if (nextRevision > 2) {
          generations.delete([snapshot.documentId, nextRevision - 2]);
        }

        await done;
      } catch (error: unknown) {
        throw mapIndexedDbError(error);
      }

      return {
        documentId: snapshot.documentId,
        revision: nextRevision,
        updatedAt: snapshot.updatedAt,
      };
    });
  }

  public remove(documentId: string): Promise<void> {
    return this.enqueue(async () => {
      const database = await this.database.open();
      const transaction = database.transaction(
        [
          PIANOLA_STORES.projectCatalog,
          PIANOLA_STORES.projectGenerations,
        ],
        "readwrite",
      );
      const done = idbTransaction(transaction);
      const catalog = transaction.objectStore(
        PIANOLA_STORES.projectCatalog,
      );
      catalog.delete(documentId);
      await deleteProjectGenerations(
        transaction.objectStore(PIANOLA_STORES.projectGenerations),
        documentId,
      );

      await done;
    });
  }

  private async publishRecovery(
    project: StoredProject,
    byteSize: number,
  ): Promise<void> {
    const database = await this.database.open();
    const transaction = database.transaction(
      PIANOLA_STORES.projectCatalog,
      "readwrite",
    );
    const done = idbTransaction(transaction);
    transaction.objectStore(PIANOLA_STORES.projectCatalog).put(
      createSummary(project, byteSize),
    );
    await done;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function deleteProjectGenerations(
  store: IDBObjectStore,
  documentId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.openCursor();

    request.onerror = () => reject(
      request.error ?? new Error("Unable to enumerate project generations."),
    );
    request.onsuccess = () => {
      const cursor = request.result;

      if (cursor === null) {
        resolve();
        return;
      }

      const record = cursor.value as StoredProjectGenerationRecord;

      if (record.documentId === documentId) {
        cursor.delete();
      }

      cursor.continue();
    };
  });
}

function createSummary(
  project: StoredProject,
  byteSize: number,
): ProjectSummary {
  return {
    documentId: project.documentId,
    title: project.document.title,
    revision: project.revision,
    updatedAt: project.updatedAt,
    byteSize,
  };
}

function assertGenerationMatches(
  project: StoredProject,
  generation: StoredProjectGenerationRecord,
): void {
  if (
    project.documentId !== generation.documentId
    || project.revision !== generation.revision
  ) {
    throw new ProjectPersistenceError(
      "CORRUPT_DATA",
      "Stored project generation metadata is inconsistent.",
    );
  }
}

function mapIndexedDbError(error: unknown): Error {
  if (error instanceof ProjectPersistenceError) {
    return error;
  }

  if (
    error instanceof DOMException
    && error.name === "QuotaExceededError"
  ) {
    return new ProjectPersistenceError(
      "QUOTA_EXCEEDED",
      "The browser has no space available for this project.",
      { cause: error },
    );
  }

  return new ProjectPersistenceError(
    "STORAGE_UNAVAILABLE",
    "The local project library is unavailable.",
    { cause: error },
  );
}
