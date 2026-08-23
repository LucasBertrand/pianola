import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../domain/identifiers";
import type {
  ProjectDocument,
} from "../domain/project/project-document";
import {
  createProjectDocumentPayload,
} from "./project-document-payload";
import {
  ProjectPersistenceError,
  STORED_PROJECT_FORMAT,
  STORED_PROJECT_SCHEMA_VERSION,
  type EncodedStoredProject,
  type StoredProject,
} from "./project-persistence-model";
import {
  parsePersistenceJson,
  readPersistenceInteger,
  readPersistenceIsoDate,
  readPersistenceRecord,
  readPersistenceString,
} from "./persistence-codec-readers";
import {
  parseProjectWorkspace,
} from "./project-workspace-codec";

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

  if (schemaVersion > STORED_PROJECT_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      "FUTURE_VERSION",
      `Stored project version ${schemaVersion} is newer than this application.`,
    );
  }

  if (schemaVersion < 1) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      `Stored project version ${schemaVersion} is not supported.`,
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
    workspace: parseProjectWorkspace(
      source["workspace"],
      document,
      "$.workspace",
    ),
  };
}
