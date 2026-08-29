import { MAXIMUM_ENTITY_ID_LENGTH } from "../../../domain/identifiers";
import {
  createProjectDocumentPayload,
} from "../../persistence/codecs/project-document-payload";
import {
  ProjectPersistenceError,
} from "../../persistence/codecs/project-persistence-error";
import {
  readPersistenceInteger,
  readPersistenceIsoDate,
  readPersistenceString,
} from "../../persistence/codecs/persistence-codec-readers";
import type {
  ProjectMigrationResult,
} from "../../../application/project-files/project-migration";
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
import {
  migratePortableProject,
} from "./migrations/migrate-portable-project";

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

export function parsePianolaProject(
  serialized: string,
): ProjectMigrationResult<PianolaProject> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch (error: unknown) {
    throw new ProjectPersistenceError(
      "CORRUPT_DATA",
      "Stored data does not contain valid JSON.",
      { cause: error },
    );
  }

  const migrated = migratePortableProject(parsed);
  const source = migrated.source;
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

  assertExactKeys(source, [
    "format",
    "schemaVersion",
    "sourceDocumentId",
    "exportedAt",
    "document",
    "workspace",
  ], "$");
  const document = parseProjectSnapshot(source["document"], "$.document");

  return {
    project: {
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
      `Record contains missing or unknown fields. Location: ${path}`,
    );
  }
}
