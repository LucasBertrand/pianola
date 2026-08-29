import type {
  StoredProject,
} from "./project-repository";
import type {
  ProjectMigrationResult,
} from "../project-files/project-migration";

export interface EncodedStoredProject {
  readonly serialized: string;
  readonly byteSize: number;
}

export type DecodedStoredProject = ProjectMigrationResult<StoredProject>;

export interface StoredProjectCodec {
  encode(snapshot: StoredProject): Promise<EncodedStoredProject>;
  decode(serialized: string): Promise<DecodedStoredProject>;
}
