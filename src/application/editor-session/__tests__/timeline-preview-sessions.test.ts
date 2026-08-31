import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createEditorRuntime,
} from "../../../bootstrap/create-app-runtime";
import {
  resolveEffectiveLoop,
} from "../loop-preview-session";
import {
  resolveEffectiveTimeMap,
} from "../time-map-marker-preview-session";
import {
  createTestProject,
  TEST_CLIP_ID,
} from "../../../../tests/support/test-builders";

describe("editorial timeline preview sessions", () => {
  test("keeps the published time map immutable and ignores stale tokens", () => {
    const project = createProjectWithPointMarkers();
    const runtime = createEditorRuntime(project);
    const published = project.clipsById[TEST_CLIP_ID]!.timeline.timeMap;
    const firstToken = runtime.timeMapMarkerPreview.begin({
      clipId: TEST_CLIP_ID,
      movedGroups: [{ startTick: 960, kinds: ["tempo", "scale"] }],
    });

    runtime.timeMapMarkerPreview.update(firstToken, 240);
    const firstPreview = runtime.timeMapMarkerPreview.signal.get();

    expect(firstPreview?.projectedTimeMap.tempoMarkers[1]?.startTick)
      .toBe(1_200);
    expect(published.tempoMarkers[1]?.startTick).toBe(960);
    expect(resolveEffectiveTimeMap(
      published,
      firstPreview,
      TEST_CLIP_ID,
      project.revision,
    )).toBe(firstPreview?.projectedTimeMap);

    const secondToken = runtime.timeMapMarkerPreview.begin({
      clipId: TEST_CLIP_ID,
      movedGroups: [{ startTick: 960, kinds: ["tempo"] }],
    });

    runtime.timeMapMarkerPreview.clear(firstToken);
    expect(runtime.timeMapMarkerPreview.signal.get()).not.toBeNull();
    runtime.timeMapMarkerPreview.clear(secondToken);
    expect(runtime.timeMapMarkerPreview.signal.get()).toBeNull();
  });

  test("keeps both channels independent and invalidates stale projections", () => {
    const runtime = createEditorRuntime(createProjectWithPointMarkers());
    let markerToken = runtime.timeMapMarkerPreview.begin({
      clipId: TEST_CLIP_ID,
      movedGroups: [{ startTick: 960, kinds: ["tempo"] }],
    });
    const loopToken = runtime.loopPreview.begin({ clipId: TEST_CLIP_ID });

    runtime.timeMapMarkerPreview.update(markerToken, 240);
    runtime.loopPreview.update(loopToken, {
      startTick: 240,
      endTick: 1_200,
    });

    expect(runtime.timeMapMarkerPreview.signal.get()).not.toBeNull();
    expect(runtime.loopPreview.signal.get()).not.toBeNull();

    runtime.timeMapMarkerPreview.clear(markerToken);
    expect(runtime.timeMapMarkerPreview.signal.get()).toBeNull();
    expect(runtime.loopPreview.signal.get()).not.toBeNull();

    markerToken = runtime.timeMapMarkerPreview.begin({
      clipId: TEST_CLIP_ID,
      movedGroups: [{ startTick: 960, kinds: ["tempo"] }],
    });
    runtime.timeMapMarkerPreview.update(markerToken, 240);
    runtime.projectStore.replaceState(runtime.projectStore.getState());

    expect(runtime.timeMapMarkerPreview.signal.get()).toBeNull();
    expect(runtime.loopPreview.signal.get()).toBeNull();
  });

  test("allows a transient marker projection at the clip end", () => {
    const project = createProjectWithPointMarkers();
    const runtime = createEditorRuntime(project);
    const durationTicks = project.clipsById[TEST_CLIP_ID]!.timeline.durationTicks;
    const token = runtime.timeMapMarkerPreview.begin({
      clipId: TEST_CLIP_ID,
      movedGroups: [{ startTick: 960, kinds: ["tempo"] }],
    });

    expect(() => runtime.timeMapMarkerPreview.update(
      token,
      durationTicks - 960,
    )).not.toThrow();
    expect(runtime.timeMapMarkerPreview.signal.get()
      ?.projectedTimeMap.tempoMarkers.at(-1)?.startTick)
      .toBe(durationTicks);
  });

  test("resolves a loop preview only for its clip and revision", () => {
    const project = createProjectWithPointMarkers();
    const runtime = createEditorRuntime(project);
    const clip = project.clipsById[TEST_CLIP_ID]!;
    const token = runtime.loopPreview.begin({ clipId: TEST_CLIP_ID });
    const projectedLoop = { startTick: 240, endTick: 1_200 };

    runtime.loopPreview.update(token, projectedLoop);
    const preview = runtime.loopPreview.signal.get();

    expect(resolveEffectiveLoop(
      clip.transportSettings.loop,
      preview,
      TEST_CLIP_ID,
      project.revision,
    )).toEqual(projectedLoop);
    expect(resolveEffectiveLoop(
      clip.transportSettings.loop,
      preview,
      "another-clip",
      project.revision,
    )).toBe(clip.transportSettings.loop);
  });
});

function createProjectWithPointMarkers(): ReturnType<typeof createTestProject> {
  const project = createTestProject();
  const clip = project.clipsById[TEST_CLIP_ID]!;

  return {
    ...project,
    clipsById: {
      ...project.clipsById,
      [TEST_CLIP_ID]: {
        ...clip,
        timeline: {
          ...clip.timeline,
          timeMap: {
            ...clip.timeline.timeMap,
            tempoMarkers: [
              { startTick: 0, bpm: 120 },
              { startTick: 960, bpm: 90 },
            ],
            scaleMarkers: [
              clip.timeline.timeMap.scaleMarkers[0]!,
              {
                startTick: 960,
                rootNote: "D",
                patternType: "scale",
                patternId: "dorian",
              },
            ],
          },
        },
      },
    },
  };
}
