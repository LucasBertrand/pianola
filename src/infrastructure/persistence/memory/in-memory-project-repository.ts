import {
  type ProjectRepository,
  type ProjectGenerationDiagnostic,
  type ProjectLoadResult,
  type ProjectRecoveryCause,
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

export interface InMemoryProjectGeneration {
  readonly documentId: string;
  readonly revision: number;
  readonly serialized: string;
  readonly byteSize: number;
}

export interface InMemoryProjectStorage {
  readonly summaries: Map<string, ProjectSummary>;
  readonly generations: Map<string, InMemoryProjectGeneration[]>;
  readonly diagnostics: Map<string, readonly ProjectGenerationDiagnostic[]>;
}

export function createInMemoryProjectStorage(): InMemoryProjectStorage {
  return {
    summaries: new Map(),
    generations: new Map(),
    diagnostics: new Map(),
  };
}

export class InMemoryProjectRepository implements ProjectRepository {
  private operation = Promise.resolve();

  public constructor(
    private readonly codec: StoredProjectCodec,
    private readonly storage = createInMemoryProjectStorage(),
    private readonly maximumBytes = Number.POSITIVE_INFINITY,
  ) {}

  public list(): Promise<readonly ProjectSummary[]> {
    return this.enqueue(() => Promise.resolve(
      [...this.storage.summaries.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((summary) => ({ ...summary })),
    ));
  }

  public load(documentId: string): Promise<ProjectLoadResult | null> {
    return this.enqueue(async () => {
      const generations = this.storage.generations.get(documentId);

      if (generations === undefined || generations.length === 0) {
        return null;
      }

      let failure: unknown = null;
      const diagnostics: ProjectGenerationDiagnostic[] = [];

      for (const generation of [...generations].reverse()) {
        try {
          const decoded = await this.codec.decode(generation.serialized);
          const project = decoded.project;

          if (
            project.documentId !== documentId
            || project.revision !== generation.revision
          ) {
            throw new ProjectPersistenceError(
              "CORRUPT_DATA",
              "Stored project generation metadata is inconsistent.",
            );
          }

          if (generation !== generations[generations.length - 1]) {
            this.storage.summaries.set(
              documentId,
              createSummary(project, generation.byteSize),
            );
          }

          this.storage.diagnostics.delete(documentId);

          if (
            decoded.migration.sourceVersion
            !== decoded.migration.targetVersion
          ) {
            return this.publishMigration(
              project,
              generation,
              decoded.migration,
            );
          }

          return { project, migration: decoded.migration };
        } catch (error: unknown) {
          diagnostics.push(createGenerationDiagnostic(generation, error));

          if (
            error instanceof ProjectPersistenceError
            && error.code === "FUTURE_VERSION"
          ) {
            this.storage.diagnostics.set(documentId, diagnostics);
            throw new ProjectPersistenceError(
              "FUTURE_VERSION",
              formatRecoveryFailure(documentId, diagnostics),
              { cause: error },
            );
          }

          failure = error;
        }
      }

      this.storage.diagnostics.set(documentId, diagnostics);

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
    return this.enqueue(() => {
      const generations = this.storage.generations.get(documentId);

      if (generations === undefined || generations.length === 0) {
        return Promise.resolve(null);
      }

      return Promise.resolve(createRecoveryExport(
        documentId,
        generations,
        this.storage.diagnostics.get(documentId) ?? [],
      ));
    });
  }

  public save(
    snapshot: StoredProject,
    expectedRevision: number | null,
  ): Promise<StoredRevision> {
    return this.enqueue(async () => {
      const current = this.storage.summaries.get(snapshot.documentId);
      const actualRevision = current?.revision ?? null;

      if (actualRevision !== expectedRevision) {
        throw new ProjectPersistenceError(
          "CONFLICT",
          `Expected project revision ${String(expectedRevision)}, `
            + `but found ${String(actualRevision)}.`,
        );
      }

      const nextRevision = (actualRevision ?? 0) + 1;
      const candidate: StoredProject = {
        ...snapshot,
        revision: nextRevision,
      };
      const encoded = await this.codec.encode(candidate);

      if (encoded.byteSize > this.maximumBytes) {
        throw new ProjectPersistenceError(
          "QUOTA_EXCEEDED",
          "The project exceeds the available storage quota.",
        );
      }

      const generations = this.storage.generations.get(snapshot.documentId)
        ?? [];
      const nextGenerations = [
        ...generations.filter(
          (generation) => generation.revision !== nextRevision,
        ),
        {
          documentId: snapshot.documentId,
          revision: nextRevision,
          serialized: encoded.serialized,
          byteSize: encoded.byteSize,
        },
      ].slice(-2);

      this.storage.generations.set(snapshot.documentId, nextGenerations);
      this.storage.summaries.set(
        snapshot.documentId,
        createSummary(candidate, encoded.byteSize),
      );

      return {
        documentId: snapshot.documentId,
        revision: nextRevision,
        updatedAt: snapshot.updatedAt,
      };
    });
  }

  public remove(documentId: string): Promise<void> {
    return this.enqueue(() => {
      this.storage.summaries.delete(documentId);
      this.storage.generations.delete(documentId);
      this.storage.diagnostics.delete(documentId);
      return Promise.resolve();
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async publishMigration(
    project: StoredProject,
    sourceGeneration: InMemoryProjectGeneration,
    migration: ProjectLoadResult["migration"],
  ): Promise<ProjectLoadResult> {
    const canonical: StoredProject = {
      ...project,
      revision: sourceGeneration.revision + 1,
    };
    const encoded = await this.codec.encode(canonical);
    const nextGenerations = [
      sourceGeneration,
      {
        documentId: canonical.documentId,
        revision: canonical.revision,
        serialized: encoded.serialized,
        byteSize: encoded.byteSize,
      },
    ];

    this.storage.generations.set(project.documentId, nextGenerations);
    this.storage.summaries.set(
      project.documentId,
      createSummary(canonical, encoded.byteSize),
    );

    return { project: canonical, migration };
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

function createGenerationDiagnostic(
  generation: InMemoryProjectGeneration,
  error: unknown,
): ProjectGenerationDiagnostic {
  return {
    revision: generation.revision,
    cause: classifyRecoveryCause(error),
    message: error instanceof Error ? error.message : "Unknown decode failure.",
  };
}

function classifyRecoveryCause(error: unknown): ProjectRecoveryCause {
  if (!(error instanceof ProjectPersistenceError)) {
    return "invalid-data";
  }

  if (error.message.includes("metadata is inconsistent")) {
    return "metadata-inconsistent";
  }
  if (error.code === "FUTURE_VERSION") return "future-version";
  if (error.code === "MIGRATION_MISSING") return "migration-missing";
  if (error.code === "CORRUPT_DATA") return "json-corrupt";
  return "invalid-data";
}

function formatRecoveryFailure(
  documentId: string,
  diagnostics: readonly ProjectGenerationDiagnostic[],
): string {
  const details = diagnostics.map((entry) => (
    `revision ${entry.revision}: ${entry.cause} — ${entry.message}`
  )).join("; ");
  return `No valid recovery generation exists for project ${documentId}. ${details}`;
}

function createRecoveryExport(
  documentId: string,
  generations: readonly InMemoryProjectGeneration[],
  diagnostics: readonly ProjectGenerationDiagnostic[],
): ProjectRecoveryExport {
  const baseName = `pianola-recovery-${documentId}`;
  const diagnostic = diagnostics.length === 0
    ? "No failed opening attempt has been recorded."
    : diagnostics.map((entry) => (
        `Revision ${entry.revision}\nCause: ${entry.cause}\n${entry.message}`
      )).join("\n\n");

  return {
    archiveFileName: `${baseName}.json`,
    archive: JSON.stringify({
      format: "app.pianola.recovery.v1",
      documentId,
      generations: generations.map((generation) => ({
        revision: generation.revision,
        byteSize: generation.byteSize,
        serialized: generation.serialized,
      })),
    }, null, 2),
    diagnosticFileName: `${baseName}.txt`,
    diagnostic,
  };
}
