import {
  type ProjectRepository,
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
}

export function createInMemoryProjectStorage(): InMemoryProjectStorage {
  return {
    summaries: new Map(),
    generations: new Map(),
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

  public load(documentId: string): Promise<StoredProject | null> {
    return this.enqueue(async () => {
      const generations = this.storage.generations.get(documentId);

      if (generations === undefined || generations.length === 0) {
        return null;
      }

      let failure: unknown = null;

      for (const generation of [...generations].reverse()) {
        try {
          const decoded = await this.codec.decode(generation.serialized);

          if (
            decoded.documentId !== documentId
            || decoded.revision !== generation.revision
          ) {
            throw new ProjectPersistenceError(
              "CORRUPT_DATA",
              "Stored project generation metadata is inconsistent.",
            );
          }

          if (generation !== generations[generations.length - 1]) {
            this.storage.summaries.set(
              documentId,
              createSummary(decoded, generation.byteSize),
            );
          }

          return decoded;
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
