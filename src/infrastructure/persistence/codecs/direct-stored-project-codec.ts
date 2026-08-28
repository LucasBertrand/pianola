import type {
  StoredProjectCodec,
} from "../../../application/ports/stored-project-codec";
import {
  parseStoredProject,
  serializeStoredProject,
} from "./stored-project-codec";
import {
  parseProjectSnapshot,
} from "../../project-files/pianola/parsing/parse-project";

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
