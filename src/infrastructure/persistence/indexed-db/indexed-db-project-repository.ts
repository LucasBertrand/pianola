import {
  type ProjectRepository,
  type ProjectGenerationDiagnostic,
  type ProjectLoadResult,
  type ProjectRecoveryExport,
  type ProjectSummary,
  type StoredProject,
  type StoredRevision,
} from "../../../application/ports/project-repository";
import type {
  StoredProjectCodec,
} from "../../../application/ports/stored-project-codec";
import {
  ProjectPersistenceError,
} from "../codecs/project-persistence-error";
import {
  idbRequest,
  idbTransaction,
  PIANOLA_STORES,
  type PianolaIndexedDb,
} from "./pianola-indexed-db";
import {
  assertStorageCapacity,
} from "../browser/browser-storage-policy";
import {
  createGenerationDiagnostic,
  createRecoveryExport,
  deleteProjectDiagnostics,
  deleteProjectGenerations,
  deleteProjectGenerationsExcept,
  formatRecoveryFailure,
  getProjectGenerations,
  type ProjectRecoveryDiagnosticRecord,
  type StoredProjectGenerationRecord,
} from "./indexed-db-project-recovery";

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

  public load(documentId: string): Promise<ProjectLoadResult | null> {
    return this.enqueue(async () => {
      const database = await this.database.open();
      const transaction = database.transaction(
        [
          PIANOLA_STORES.projectCatalog,
          PIANOLA_STORES.projectGenerations,
          PIANOLA_STORES.diagnostics,
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
      const diagnostics: ProjectGenerationDiagnostic[] = [];

      for (const candidate of candidates) {
        try {
          const decoded = await this.codec.decode(candidate.serialized);
          const project = decoded.project;
          assertGenerationMatches(project, candidate);

          if (
            decoded.migration.sourceVersion
            !== decoded.migration.targetVersion
          ) {
            return this.publishMigration(project, candidate, decoded.migration);
          }

          if (candidate.revision !== summary.revision) {
            await this.publishRecovery(project, candidate.byteSize);
          }

          await this.clearRecoveryDiagnostics(documentId);
          return { project, migration: decoded.migration };
        } catch (error: unknown) {
          diagnostics.push(createGenerationDiagnostic(candidate, error));

          if (
            error instanceof ProjectPersistenceError
            && error.code === "FUTURE_VERSION"
          ) {
            await this.recordRecoveryDiagnostics(documentId, diagnostics);
            throw new ProjectPersistenceError(
              "FUTURE_VERSION",
              formatRecoveryFailure(documentId, diagnostics),
              { cause: error },
            );
          }

          failure = error;
        }
      }

      await this.recordRecoveryDiagnostics(documentId, diagnostics);

      throw new ProjectPersistenceError(
        "CORRUPT_DATA",
        formatRecoveryFailure(documentId, diagnostics),
        { cause: failure },
      );
    });
  }

  public exportRecovery(
    documentId: string,
  ): Promise<ProjectRecoveryExport | null> {
    return this.enqueue(async () => {
      const database = await this.database.open();
      const transaction = database.transaction(
        [PIANOLA_STORES.projectGenerations, PIANOLA_STORES.diagnostics],
        "readonly",
      );
      const done = idbTransaction(transaction);
      const generations = await getProjectGenerations(
        transaction.objectStore(PIANOLA_STORES.projectGenerations),
        documentId,
      );
      const diagnosticRecords = await idbRequest(
        transaction.objectStore(PIANOLA_STORES.diagnostics).getAll(),
      ) as ProjectRecoveryDiagnosticRecord[];
      await done;

      if (generations.length === 0) {
        return null;
      }

      return createRecoveryExport(
        documentId,
        generations,
        diagnosticRecords.filter((entry) => (
          entry.kind === "project-recovery"
          && entry.documentId === documentId
        )),
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
          PIANOLA_STORES.diagnostics,
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
          PIANOLA_STORES.diagnostics,
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
      await deleteProjectDiagnostics(
        transaction.objectStore(PIANOLA_STORES.diagnostics),
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

  private async publishMigration(
    project: StoredProject,
    sourceGeneration: StoredProjectGenerationRecord,
    migration: ProjectLoadResult["migration"],
  ): Promise<ProjectLoadResult> {
    const canonical: StoredProject = {
      ...project,
      revision: sourceGeneration.revision + 1,
    };
    const encoded = await this.codec.encode(canonical);
    await assertStorageCapacity(encoded.byteSize);
    const database = await this.database.open();
    const transaction = database.transaction(
      [
        PIANOLA_STORES.projectCatalog,
        PIANOLA_STORES.projectGenerations,
        PIANOLA_STORES.diagnostics,
      ],
      "readwrite",
    );
    const done = idbTransaction(transaction);
    const generations = transaction.objectStore(
      PIANOLA_STORES.projectGenerations,
    );

    generations.put({
      documentId: canonical.documentId,
      revision: canonical.revision,
      serialized: encoded.serialized,
      byteSize: encoded.byteSize,
    } satisfies StoredProjectGenerationRecord);
    transaction.objectStore(PIANOLA_STORES.projectCatalog).put(
      createSummary(canonical, encoded.byteSize),
    );
    await deleteProjectGenerationsExcept(
      generations,
      canonical.documentId,
      new Set([sourceGeneration.revision, canonical.revision]),
    );
    await deleteProjectDiagnostics(
      transaction.objectStore(PIANOLA_STORES.diagnostics),
      canonical.documentId,
    );
    await done;

    return { project: canonical, migration };
  }

  private async recordRecoveryDiagnostics(
    documentId: string,
    diagnostics: readonly ProjectGenerationDiagnostic[],
  ): Promise<void> {
    const database = await this.database.open();
    const transaction = database.transaction(
      PIANOLA_STORES.diagnostics,
      "readwrite",
    );
    const done = idbTransaction(transaction);
    const store = transaction.objectStore(PIANOLA_STORES.diagnostics);
    await deleteProjectDiagnostics(store, documentId);

    for (const diagnostic of diagnostics) {
      store.add({
        ...diagnostic,
        kind: "project-recovery",
        documentId,
        recordedAt: new Date().toISOString(),
      } satisfies ProjectRecoveryDiagnosticRecord);
    }

    await done;
  }

  private async clearRecoveryDiagnostics(documentId: string): Promise<void> {
    const database = await this.database.open();
    const transaction = database.transaction(
      PIANOLA_STORES.diagnostics,
      "readwrite",
    );
    const done = idbTransaction(transaction);
    await deleteProjectDiagnostics(
      transaction.objectStore(PIANOLA_STORES.diagnostics),
      documentId,
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

function createSummary(
  project: StoredProject,
  byteSize: number,
): ProjectSummary {
  return {
    documentId: project.documentId,
    title: project.document.title,
    schemaVersion: project.document.schemaVersion,
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
