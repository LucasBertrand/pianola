import type {
  ProjectDocument,
} from "../../../domain/project/project-document";
import type {
  PersistedEditorWorkspace,
} from "../../../application/ports/project-repository";
import { FILE_CONSTANTS } from "../../../config/pianola-file-config";

export const PIANOLA_PROJECT_FORMAT = FILE_CONSTANTS.pianolaProjectFormat;
export const PIANOLA_PROJECT_SCHEMA_VERSION = FILE_CONSTANTS.pianolaProjectVersion;

export interface PianolaProject {
  readonly sourceDocumentId: string;
  readonly exportedAt: string;
  readonly document: ProjectDocument;
  readonly workspace: PersistedEditorWorkspace;
}
