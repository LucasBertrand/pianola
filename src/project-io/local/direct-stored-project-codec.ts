import type {
  StoredProjectCodec,
} from "../../persistence/project-persistence-model";
import {
  parseStoredProject,
  serializeStoredProject,
} from "../../persistence/stored-project-codec";
import {
  parseProjectSnapshot,
} from "../../infrastructure/project-files/pianola/parsing/parse-project";

export const DIRECT_STORED_PROJECT_CODEC: StoredProjectCodec = {
  encode(snapshot) {
    return Promise.resolve(
      serializeStoredProject(snapshot, parseProjectSnapshot),
    );
  },
  decode(serialized) {
    return Promise.resolve(
      parseStoredProject(serialized, parseProjectSnapshot),
    );
  },
};
