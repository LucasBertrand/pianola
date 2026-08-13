import { MAXIMUM_INSTRUMENT_NAME_LENGTH } from "../../domain/model";
import { fail } from "./native-project-error";
import { parseMetadata } from "./native-project-metadata";
import type { LoadedNativeProject } from "./native-project-schema";
import {
  readRecord,
  readSafeInteger,
  readString,
} from "./parsing/json-readers";
import { parseEditorState } from "./parsing/parse-editor-state";
import { parseProjectSnapshot } from "./parsing/parse-project";
import {
  NATIVE_PROJECT_FILE_FORMAT,
  NATIVE_PROJECT_FILE_VERSION,
} from "./version";

const MAXIMUM_NAME_LENGTH = MAXIMUM_INSTRUMENT_NAME_LENGTH;

export function parseNativeProjectFile(
  serialized: string,
): LoadedNativeProject {
  let source: unknown;

  try {
    source = JSON.parse(serialized) as unknown;
  } catch {
    fail(
      "INVALID_JSON",
      "$",
      "The selected file does not contain valid JSON.",
    );
  }

  const document = readRecord(source, "$");
  const format = readString(
    document["format"],
    "$.format",
    MAXIMUM_NAME_LENGTH,
  );

  if (format !== NATIVE_PROJECT_FILE_FORMAT) {
    fail(
      "INVALID_FORMAT",
      "$.format",
      "The selected file is not a native Pianola project.",
    );
  }

  const formatVersion = readSafeInteger(
    document["formatVersion"],
    "$.formatVersion",
  );

  if (formatVersion !== NATIVE_PROJECT_FILE_VERSION) {
    fail(
      "UNSUPPORTED_VERSION",
      "$.formatVersion",
      `Native project version ${formatVersion} is not supported.`,
    );
  }

  const metadata = parseMetadata(
    document["metadata"],
    "$.metadata",
  );
  const projectDocument = parseProjectSnapshot(
    document["project"],
    "$.project",
  );
  const editorState = parseEditorState(
    document["editor"],
    projectDocument,
    "$.editor",
  );

  return {
    metadata,
    projectState: {
      ...projectDocument,
      workspace: { activeClipId: editorState.activeClipId },
    },
    editorState,
  };
}
