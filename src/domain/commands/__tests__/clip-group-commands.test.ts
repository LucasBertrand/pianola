import {
  describe,
  expect,
  test,
} from "vitest";
import {
  getClipPlaybackOrder,
} from "../../clips/clip-hierarchy";
import {
  projectReducer,
} from "../reducer";
import {
  CommandRejectedError,
} from "../command-errors";
import {
  createTestProject,
} from "../../../../tests/support/test-builders";

describe("clip group commands", () => {
  test("creates, nests, moves and ungroups without changing leaf playback order", () => {
    let project = createTestProject({
      clips: [{ id: "clip-a" }, { id: "clip-b" }, { id: "clip-c" }],
    });

    project = dispatch(project, [{
      type: "CreateClipGroup",
      groupId: "group-section",
      name: "Section",
      parentGroupId: null,
      index: 0,
    }]);
    project = dispatch(project, [{
      type: "MoveClipHierarchyNode",
      node: { kind: "clip", clipId: "clip-a" },
      targetParentGroupId: "group-section",
      targetIndex: 0,
    }, {
      type: "CreateClipGroup",
      groupId: "group-phrase",
      name: "Phrase",
      parentGroupId: "group-section",
      index: 1,
    }, {
      type: "MoveClipHierarchyNode",
      node: { kind: "clip", clipId: "clip-b" },
      targetParentGroupId: "group-phrase",
      targetIndex: 0,
    }]);

    expect(getClipPlaybackOrder(project.clipHierarchy)).toEqual([
      "clip-a",
      "clip-b",
      "clip-c",
    ]);

    project = dispatch(project, [{
      type: "DeleteClipGroup",
      groupId: "group-phrase",
    }]);

    expect(getClipPlaybackOrder(project.clipHierarchy)).toEqual([
      "clip-a",
      "clip-b",
      "clip-c",
    ]);
    expect(project.clipHierarchy[0]).toMatchObject({
      kind: "group",
      id: "group-section",
      children: [
        { kind: "clip", clipId: "clip-a" },
        { kind: "clip", clipId: "clip-b" },
      ],
    });
  });

  test("rejects moving a group into its descendant", () => {
    let project = createTestProject({ clips: [{ id: "clip-a" }] });

    project = dispatch(project, [{
      type: "CreateClipGroup",
      groupId: "group-parent",
      name: "Parent",
      parentGroupId: null,
      index: 0,
    }, {
      type: "CreateClipGroup",
      groupId: "group-child",
      name: "Child",
      parentGroupId: "group-parent",
      index: 0,
    }]);

    expect(() => dispatch(project, [{
      type: "MoveClipHierarchyNode",
      node: { kind: "group", groupId: "group-parent" },
      targetParentGroupId: "group-child",
      targetIndex: 0,
    }])).toThrow(CommandRejectedError);
  });
});

function dispatch(
  project: ReturnType<typeof createTestProject>,
  commands: Parameters<typeof projectReducer>[1]["commands"],
): ReturnType<typeof createTestProject> {
  return projectReducer(project, {
    transactionId: "clip-group-command",
    createdAt: 1,
    commands,
  });
}
