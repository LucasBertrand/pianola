import { APPLICATION_CONSTANTS } from "../../config/product-config";
import { MAXIMUM_ENTITY_ID_LENGTH } from "../../domain/model";
import type { NativeProjectFileMetadata } from "./native-project-schema";
import { fail } from "./native-project-error";
import {
  readIsoDate,
  readNonEmptyString,
  readRecord,
} from "./parsing/json-readers";
import { NATIVE_PROJECT_FILE_EXTENSION } from "./version";

const MAXIMUM_ID_LENGTH = MAXIMUM_ENTITY_ID_LENGTH;

export function createNativeProjectFileName(
  projectTitle: string,
): string {
  const baseName = projectTitle
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);

  return (
    `${
      baseName.length > 0
        ? baseName
        : `${APPLICATION_CONSTANTS.productSlug}-project`
    }`
    + NATIVE_PROJECT_FILE_EXTENSION
  );
}

export function parseMetadata(
  source: unknown,
  path: string,
): NativeProjectFileMetadata {
  const metadata = readRecord(source, path);
  const documentId = readNonEmptyString(
    metadata["documentId"],
    `${path}.documentId`,
    MAXIMUM_ID_LENGTH,
  );
  const createdAt = readIsoDate(
    metadata["createdAt"],
    `${path}.createdAt`,
  );
  const savedAt = readIsoDate(
    metadata["savedAt"],
    `${path}.savedAt`,
  );

  if (Date.parse(savedAt) < Date.parse(createdAt)) {
    fail(
      "INVALID_DATA",
      `${path}.savedAt`,
      "The saved date cannot precede the creation date.",
    );
  }

  return {
    documentId,
    createdAt,
    savedAt,
  };
}

