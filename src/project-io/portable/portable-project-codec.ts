import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../../domain/identifiers";
import {
  createProjectDocumentPayload,
} from "../../persistence/project-document-payload";
import {
  ProjectPersistenceError,
} from "../../persistence/project-persistence-model";
import {
  parsePersistenceJson,
  readPersistenceInteger,
  readPersistenceIsoDate,
  readPersistenceRecord,
  readPersistenceString,
} from "../../persistence/persistence-codec-readers";
import {
  parseProjectWorkspace,
} from "../../persistence/project-workspace-codec";
import {
  parseProjectSnapshot,
} from "../native/parsing/parse-project";
import {
  PORTABLE_PROJECT_FORMAT,
  PORTABLE_PROJECT_SCHEMA_VERSION,
  type PortableProject,
} from "./portable-project-schema";

export function serializePortableProject(
  project: PortableProject,
): string {
  const serialized = JSON.stringify({
    format: PORTABLE_PROJECT_FORMAT,
    schemaVersion: PORTABLE_PROJECT_SCHEMA_VERSION,
    sourceDocumentId: project.sourceDocumentId,
    exportedAt: project.exportedAt,
    document: createProjectDocumentPayload(project.document),
    workspace: project.workspace,
  }, null, 2);

  parsePortableProject(serialized);
  return serialized;
}

export function parsePortableProject(serialized: string): PortableProject {
  const source = readPersistenceRecord(
    parsePersistenceJson(serialized),
    "$",
  );
  const format = readPersistenceString(source["format"], "$.format", 64);

  if (format !== PORTABLE_PROJECT_FORMAT) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      "The selected file is not a Pianola project.",
    );
  }

  const version = readPersistenceInteger(
    source["schemaVersion"],
    "$.schemaVersion",
    1,
  );

  if (version > PORTABLE_PROJECT_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      "FUTURE_VERSION",
      `Project file version ${version} is newer than this application.`,
    );
  }

  if (version < 1) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      `Project file version ${version} is not supported.`,
    );
  }

  const document = parseProjectSnapshot(source["document"], "$.document");

  return {
    sourceDocumentId: readPersistenceString(
      source["sourceDocumentId"],
      "$.sourceDocumentId",
      MAXIMUM_ENTITY_ID_LENGTH,
    ),
    exportedAt: readPersistenceIsoDate(
      source["exportedAt"],
      "$.exportedAt",
    ),
    document,
    workspace: parseProjectWorkspace(
      source["workspace"],
      document,
      "$.workspace",
    ),
  };
}
