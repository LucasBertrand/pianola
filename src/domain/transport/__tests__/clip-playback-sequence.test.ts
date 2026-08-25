import {
  describe,
  expect,
  test,
} from "vitest";
import {
  getAutoAdvanceTargetClipId,
} from "../clip-playback-sequence";
import {
  createFlatClipHierarchy,
} from "../../clips/clip-hierarchy";
import {
  projectReducer,
} from "../../commands/reducer";
import {
  createTestProject,
  TEST_CLIP_ID,
} from "../../../../tests/support/test-builders";

const NEXT_CLIP_ID = "clip-next";
const LAST_CLIP_ID = "clip-last";

describe("clip playback sequence", () => {
  test("follows the visible clip order", () => {
    const project = createSequenceProject();

    expect(getAutoAdvanceTargetClipId(project, TEST_CLIP_ID))
      .toBe(NEXT_CLIP_ID);
  });

  test("uses the reordered visual list immediately", () => {
    const project = createSequenceProject();
    const reorderedProject = projectReducer(project, {
      transactionId: "reorder-clips",
      label: "Reorder clips",
      createdAt: 1,
      commands: [{
        type: "ReorderClips",
        clipOrder: [NEXT_CLIP_ID, TEST_CLIP_ID],
      }],
    });

    expect(getAutoAdvanceTargetClipId(reorderedProject, NEXT_CLIP_ID))
      .toBe(TEST_CLIP_ID);
    expect(getAutoAdvanceTargetClipId(reorderedProject, TEST_CLIP_ID))
      .toBeNull();
  });

  test("stops at the end of the visible list", () => {
    const project = createSequenceProject();

    expect(getAutoAdvanceTargetClipId(project, NEXT_CLIP_ID)).toBeNull();
  });

  test("skips bypassed clips when advancing from upstream", () => {
    const project = createSequenceProject();
    const bypassedProject = {
      ...project,
      clipsById: {
        ...project.clipsById,
        [NEXT_CLIP_ID]: {
          ...project.clipsById[NEXT_CLIP_ID]!,
          bypassEnabled: true,
        },
        [LAST_CLIP_ID]: {
          ...project.clipsById[NEXT_CLIP_ID]!,
          id: LAST_CLIP_ID,
          name: "Last clip",
        },
      },
      clipHierarchy: createFlatClipHierarchy([
        TEST_CLIP_ID,
        NEXT_CLIP_ID,
        LAST_CLIP_ID,
      ]),
    };

    expect(getAutoAdvanceTargetClipId(bypassedProject, TEST_CLIP_ID))
      .toBe(LAST_CLIP_ID);
  });

  test("a directly started bypassed clip can trigger the remaining sequence", () => {
    const project = createSequenceProject();
    const bypassedProject = {
      ...project,
      clipsById: {
        ...project.clipsById,
        [TEST_CLIP_ID]: {
          ...project.clipsById[TEST_CLIP_ID]!,
          bypassEnabled: true,
        },
      },
    };

    expect(getAutoAdvanceTargetClipId(bypassedProject, TEST_CLIP_ID))
      .toBe(NEXT_CLIP_ID);
  });

  test("stops when every remaining clip is bypassed", () => {
    const project = createSequenceProject();
    const bypassedProject = {
      ...project,
      clipsById: {
        ...project.clipsById,
        [NEXT_CLIP_ID]: {
          ...project.clipsById[NEXT_CLIP_ID]!,
          bypassEnabled: true,
        },
      },
    };

    expect(getAutoAdvanceTargetClipId(bypassedProject, TEST_CLIP_ID))
      .toBeNull();
  });

  test("follows leaf order through nested groups", () => {
    const project = createSequenceProject();
    const nestedProject = {
      ...project,
      clipHierarchy: [{
        kind: "group" as const,
        id: "group-song",
        name: "Song",
        color: "#79a7ff",
        bypassEnabled: false,
        children: [{
          kind: "group" as const,
          id: "group-section",
          name: "Section",
          color: "#a77bf3",
          bypassEnabled: false,
          children: [
            { kind: "clip" as const, clipId: TEST_CLIP_ID },
            { kind: "clip" as const, clipId: NEXT_CLIP_ID },
          ],
        }],
      }],
    };

    expect(getAutoAdvanceTargetClipId(nestedProject, TEST_CLIP_ID))
      .toBe(NEXT_CLIP_ID);
  });

  test("skips every clip contained by a bypassed group", () => {
    const project = createSequenceProject();
    const lastClip = {
      ...project.clipsById[NEXT_CLIP_ID]!,
      id: LAST_CLIP_ID,
      name: "Last clip",
    };
    const groupedProject = {
      ...project,
      clipsById: {
        ...project.clipsById,
        [LAST_CLIP_ID]: lastClip,
      },
      clipHierarchy: [
        { kind: "clip" as const, clipId: TEST_CLIP_ID },
        {
          kind: "group" as const,
          id: "group-bypassed",
          name: "Bypassed",
          color: "#79a7ff",
          bypassEnabled: true,
          children: [{ kind: "clip" as const, clipId: NEXT_CLIP_ID }],
        },
        { kind: "clip" as const, clipId: LAST_CLIP_ID },
      ],
    };

    expect(getAutoAdvanceTargetClipId(groupedProject, TEST_CLIP_ID))
      .toBe(LAST_CLIP_ID);
  });

  test("a clip started inside a bypassed group exits after that group", () => {
    const project = createSequenceProject();
    const lastClip = {
      ...project.clipsById[NEXT_CLIP_ID]!,
      id: LAST_CLIP_ID,
      name: "Last clip",
    };
    const groupedProject = {
      ...project,
      clipsById: {
        ...project.clipsById,
        [LAST_CLIP_ID]: lastClip,
      },
      clipHierarchy: [
        {
          kind: "group" as const,
          id: "group-bypassed",
          name: "Bypassed",
          color: "#79a7ff",
          bypassEnabled: true,
          children: [
            { kind: "clip" as const, clipId: TEST_CLIP_ID },
            { kind: "clip" as const, clipId: NEXT_CLIP_ID },
          ],
        },
        { kind: "clip" as const, clipId: LAST_CLIP_ID },
      ],
    };

    expect(getAutoAdvanceTargetClipId(groupedProject, TEST_CLIP_ID))
      .toBe(LAST_CLIP_ID);
  });

  test("gives the current clip loop priority", () => {
    const project = createSequenceProject({ loopEnabled: true });

    expect(getAutoAdvanceTargetClipId(project, TEST_CLIP_ID)).toBeNull();
  });

  test("honors an explicit stop-at-end setting", () => {
    const project = createSequenceProject({ autoAdvanceEnabled: false });

    expect(getAutoAdvanceTargetClipId(project, TEST_CLIP_ID)).toBeNull();
  });

  test("updates one global stop-at-end setting through a document command", () => {
    const project = createSequenceProject();
    const nextProject = projectReducer(project, {
      transactionId: "disable-auto-advance",
      label: "Stop clip at end",
      createdAt: 1,
      commands: [{
        type: "SetAutoAdvanceEnabled",
        enabled: false,
      }],
    });

    expect(nextProject.autoAdvanceEnabled).toBe(false);
    expect(getAutoAdvanceTargetClipId(nextProject, TEST_CLIP_ID)).toBeNull();
  });
});

function createSequenceProject(
  transportChanges: Partial<{
    readonly loopEnabled: boolean;
    readonly autoAdvanceEnabled: boolean;
  }> = {},
) {
  const base = createTestProject();
  const firstClip = base.clipsById[TEST_CLIP_ID];

  if (firstClip === undefined) {
    throw new Error("The test clip is missing.");
  }

  return {
    ...base,
    autoAdvanceEnabled:
      transportChanges.autoAdvanceEnabled ?? base.autoAdvanceEnabled,
    clipsById: {
      ...base.clipsById,
      [TEST_CLIP_ID]: {
        ...firstClip,
        transportSettings: {
          ...firstClip.transportSettings,
          ...(transportChanges.loopEnabled === undefined
            ? {}
            : { loopEnabled: transportChanges.loopEnabled }),
        },
      },
      [NEXT_CLIP_ID]: {
        ...firstClip,
        id: NEXT_CLIP_ID,
        name: "Next clip",
      },
    },
    clipHierarchy: createFlatClipHierarchy([TEST_CLIP_ID, NEXT_CLIP_ID]),
  };
}
