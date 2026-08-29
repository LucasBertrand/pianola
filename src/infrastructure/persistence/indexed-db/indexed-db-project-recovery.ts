import type {
  ProjectGenerationDiagnostic,
  ProjectRecoveryCause,
  ProjectRecoveryExport,
} from "../../../application/ports/project-repository";
import {
  ProjectPersistenceError,
} from "../codecs/project-persistence-error";

export interface StoredProjectGenerationRecord {
  readonly documentId: string;
  readonly revision: number;
  readonly serialized: string;
  readonly byteSize: number;
}

export interface ProjectRecoveryDiagnosticRecord
  extends ProjectGenerationDiagnostic {
  readonly id?: number;
  readonly kind: "project-recovery";
  readonly documentId: string;
  readonly recordedAt: string;
}

export function getProjectGenerations(
  store: IDBObjectStore,
  documentId: string,
): Promise<StoredProjectGenerationRecord[]> {
  return new Promise((resolve, reject) => {
    const result: StoredProjectGenerationRecord[] = [];
    const request = store.openCursor();
    request.onerror = () => reject(request.error ?? new Error(
      "Unable to enumerate project generations.",
    ));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null) {
        resolve(result.sort((left, right) => left.revision - right.revision));
        return;
      }
      const record = cursor.value as StoredProjectGenerationRecord;
      if (record.documentId === documentId) result.push(record);
      cursor.continue();
    };
  });
}

export function deleteProjectGenerations(
  store: IDBObjectStore,
  documentId: string,
): Promise<void> {
  return mutateCursor(store, (cursor) => {
    const record = cursor.value as StoredProjectGenerationRecord;
    if (record.documentId === documentId) cursor.delete();
  });
}

export function deleteProjectGenerationsExcept(
  store: IDBObjectStore,
  documentId: string,
  retainedRevisions: ReadonlySet<number>,
): Promise<void> {
  return mutateCursor(store, (cursor) => {
    const record = cursor.value as StoredProjectGenerationRecord;
    if (
      record.documentId === documentId
      && !retainedRevisions.has(record.revision)
    ) cursor.delete();
  });
}

export function deleteProjectDiagnostics(
  store: IDBObjectStore,
  documentId: string,
): Promise<void> {
  return mutateCursor(store, (cursor) => {
    const record = cursor.value as Partial<ProjectRecoveryDiagnosticRecord>;
    if (record.kind === "project-recovery" && record.documentId === documentId) {
      cursor.delete();
    }
  });
}

export function createGenerationDiagnostic(
  generation: StoredProjectGenerationRecord,
  error: unknown,
): ProjectGenerationDiagnostic {
  return {
    revision: generation.revision,
    cause: classifyRecoveryCause(error),
    message: error instanceof Error ? error.message : "Unknown decode failure.",
  };
}

export function formatRecoveryFailure(
  documentId: string,
  diagnostics: readonly ProjectGenerationDiagnostic[],
): string {
  const details = diagnostics.map((entry) => (
    `revision ${entry.revision}: ${entry.cause} — ${entry.message}`
  )).join("; ");
  return `No valid recovery generation exists for project ${documentId}. ${details}`;
}

export function createRecoveryExport(
  documentId: string,
  generations: readonly StoredProjectGenerationRecord[],
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

function classifyRecoveryCause(error: unknown): ProjectRecoveryCause {
  if (!(error instanceof ProjectPersistenceError)) return "invalid-data";
  if (error.message.includes("metadata is inconsistent")) {
    return "metadata-inconsistent";
  }
  if (error.code === "FUTURE_VERSION") return "future-version";
  if (error.code === "MIGRATION_MISSING") return "migration-missing";
  if (error.code === "CORRUPT_DATA") return "json-corrupt";
  return "invalid-data";
}

function mutateCursor(
  store: IDBObjectStore,
  mutate: (cursor: IDBCursorWithValue) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => reject(request.error ?? new Error(
      "Unable to update IndexedDB records.",
    ));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null) {
        resolve();
        return;
      }
      mutate(cursor);
      cursor.continue();
    };
  });
}
