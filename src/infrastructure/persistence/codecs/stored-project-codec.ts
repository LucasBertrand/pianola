import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../../../domain/identifiers";
import type {
  ProjectDocument,
} from "../../../domain/project/project-document";
import {
  createProjectDocumentPayload,
} from "./project-document-payload";
import {
  type StoredProject,
} from "../../../application/ports/project-repository";
import type {
  EncodedStoredProject,
  DecodedStoredProject,
} from "../../../application/ports/stored-project-codec";
import {
  ProjectPersistenceError,
} from "./project-persistence-error";
import {
  parsePersistenceJson,
  readPersistenceInteger,
  readPersistenceIsoDate,
  readPersistenceString,
} from "./persistence-codec-readers";
import {
  parsePersistedEditorWorkspace,
} from "./project-workspace-codec";
import {
  migrateStoredProject,
} from "./migrations/migrate-stored-project";
import {
  STORED_PROJECT_FORMAT,
  STORED_PROJECT_SCHEMA_VERSION,
} from "./stored-project-constants";

export {
  STORED_PROJECT_FORMAT,
  STORED_PROJECT_SCHEMA_VERSION,
} from "./stored-project-constants";

export type ParseProjectDocument = (
  source: unknown,
  path: string,
) => ProjectDocument;

export function serializeStoredProject(
  snapshot: StoredProject,
  parseDocument: ParseProjectDocument,
): EncodedStoredProject {
  const serialized = JSON.stringify({
    format: STORED_PROJECT_FORMAT,
    schemaVersion: STORED_PROJECT_SCHEMA_VERSION,
    documentId: snapshot.documentId,
    revision: snapshot.revision,
    updatedAt: snapshot.updatedAt,
    document: createProjectDocumentPayload(snapshot.document),
    workspace: snapshot.workspace,
  });
  const decoded = parseStoredProject(serialized, parseDocument);

  if (
    decoded.project.documentId !== snapshot.documentId
    || decoded.project.revision !== snapshot.revision
  ) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      "Stored project failed its serialization round trip.",
    );
  }

  return {
    serialized,
    byteSize: new TextEncoder().encode(serialized).byteLength,
  };
}

export function parseStoredProject(
  serialized: string,
  parseDocument: ParseProjectDocument,
): DecodedStoredProject {
  const migrated = migrateStoredProject(parsePersistenceJson(serialized));
  const source = migrated.source;
  assertExactKeys(source, [
    "format",
    "schemaVersion",
    "documentId",
    "revision",
    "updatedAt",
    "document",
    "workspace",
  ], "$");

  const document = parseDocument(source["document"], "$.document");

  return {
    project: {
      documentId: readPersistenceString(
        source["documentId"],
        "$.documentId",
        MAXIMUM_ENTITY_ID_LENGTH,
      ),
      revision: readPersistenceInteger(
        source["revision"],
        "$.revision",
      ),
      updatedAt: readPersistenceIsoDate(
        source["updatedAt"],
        "$.updatedAt",
      ),
      document,
      workspace: parsePersistedEditorWorkspace(
        source["workspace"],
        document,
        "$.workspace",
      ),
    },
    migration: migrated.report,
  };
}

function assertExactKeys(
  source: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
  path: string,
): void {
  const actual = Object.keys(source).sort();
  const expected = [...expectedKeys].sort();

  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      `Record contains missing or unknown fields. Location: ${path}.`,
    );
  }
}
