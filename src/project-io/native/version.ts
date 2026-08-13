import { FILE_CONSTANTS } from "../../config/native-file-config";
import {
  MAXIMUM_PROJECT_TITLE_LENGTH,
} from "../../domain/project/project-document";

export const NATIVE_PROJECT_FILE_FORMAT =
  FILE_CONSTANTS.nativeProjectFormat;
export const NATIVE_PROJECT_FILE_VERSION =
  FILE_CONSTANTS.nativeProjectVersion;
export const NATIVE_PROJECT_FILE_EXTENSION =
  FILE_CONSTANTS.nativeProjectExtension;
export const MAXIMUM_NATIVE_PROJECT_FILE_BYTES =
  FILE_CONSTANTS.nativeProjectMaximumBytes;
export const MAXIMUM_NATIVE_PROJECT_TITLE_LENGTH =
  MAXIMUM_PROJECT_TITLE_LENGTH;

/**
 * A future v1 -> v2 migration belongs after JSON/version recognition and
 * before the specialized parsers build domain and workspace state.
 */
export const NATIVE_PROJECT_MIGRATION_ENTRY_POINT =
  "stored-schema-before-domain-parsing" as const;
