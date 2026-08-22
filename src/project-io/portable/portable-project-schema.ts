import type {
  ProjectDocument,
} from "../../domain/project/project-document";
import type {
  ProjectWorkspaceState,
} from "../../persistence/project-persistence-model";

export const PORTABLE_PROJECT_FORMAT = "app.pianola.project";
export const PORTABLE_PROJECT_SCHEMA_VERSION = 1;

export interface PortableProject {
  readonly sourceDocumentId: string;
  readonly exportedAt: string;
  readonly document: ProjectDocument;
  readonly workspace: ProjectWorkspaceState;
}
