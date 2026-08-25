import React, { useEffect, useRef, useState } from "react";
import { MAXIMUM_PROJECT_CLIP_COUNT, type Clip } from "../../../domain/clips/clip";
import {
  countDescendantClips,
  findClipHierarchyNodeLocation,
  getClipPlaybackOrder,
  MAXIMUM_CLIP_GROUP_COUNT,
  MAXIMUM_CLIP_GROUP_NAME_LENGTH,
  type ClipHierarchyGroupNode,
  type ClipHierarchyNode,
  type ClipHierarchyNodeIdentity,
} from "../../../domain/clips/clip-hierarchy";
import type { ClipGroupId, ClipId } from "../../../domain/identifiers";
import type { ProjectState } from "../../../domain/project/project-document";
import type { ReadonlyRenderSignal } from "../../../editor/model/render-signal";
import type { PlayheadPosition } from "../../../editor/model/playhead-position";
import { resolveClipPlayheadVisual } from "./clip-playhead-visual";
import { useClipHierarchyReorder } from "./useClipHierarchyReorder";

export interface ClipInspectorProps {
  readonly projectState: ProjectState;
  readonly playingClipId: ClipId | null;
  readonly playheadPosition: ReadonlyRenderSignal<PlayheadPosition>;
  readonly suppressSelectionHighlight: boolean;
  readonly onSelect: (clipId: ClipId) => void;
  readonly onTogglePlayback: (clipId: ClipId) => void;
  readonly onAdd: (parentGroupId?: ClipGroupId | null) => void;
  readonly onDuplicate: (clipId: ClipId) => void;
  readonly onCreateGroup: (parentGroupId: ClipGroupId | null) => ClipGroupId | null;
  readonly onRenameGroup: (groupId: ClipGroupId, name: string) => void;
  readonly onUngroup: (groupId: ClipGroupId) => void;
  readonly onMoveNode: (
    node: ClipHierarchyNodeIdentity,
    targetParentGroupId: ClipGroupId | null,
    targetIndex: number,
  ) => void;
  readonly onSelectNotes: (clipId: ClipId) => void;
  readonly onEdit: (clipId: ClipId) => void;
}

interface GroupNameDraft {
  readonly groupId: ClipGroupId;
  readonly name: string;
}

export function ClipInspector(props: ClipInspectorProps): React.JSX.Element {
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<ClipGroupId>>(
    () => new Set(),
  );
  const [groupNameDraft, setGroupNameDraft] = useState<GroupNameDraft | null>(null);
  const clipOrder = getClipPlaybackOrder(props.projectState.clipHierarchy);
  const groupCount = countGroups(props.projectState.clipHierarchy);
  const reorder = useClipHierarchyReorder(props.onMoveNode);

  const createGroup = (parentGroupId: ClipGroupId | null): void => {
    const groupId = props.onCreateGroup(parentGroupId);

    if (groupId === null) {
      return;
    }

    if (parentGroupId !== null) {
      setCollapsedGroupIds((current) => withoutId(current, parentGroupId));
    }

    setGroupNameDraft({ groupId, name: "New group" });
  };

  const moveByKeyboard = (
    identity: ClipHierarchyNodeIdentity,
    parentGroupId: ClipGroupId | null,
    index: number,
    siblings: readonly ClipHierarchyNode[],
    key: string,
  ): void => {
    if (key === "ArrowUp" && index > 0) {
      props.onMoveNode(identity, parentGroupId, index - 1);
      return;
    }

    if (key === "ArrowDown" && index < siblings.length - 1) {
      props.onMoveNode(identity, parentGroupId, index + 1);
      return;
    }

    if (key === "ArrowRight") {
      const previous = siblings[index - 1];

      if (previous?.kind === "group") {
        props.onMoveNode(identity, previous.id, previous.children.length);
        setCollapsedGroupIds((current) => withoutId(current, previous.id));
      }
      return;
    }

    if (key === "ArrowLeft" && parentGroupId !== null) {
      const parentLocation = findClipHierarchyNodeLocation(
        props.projectState.clipHierarchy,
        { kind: "group", groupId: parentGroupId },
      );

      if (parentLocation !== null) {
        props.onMoveNode(
          identity,
          parentLocation.parentGroupId,
          parentLocation.index + 1,
        );
      }
    }
  };

  const hierarchyProps: HierarchyListProps = {
    nodes: props.projectState.clipHierarchy,
    parentGroupId: null,
    projectState: props.projectState,
    clipCount: clipOrder.length,
    groupCount,
    playingClipId: props.playingClipId,
    playheadPosition: props.playheadPosition,
    suppressSelectionHighlight: props.suppressSelectionHighlight,
    collapsedGroupIds,
    groupNameDraft,
    reorder,
    onToggleGroup(groupId): void {
      setCollapsedGroupIds((current) => toggleId(current, groupId));
    },
    onBeginRename(group): void {
      setGroupNameDraft({ groupId: group.id, name: group.name });
    },
    onDraftNameChange(name): void {
      setGroupNameDraft((current) => current === null ? null : { ...current, name });
    },
    onCommitRename(): void {
      if (groupNameDraft !== null && groupNameDraft.name.trim().length > 0) {
        props.onRenameGroup(groupNameDraft.groupId, groupNameDraft.name.trim());
      }
      setGroupNameDraft(null);
    },
    onCancelRename(): void {
      setGroupNameDraft(null);
    },
    onAdd: props.onAdd,
    onCreateGroup: createGroup,
    onUngroup: props.onUngroup,
    onMoveByKeyboard: moveByKeyboard,
    onSelect: props.onSelect,
    onTogglePlayback: props.onTogglePlayback,
    onDuplicate: props.onDuplicate,
    onSelectNotes: props.onSelectNotes,
    onEdit: props.onEdit,
  };

  return (
    <section className="clip-inspector-section">
      <div className="instrument-list clip-list" role="tree" aria-label="Clips">
        <ClipHierarchyList {...hierarchyProps} />
        <div className="clip-root-actions">
          <AddHierarchyButton
            label="Add clip"
            disabled={clipOrder.length >= MAXIMUM_PROJECT_CLIP_COUNT}
            onClick={() => props.onAdd(null)}
          />
          <AddHierarchyButton
            label="Add group"
            disabled={groupCount >= MAXIMUM_CLIP_GROUP_COUNT}
            onClick={() => createGroup(null)}
          />
        </div>
      </div>
    </section>
  );
}

interface HierarchyListProps {
  readonly nodes: readonly ClipHierarchyNode[];
  readonly parentGroupId: ClipGroupId | null;
  readonly projectState: ProjectState;
  readonly clipCount: number;
  readonly groupCount: number;
  readonly playingClipId: ClipId | null;
  readonly playheadPosition: ReadonlyRenderSignal<PlayheadPosition>;
  readonly suppressSelectionHighlight: boolean;
  readonly collapsedGroupIds: ReadonlySet<ClipGroupId>;
  readonly groupNameDraft: GroupNameDraft | null;
  readonly reorder: ReturnType<typeof useClipHierarchyReorder>;
  readonly onToggleGroup: (groupId: ClipGroupId) => void;
  readonly onBeginRename: (group: ClipHierarchyGroupNode) => void;
  readonly onDraftNameChange: (name: string) => void;
  readonly onCommitRename: () => void;
  readonly onCancelRename: () => void;
  readonly onAdd: (parentGroupId?: ClipGroupId | null) => void;
  readonly onCreateGroup: (parentGroupId: ClipGroupId | null) => void;
  readonly onUngroup: (groupId: ClipGroupId) => void;
  readonly onMoveByKeyboard: (
    identity: ClipHierarchyNodeIdentity,
    parentGroupId: ClipGroupId | null,
    index: number,
    siblings: readonly ClipHierarchyNode[],
    key: string,
  ) => void;
  readonly onSelect: (clipId: ClipId) => void;
  readonly onTogglePlayback: (clipId: ClipId) => void;
  readonly onDuplicate: (clipId: ClipId) => void;
  readonly onSelectNotes: (clipId: ClipId) => void;
  readonly onEdit: (clipId: ClipId) => void;
}

function ClipHierarchyList(props: HierarchyListProps): React.JSX.Element {
  return (
    <>
      {props.nodes.map((node, index) => node.kind === "clip"
        ? (
            <div
              key={node.clipId}
              className="clip-hierarchy-node clip-leaf-node"
              role="treeitem"
              data-clip-hierarchy-node=""
              data-node-kind="clip"
              data-node-id={node.clipId}
              data-node-index={index}
              data-parent-group-id={props.parentGroupId ?? ""}
            >
              <ClipNode {...props} clipId={node.clipId} index={index} />
            </div>
          )
        : (
            <ClipGroupNode key={node.id} {...props} group={node} index={index} />
          ))}
    </>
  );
}

function ClipGroupNode({
  group,
  index,
  ...props
}: HierarchyListProps & {
  readonly group: ClipHierarchyGroupNode;
  readonly index: number;
}): React.JSX.Element {
  const collapsed = props.collapsedGroupIds.has(group.id);
  const editing = props.groupNameDraft?.groupId === group.id;
  const identity = { kind: "group", groupId: group.id } as const;

  return (
    <section
      className="clip-hierarchy-node clip-group"
      role="treeitem"
      aria-expanded={!collapsed}
      data-clip-hierarchy-node=""
      data-node-kind="group"
      data-node-id={group.id}
      data-node-index={index}
      data-child-count={group.children.length}
      data-parent-group-id={props.parentGroupId ?? ""}
    >
      <div className="clip-group-header">
        <MoveHandle
          label={`Move ${group.name}`}
          onPointerDown={(event) => props.reorder.begin(identity, event)}
          onKeyDown={(key) => props.onMoveByKeyboard(
            identity,
            props.parentGroupId,
            index,
            props.nodes,
            key,
          )}
        />
        <button
          className="clip-group-toggle"
          type="button"
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.name}`}
          onClick={() => props.onToggleGroup(group.id)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d={collapsed ? "m7 4 6 6-6 6" : "m4 7 6 6 6-6"} />
          </svg>
        </button>
        {editing ? (
          <form
            className="clip-group-name-form"
            onSubmit={(event) => {
              event.preventDefault();
              props.onCommitRename();
            }}
          >
            <input
              autoFocus
              value={props.groupNameDraft?.name ?? ""}
              maxLength={MAXIMUM_CLIP_GROUP_NAME_LENGTH}
              aria-label="Group name"
              onChange={(event) => props.onDraftNameChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  props.onCancelRename();
                }
              }}
            />
          </form>
        ) : (
          <button
            className="clip-group-name"
            type="button"
            title="Double-click to rename"
            onDoubleClick={() => props.onBeginRename(group)}
          >
            <strong>{group.name}</strong>
            <small>{countDescendantClips(group)} clips</small>
          </button>
        )}
        <div className="clip-group-actions">
          <GroupAction label="Add clip" onClick={() => props.onAdd(group.id)}>+</GroupAction>
          <GroupAction
            label="Add nested group"
            disabled={props.groupCount >= MAXIMUM_CLIP_GROUP_COUNT}
            onClick={() => props.onCreateGroup(group.id)}
          >G+</GroupAction>
          <GroupAction label="Rename group" onClick={() => props.onBeginRename(group)}>✎</GroupAction>
          <GroupAction label="Ungroup" onClick={() => props.onUngroup(group.id)}>⌁</GroupAction>
        </div>
      </div>
      {collapsed ? null : (
        <div className="clip-group-children" role="group">
          {group.children.length === 0 ? (
            <p className="clip-group-empty">Empty group</p>
          ) : (
            <ClipHierarchyList {...props} nodes={group.children} parentGroupId={group.id} />
          )}
        </div>
      )}
    </section>
  );
}

function ClipNode({
  clipId,
  index,
  ...props
}: HierarchyListProps & {
  readonly clipId: ClipId;
  readonly index: number;
}): React.JSX.Element | null {
  const clip = props.projectState.clipsById[clipId];

  if (clip === undefined) {
    return null;
  }

  const identity = { kind: "clip", clipId } as const;

  return (
    <ClipCard
      clip={clip}
      selected={clip.id === props.projectState.workspace.activeClipId && !props.suppressSelectionHighlight}
      playing={clip.id === props.playingClipId}
      playheadPosition={props.playheadPosition}
      clipCount={props.clipCount}
      onMovePointerDown={(event) => props.reorder.begin(identity, event)}
      onMoveKeyDown={(key) => props.onMoveByKeyboard(
        identity,
        props.parentGroupId,
        index,
        props.nodes,
        key,
      )}
      onSelect={props.onSelect}
      onTogglePlayback={props.onTogglePlayback}
      onDuplicate={props.onDuplicate}
      onSelectNotes={props.onSelectNotes}
      onEdit={props.onEdit}
    />
  );
}

interface ClipCardProps {
  readonly clip: Clip;
  readonly selected: boolean;
  readonly playing: boolean;
  readonly playheadPosition: ReadonlyRenderSignal<PlayheadPosition>;
  readonly clipCount: number;
  readonly onMovePointerDown: React.PointerEventHandler<HTMLButtonElement>;
  readonly onMoveKeyDown: (key: string) => void;
  readonly onSelect: (clipId: ClipId) => void;
  readonly onTogglePlayback: (clipId: ClipId) => void;
  readonly onDuplicate: (clipId: ClipId) => void;
  readonly onSelectNotes: (clipId: ClipId) => void;
  readonly onEdit: (clipId: ClipId) => void;
}

function ClipCard(props: ClipCardProps): React.JSX.Element {
  const { clip } = props;
  const cardRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const initiallyOwnsPlayhead = props.playheadPosition.get().clipId === clip.id;

  useEffect(() => {
    const publishProgress = (): void => {
      const visual = resolveClipPlayheadVisual(
        clip.id,
        clip.timeline.durationTicks,
        props.playheadPosition.get(),
      );
      cardRef.current?.classList.toggle("has-playhead", visual.present);

      if (progressRef.current !== null) {
        progressRef.current.style.clipPath =
          `inset(0 ${String((1 - visual.progress) * 100)}% 0 0)`;
      }
    };
    const unsubscribe = props.playheadPosition.subscribe(publishProgress);
    publishProgress();
    return unsubscribe;
  }, [clip.id, clip.timeline.durationTicks, props.playheadPosition]);

  return (
    <article
      ref={cardRef}
      className={`project-instrument-card clip-card${props.selected ? " is-selected" : ""}${props.playing ? " is-playing" : ""}${initiallyOwnsPlayhead ? " has-playhead" : ""}`}
      style={{ "--instrument-color": clip.color } as React.CSSProperties}
      onClick={() => props.onSelect(clip.id)}
    >
      <div className="clip-playhead-background" aria-hidden="true" />
      <div ref={progressRef} className="clip-playback-progress" aria-hidden="true" />
      <MoveHandle label={`Move ${clip.name}`} onPointerDown={props.onMovePointerDown} onKeyDown={props.onMoveKeyDown} />
      <div className="instrument-copy"><strong className="instrument-name">{clip.name}</strong></div>
      <button
        className="instrument-select-all-button clip-select-all-button"
        type="button"
        aria-label={`Select all notes from ${clip.name}`}
        title="Select all clip notes"
        onClick={(event) => { event.stopPropagation(); props.onSelectNotes(clip.id); }}
      >
        <svg className="instrument-select-all-icon" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3" />
          <path d="M10 1v3M10 16v3M1 10h3M16 10h3" />
        </svg>
      </button>
      <button
        className="instrument-duplicate-button"
        type="button"
        aria-label={`Duplicate ${clip.name}`}
        title="Duplicate clip"
        disabled={props.clipCount >= MAXIMUM_PROJECT_CLIP_COUNT}
        onClick={(event) => { event.stopPropagation(); props.onDuplicate(clip.id); }}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M4 13V5.5A1.5 1.5 0 0 1 5.5 4H13" />
          <path d="M11.5 9.5v4M9.5 11.5h4" />
        </svg>
      </button>
      <button
        className="instrument-settings-button clip-settings-button"
        type="button"
        aria-label={`Edit ${clip.name}`}
        title="Edit clip"
        onClick={(event) => { event.stopPropagation(); props.onEdit(clip.id); }}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3" /><path d="M8.3 2.5h3.4l.5 2a6 6 0 0 1 1.3.8l2-.6 1.7 3-1.5 1.4a6 6 0 0 1 0 1.8l1.5 1.4-1.7 3-2-.6a6 6 0 0 1-1.3.8l-.5 2H8.3l-.5-2a6 6 0 0 1-1.3-.8l-2 .6-1.7-3 1.5-1.4a6 6 0 0 1 0-1.8L2.8 7.7l1.7-3 2 .6a6 6 0 0 1 1.3-.8Z" /></svg>
      </button>
      <button
        className={`clip-play-button${props.playing ? " is-active" : ""}`}
        type="button"
        aria-label={`${props.playing ? "Stop" : "Play"} ${clip.name}`}
        title={props.playing ? "Stop clip" : "Play clip immediately"}
        aria-pressed={props.playing}
        onClick={(event) => { event.stopPropagation(); props.onTogglePlayback(clip.id); }}
      >
        {props.playing
          ? <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="8" height="8" rx="1" /></svg>
          : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5.5v9l7-4.5Z" /></svg>}
      </button>
    </article>
  );
}

function MoveHandle({
  label,
  onPointerDown,
  onKeyDown,
}: {
  readonly label: string;
  readonly onPointerDown: React.PointerEventHandler<HTMLButtonElement>;
  readonly onKeyDown: (key: string) => void;
}): React.JSX.Element {
  return (
    <button
      className="clip-reorder-handle reorder-handle"
      aria-label={label}
      title="Arrow keys move; Right enters previous group; Left exits group"
      type="button"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          onKeyDown(event.key);
        }
      }}
      onPointerDown={onPointerDown}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="7" cy="6" r="1" /><circle cx="13" cy="6" r="1" />
        <circle cx="7" cy="10" r="1" /><circle cx="13" cy="10" r="1" />
        <circle cx="7" cy="14" r="1" /><circle cx="13" cy="14" r="1" />
      </svg>
    </button>
  );
}

function GroupAction({
  label,
  disabled = false,
  onClick,
  children,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

function AddHierarchyButton({
  label,
  disabled,
  onClick,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button className="add-card" type="button" aria-label={label} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
      <span>{label}</span>
    </button>
  );
}

function countGroups(nodes: readonly ClipHierarchyNode[]): number {
  return nodes.reduce(
    (count, node) => count + (node.kind === "group" ? 1 + countGroups(node.children) : 0),
    0,
  );
}

function withoutId(
  values: ReadonlySet<ClipGroupId>,
  id: ClipGroupId,
): ReadonlySet<ClipGroupId> {
  const next = new Set(values);
  next.delete(id);
  return next;
}

function toggleId(
  values: ReadonlySet<ClipGroupId>,
  id: ClipGroupId,
): ReadonlySet<ClipGroupId> {
  const next = new Set(values);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}
