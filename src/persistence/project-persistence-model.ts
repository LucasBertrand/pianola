import type {
  ClipId,
  InstrumentId,
} from "../domain/identifiers";
import type {
  ProjectDocument,
} from "../domain/project/project-document";
import type {
  GridSettings,
} from "../editor/model/grid-settings";
import type {
  PitchSnapSettings,
} from "../music/pitch-snap";

export const STORED_PROJECT_FORMAT =
  "app.pianola.stored-project";
export const STORED_PROJECT_SCHEMA_VERSION = 2;

/** Navigation state for one clip, expressed without CSS pixel offsets. */
export interface ProjectClipWorkspaceState {
  readonly firstVisibleTick: number;
  readonly highestVisiblePitch: number;
  readonly horizontalZoom: number;
  readonly verticalZoom: number;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly gridSettings: GridSettings;
}

/** Project-scoped editing context. It is persisted but never enters history. */
export interface ProjectWorkspaceState {
  readonly activeClipId: ClipId;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly clipStatesById: Readonly<
    Record<ClipId, ProjectClipWorkspaceState>
  >;
}

/** Atomic local aggregate. `revision` belongs to storage, not Undo/Redo. */
export interface StoredProject {
  readonly documentId: string;
  readonly revision: number;
  readonly updatedAt: string;
  readonly document: ProjectDocument;
  readonly workspace: ProjectWorkspaceState;
}

export interface ProjectSummary {
  readonly documentId: string;
  readonly title: string;
  readonly revision: number;
  readonly schemaVersion: number;
  readonly updatedAt: string;
  readonly byteSize: number;
}

export interface StoredRevision {
  readonly documentId: string;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface ProjectRepository {
  list(): Promise<readonly ProjectSummary[]>;
  load(documentId: string): Promise<StoredProject | null>;
  save(
    snapshot: StoredProject,
    expectedRevision: number | null,
  ): Promise<StoredRevision>;
  remove(documentId: string): Promise<void>;
}

export interface EncodedStoredProject {
  readonly serialized: string;
  readonly byteSize: number;
}

export interface StoredProjectCodec {
  encode(snapshot: StoredProject): Promise<EncodedStoredProject>;
  decode(serialized: string): Promise<StoredProject>;
}

export type ProjectPersistenceErrorCode =
  | "CONFLICT"
  | "CORRUPT_DATA"
  | "FUTURE_VERSION"
  | "INVALID_DATA"
  | "QUOTA_EXCEEDED"
  | "STORAGE_UNAVAILABLE";

export class ProjectPersistenceError extends Error {
  public constructor(
    public readonly code: ProjectPersistenceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProjectPersistenceError";
  }
}

export function createDocumentId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return (
    `project-${Date.now()}-`
    + Math.random().toString(36).slice(2)
  );
}
