import type {
  StoredProject,
} from "./project-repository";

export interface EncodedStoredProject {
  readonly serialized: string;
  readonly byteSize: number;
}

export interface StoredProjectCodec {
  encode(snapshot: StoredProject): Promise<EncodedStoredProject>;
  decode(serialized: string): Promise<StoredProject>;
}
