import {
  describe,
  expect,
  it,
} from "vitest";
import {
  PROJECT_CONSTANTS,
} from "../../../domain/project/project-constants";
import {
  getActiveClip,
} from "../../../domain/project/project-document";
import {
  createBlankEditorSessionState,
} from "../create-initial-project";

describe("createBlankEditorSessionState", () => {
  it("creates one empty clip without instruments or notes", () => {
    const state = createBlankEditorSessionState();
    const clip = getActiveClip(state);

    expect(clip.timeline.timeMap.tempoMarkers[0]?.bpm).toBe(
      PROJECT_CONSTANTS.defaultTempoBpm,
    );
    expect(state.instrumentOrder).toEqual([]);
    expect(state.projectInstrumentsById).toEqual({});
    expect(clip.tracksByInstrumentId).toEqual({});
  });
});
