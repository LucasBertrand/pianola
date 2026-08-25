import {
  type Clip,
} from "../clips/clip";
import {
  type ProjectState,
} from "../project/project-document";

export type ActiveClipProjectState = Pick<
  ProjectState,
  "projectInstrumentsById" | "instrumentOrder" | "clock"
> & Pick<
  Clip,
  | "timeline"
  | "tracksByInstrumentId"
  | "transportSettings"
>;
