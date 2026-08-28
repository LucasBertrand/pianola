import {
  describe,
  expect,
  test,
} from "vitest";
import {
  findClipHierarchyGroup,
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
import { ProjectStore } from "../../../application/history/project-store";
import { duplicateClipValue } from "../../clips/duplicate-clip";

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

  test("toggles group bypass without changing descendant clip bypass", () => {
    let project = createTestProject({
      clips: [
        { id: "clip-a", bypassEnabled: false },
        { id: "clip-b", bypassEnabled: true },
      ],
    });

    project = dispatch(project, [{
      type: "CreateClipGroup",
      groupId: "group-section",
      name: "Section",
      color: "#79a7ff",
      parentGroupId: null,
      index: 0,
    }, {
      type: "MoveClipHierarchyNode",
      node: { kind: "clip", clipId: "clip-a" },
      targetParentGroupId: "group-section",
      targetIndex: 0,
    }, {
      type: "MoveClipHierarchyNode",
      node: { kind: "clip", clipId: "clip-b" },
      targetParentGroupId: "group-section",
      targetIndex: 1,
    }]);
    const store = new ProjectStore(project);

    store.dispatch({
      transactionId: "bypass-group",
      createdAt: 2,
      commands: [{
        type: "UpdateClipGroup",
        groupId: "group-section",
        changes: { bypassEnabled: true },
      }],
    });

    expect(findClipHierarchyGroup(
      store.getState().clipHierarchy,
      "group-section",
    )?.bypassEnabled).toBe(true);
    expect(store.getState().clipsById["clip-a"]?.bypassEnabled).toBe(false);
    expect(store.getState().clipsById["clip-b"]?.bypassEnabled).toBe(true);

    store.undo();
    expect(findClipHierarchyGroup(
      store.getState().clipHierarchy,
      "group-section",
    )?.bypassEnabled).toBe(false);
    store.redo();
    expect(findClipHierarchyGroup(
      store.getState().clipHierarchy,
      "group-section",
    )?.bypassEnabled).toBe(true);
  });

  test("duplicates a nested group as one undoable transaction", () => {
    let project = createTestProject({
      clips: [{ id: "clip-a" }, { id: "clip-b" }, { id: "clip-after" }],
    });

    project = dispatch(project, [{
      type: "CreateClipGroup",
      groupId: "group-source",
      name: "Source",
      color: "#79a7ff",
      bypassEnabled: true,
      parentGroupId: null,
      index: 0,
    }, {
      type: "MoveClipHierarchyNode",
      node: { kind: "clip", clipId: "clip-a" },
      targetParentGroupId: "group-source",
      targetIndex: 0,
    }, {
      type: "CreateClipGroup",
      groupId: "group-child",
      name: "Child",
      color: "#a77bf3",
      parentGroupId: "group-source",
      index: 1,
    }, {
      type: "MoveClipHierarchyNode",
      node: { kind: "clip", clipId: "clip-b" },
      targetParentGroupId: "group-child",
      targetIndex: 0,
    }]);
    const store = new ProjectStore(project);

    store.dispatch({
      transactionId: "duplicate-group",
      createdAt: 2,
      commands: [{
        type: "AddClip",
        clip: duplicateClipValue(
          project.clipsById["clip-a"]!,
          "clip-a-copy",
          "clip-a",
        ),
      }, {
        type: "AddClip",
        clip: duplicateClipValue(
          project.clipsById["clip-b"]!,
          "clip-b-copy",
          "clip-b",
        ),
      }, {
        type: "CreateClipGroup",
        groupId: "group-source-copy",
        name: "Source Copy",
        color: "#79a7ff",
        bypassEnabled: true,
        parentGroupId: null,
        index: 1,
      }, {
        type: "MoveClipHierarchyNode",
        node: { kind: "clip", clipId: "clip-a-copy" },
        targetParentGroupId: "group-source-copy",
        targetIndex: 0,
      }, {
        type: "CreateClipGroup",
        groupId: "group-child-copy",
        name: "Child",
        color: "#a77bf3",
        bypassEnabled: false,
        parentGroupId: "group-source-copy",
        index: 1,
      }, {
        type: "MoveClipHierarchyNode",
        node: { kind: "clip", clipId: "clip-b-copy" },
        targetParentGroupId: "group-child-copy",
        targetIndex: 0,
      }],
    });

    expect(getClipPlaybackOrder(store.getState().clipHierarchy)).toEqual([
      "clip-a",
      "clip-b",
      "clip-a-copy",
      "clip-b-copy",
      "clip-after",
    ]);
    expect(findClipHierarchyGroup(
      store.getState().clipHierarchy,
      "group-source-copy",
    )).toMatchObject({
      name: "Source Copy",
      bypassEnabled: true,
      children: [
        { kind: "clip", clipId: "clip-a-copy" },
        { kind: "group", id: "group-child-copy", bypassEnabled: false },
      ],
    });

    store.undo();
    expect(store.getState().clipsById["clip-a-copy"]).toBeUndefined();
    expect(findClipHierarchyGroup(
      store.getState().clipHierarchy,
      "group-source-copy",
    )).toBeUndefined();
    store.redo();
    expect(store.getState().clipsById["clip-b-copy"]).toBeDefined();
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

  test("rejects concatenating an empty group", () => {
    let project = createTestProject({ clips: [{ id: "clip-a" }] });
    project = dispatch(project, [{
      type: "CreateClipGroup",
      groupId: "group-empty",
      name: "Empty",
      color: "#79a7ff",
      parentGroupId: null,
      index: 0,
    }]);

    expect(() => dispatch(project, [{
      type: "ConcatenateClipGroup",
      groupId: "group-empty",
      clip: { ...project.clipsById["clip-a"]!, id: "clip-concatenated" },
    }])).toThrow("empty clip group");
  });

  test("rejects split payloads with too few or duplicate generated clips", () => {
    const project = createTestProject({ clips: [{ id: "clip-source" }] });
    const source = project.clipsById["clip-source"]!;
    const generated = { ...source, id: "clip-generated" };

    expect(() => dispatch(project, [{
      type: "SplitClipIntoGroup",
      sourceClipId: source.id,
      groupId: "group-split",
      clips: [generated],
    }])).toThrow("at least two generated clips");

    expect(() => dispatch(project, [{
      type: "SplitClipIntoGroup",
      sourceClipId: source.id,
      groupId: "group-split",
      clips: [generated, generated],
    }])).toThrow("already exists or is not unique");
  });

  test("rejects splitting a clip missing from the hierarchy", () => {
    const project = createTestProject({ clips: [{ id: "clip-source" }] });
    const source = project.clipsById["clip-source"]!;

    expect(() => dispatch({ ...project, clipHierarchy: [] }, [{
      type: "SplitClipIntoGroup",
      sourceClipId: source.id,
      groupId: "group-split",
      clips: [
        { ...source, id: "clip-left" },
        { ...source, id: "clip-right" },
      ],
    }])).toThrow("does not exist in the hierarchy");
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
