import {
  type Clip,
} from "../clips/clip";
import {
  type EditorSessionState,
} from "../project/project-document";

export type ActiveClipProjectState = Pick<
  EditorSessionState,
  "projectInstrumentsById" | "instrumentOrder" | "clock"
> & Pick<
  Clip,
  | "timeline"
  | "tracksByInstrumentId"
  | "transportSettings"
>;
