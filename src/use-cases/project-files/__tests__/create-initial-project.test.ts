import {
  describe,
  expect,
  it,
} from "vitest";
import {
  PROJECT_CONSTANTS,
} from "../../../config/domain-limits";
import {
  getActiveClip,
} from "../../../domain/project/project-document";
import {
  createBlankProjectState,
} from "../create-initial-project";

describe("createBlankProjectState", () => {
  it("creates one empty clip without instruments or notes", () => {
    const state = createBlankProjectState();
    const clip = getActiveClip(state);

    expect(clip.timeline.timeMap.tempoMarkers[0]?.bpm).toBe(
      PROJECT_CONSTANTS.defaultTempoBpm,
    );
    expect(state.instrumentOrder).toEqual([]);
    expect(state.projectInstrumentsById).toEqual({});
    expect(clip.tracksByInstrumentId).toEqual({});
    expect(clip.instrumentStatesById).toEqual({});
  });
});
