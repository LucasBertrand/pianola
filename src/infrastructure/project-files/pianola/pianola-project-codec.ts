import { MAXIMUM_ENTITY_ID_LENGTH } from "../../../domain/identifiers";
import {
  createProjectDocumentPayload,
} from "../../persistence/codecs/project-document-payload";
import {
  ProjectPersistenceError,
} from "../../persistence/codecs/project-persistence-error";
import {
  parsePersistenceJson,
  readPersistenceInteger,
  readPersistenceIsoDate,
  readPersistenceRecord,
  readPersistenceString,
} from "../../persistence/codecs/persistence-codec-readers";
import {
  parsePersistedEditorWorkspace,
} from "../../persistence/codecs/project-workspace-codec";
import {
  parseProjectSnapshot,
} from "./parsing/parse-project";
import {
  PIANOLA_PROJECT_FORMAT,
  PIANOLA_PROJECT_SCHEMA_VERSION,
  type PianolaProject,
} from "./pianola-project-schema";

export function serializePianolaProject(
  project: PianolaProject,
): string {
  const serialized = JSON.stringify({
    format: PIANOLA_PROJECT_FORMAT,
    schemaVersion: PIANOLA_PROJECT_SCHEMA_VERSION,
    sourceDocumentId: project.sourceDocumentId,
    exportedAt: project.exportedAt,
    document: createProjectDocumentPayload(project.document),
    workspace: project.workspace,
  }, null, 2);

  parsePianolaProject(serialized);
  return serialized;
}

export function parsePianolaProject(serialized: string): PianolaProject {
  const source = readPersistenceRecord(
    parsePersistenceJson(serialized),
    "$",
  );
  const format = readPersistenceString(source["format"], "$.format", 64);

  if (format !== PIANOLA_PROJECT_FORMAT) {
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

  if (version !== PIANOLA_PROJECT_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      "FUTURE_VERSION",
      `Project file version ${version} is not supported. Baseline is ${PIANOLA_PROJECT_SCHEMA_VERSION}.`,
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
    workspace: parsePersistedEditorWorkspace(
      source["workspace"],
      document,
      "$.workspace",
    ),
  };
}
