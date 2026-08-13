import type { Clip, ProjectState } from "../model";

export type ActiveClipProjectState = Pick<
  ProjectState,
  "projectInstrumentsById" | "instrumentOrder" | "clock"
> & Pick<
  Clip,
  | "timeline"
  | "tracksByInstrumentId"
  | "instrumentStatesById"
  | "transportSettings"
>;
