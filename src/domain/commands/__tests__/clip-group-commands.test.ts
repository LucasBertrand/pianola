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
      color: "#79a7ff",
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
      color: "#a77bf3",
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
      type: "UngroupClipGroup",
      groupId: "group-phrase",
    }]);
    project = dispatch(project, [{
      type: "UpdateClipGroup",
      groupId: "group-section",
      changes: { name: "Main section", color: "#62d6b4" },
    }]);

    expect(getClipPlaybackOrder(project.clipHierarchy)).toEqual([
      "clip-a",
      "clip-b",
      "clip-c",
    ]);
    expect(project.clipHierarchy[0]).toMatchObject({
      kind: "group",
      id: "group-section",
      name: "Main section",
      color: "#62d6b4",
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
      color: "#79a7ff",
      parentGroupId: null,
      index: 0,
    }, {
      type: "CreateClipGroup",
      groupId: "group-child",
      name: "Child",
      color: "#a77bf3",
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

  test("deletes a group with all nested groups and descendant clips", () => {
    let project = createTestProject({
      clips: [{ id: "clip-a" }, { id: "clip-b" }, { id: "clip-c" }],
    });

    project = dispatch(project, [{
      type: "CreateClipGroup",
      groupId: "group-parent",
      name: "Parent",
      color: "#79a7ff",
      parentGroupId: null,
      index: 0,
    }, {
      type: "CreateClipGroup",
      groupId: "group-child",
      name: "Child",
      color: "#a77bf3",
      parentGroupId: "group-parent",
      index: 0,
    }, {
      type: "MoveClipHierarchyNode",
      node: { kind: "clip", clipId: "clip-a" },
      targetParentGroupId: "group-parent",
      targetIndex: 0,
    }, {
      type: "MoveClipHierarchyNode",
      node: { kind: "clip", clipId: "clip-b" },
      targetParentGroupId: "group-child",
      targetIndex: 0,
    }]);

    project = dispatch(project, [{
      type: "DeleteClipGroup",
      groupId: "group-parent",
    }]);

    expect(getClipPlaybackOrder(project.clipHierarchy)).toEqual(["clip-c"]);
    expect(Object.keys(project.clipsById)).toEqual(["clip-c"]);
  });

  test("rejects deleting a group that contains every project clip", () => {
    let project = createTestProject({ clips: [{ id: "clip-a" }] });

    project = dispatch(project, [{
      type: "CreateClipGroup",
      groupId: "group-only",
      name: "Only group",
      color: "#79a7ff",
      parentGroupId: null,
      index: 0,
    }, {
      type: "MoveClipHierarchyNode",
      node: { kind: "clip", clipId: "clip-a" },
      targetParentGroupId: "group-only",
      targetIndex: 0,
    }]);

    expect(() => dispatch(project, [{
      type: "DeleteClipGroup",
      groupId: "group-only",
    }])).toThrow("at least one clip");
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
