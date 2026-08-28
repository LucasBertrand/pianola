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
} from "../../../application/ports/stored-project-codec";
import {
  ProjectPersistenceError,
} from "./project-persistence-error";
import {
  parsePersistenceJson,
  readPersistenceInteger,
  readPersistenceIsoDate,
  readPersistenceRecord,
  readPersistenceString,
} from "./persistence-codec-readers";
import {
  parsePersistedEditorWorkspace,
} from "./project-workspace-codec";

export const STORED_PROJECT_FORMAT = "app.pianola.stored-project.v1";
export const STORED_PROJECT_SCHEMA_VERSION = 1;

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
    decoded.documentId !== snapshot.documentId
    || decoded.revision !== snapshot.revision
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
): StoredProject {
  const source = readPersistenceRecord(
    parsePersistenceJson(serialized),
    "$",
  );
  const format = readPersistenceString(source["format"], "$.format", 64);

  if (format !== STORED_PROJECT_FORMAT) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      "Stored project uses an unknown format.",
    );
  }

  const schemaVersion = readPersistenceInteger(
    source["schemaVersion"],
    "$.schemaVersion",
    1,
  );

  if (schemaVersion !== STORED_PROJECT_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      schemaVersion > STORED_PROJECT_SCHEMA_VERSION
        ? "FUTURE_VERSION"
        : "INVALID_DATA",
      `Stored project version ${schemaVersion} does not match `
        + `the supported local baseline ${STORED_PROJECT_SCHEMA_VERSION}.`,
    );
  }

  const document = parseDocument(source["document"], "$.document");

  return {
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
  };
}
