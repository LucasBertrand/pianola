import React, { useEffect, useRef, useState } from "react";
import { MAXIMUM_PROJECT_CLIP_COUNT, type Clip } from "../../../domain/clips/clip";
import {
  countDescendantClips,
  DEFAULT_CLIP_GROUP_COLOR,
  findClipHierarchyNodeLocation,
  getClipPlaybackOrder,
  MAXIMUM_CLIP_GROUP_COUNT,
  MAXIMUM_CLIP_GROUP_DEPTH,
  type ClipHierarchyGroupNode,
  type ClipHierarchyNode,
  type ClipHierarchyNodeIdentity,
} from "../../../domain/clips/clip-hierarchy";
import type { ClipGroupId, ClipId } from "../../../domain/identifiers";
import type { ProjectState } from "../../../domain/project/project-document";
import type { ReadonlyRenderSignal } from "../../../editor/model/render-signal";
import type { PlayheadPosition } from "../../../editor/model/playhead-position";
import { RENDERING_CONSTANTS } from "../../../config/rendering-config";
import {
  ClipGroupDeleteDialog,
  ClipGroupEditorDialog,
  ClipHierarchyCreateDialog,
  type ClipParentOption,
} from "../../dialogs/ClipHierarchyDialog";
import { resolveClipPlayheadVisual } from "./clip-playhead-visual";
import { resolveClipGroupPlaybackAction } from "./clip-group-playback";
import { useClipHierarchyReorder } from "./useClipHierarchyReorder";

export interface ClipInspectorProps {
  readonly projectState: ProjectState;
  readonly playingClipId: ClipId | null;
  readonly playheadPosition: ReadonlyRenderSignal<PlayheadPosition>;
  readonly suppressSelectionHighlight: boolean;
  readonly onSelect: (clipId: ClipId) => void;
  readonly onTogglePlayback: (clipId: ClipId) => void;
  readonly onAdd: (
    parentGroupId?: ClipGroupId | null,
    name?: string,
  ) => void;
  readonly onDuplicate: (clipId: ClipId) => void;
  readonly onCreateGroup: (
    parentGroupId: ClipGroupId | null,
    name?: string,
    color?: string,
  ) => ClipGroupId | null;
  readonly onUpdateGroup: (
    groupId: ClipGroupId,
    changes: { readonly name: string; readonly color: string },
  ) => void;
  readonly onUngroup: (groupId: ClipGroupId) => void;
  readonly onDeleteGroup: (groupId: ClipGroupId) => void;
  readonly onMoveNode: (
    node: ClipHierarchyNodeIdentity,
    targetParentGroupId: ClipGroupId | null,
    targetIndex: number,
  ) => void;
  readonly onSelectNotes: (clipId: ClipId) => void;
  readonly onEdit: (clipId: ClipId) => void;
}

type HierarchyDialogDraft =
  | {
      readonly mode: "create-clip" | "create-group";
      readonly parentGroupId: ClipGroupId | null;
      readonly name: string;
      readonly color: string;
    }
  | {
      readonly mode: "edit-group";
      readonly groupId: ClipGroupId;
      readonly name: string;
      readonly color: string;
      readonly descendantClipCount: number;
    }
  | {
      readonly mode: "delete-group";
      readonly groupId: ClipGroupId;
      readonly name: string;
      readonly color: string;
      readonly descendantClipCount: number;
      readonly canDeleteClips: boolean;
    };

interface GroupParentEntry {
  readonly id: ClipGroupId;
  readonly path: string;
  readonly depth: number;
}

export function ClipInspector(props: ClipInspectorProps): React.JSX.Element {
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<ClipGroupId>>(
    () => new Set(),
  );
  const [dialogDraft, setDialogDraft] = useState<HierarchyDialogDraft | null>(null);
  const clipOrder = getClipPlaybackOrder(props.projectState.clipHierarchy);
  const groupCount = countGroups(props.projectState.clipHierarchy);
  const nextGroupColor = RENDERING_CONSTANTS.userInstrumentColors[
    groupCount % RENDERING_CONSTANTS.userInstrumentColors.length
  ] ?? DEFAULT_CLIP_GROUP_COLOR;
  const reorder = useClipHierarchyReorder(props.onMoveNode);
  const parentEntries = collectGroupParentEntries(props.projectState.clipHierarchy);

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
    playingClipId: props.playingClipId,
    playheadPosition: props.playheadPosition,
    suppressSelectionHighlight: props.suppressSelectionHighlight,
    collapsedGroupIds,
    reorder,
    onToggleGroup(groupId): void {
      setCollapsedGroupIds((current) => toggleId(current, groupId));
    },
    onEditGroup(group): void {
      setDialogDraft({
        mode: "edit-group",
        groupId: group.id,
        name: group.name,
        color: group.color,
        descendantClipCount: countDescendantClips(group),
      });
    },
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
            onClick={() => setDialogDraft({
              mode: "create-clip",
              parentGroupId: null,
              name: `Clip ${clipOrder.length + 1}`,
              color: DEFAULT_CLIP_GROUP_COLOR,
            })}
          />
          <AddHierarchyButton
            label="Add group"
            disabled={groupCount >= MAXIMUM_CLIP_GROUP_COUNT}
            onClick={() => setDialogDraft({
              mode: "create-group",
              parentGroupId: null,
              name: "New group",
              color: nextGroupColor,
            })}
          />
        </div>
      </div>
      {dialogDraft === null ? null : dialogDraft.mode === "delete-group" ? (
        <ClipGroupDeleteDialog
          groupName={dialogDraft.name}
          descendantClipCount={dialogDraft.descendantClipCount}
          canDeleteClips={dialogDraft.canDeleteClips}
          onKeepClips={() => {
            props.onUngroup(dialogDraft.groupId);
            setDialogDraft(null);
          }}
          onDeleteClips={() => {
            props.onDeleteGroup(dialogDraft.groupId);
            setDialogDraft(null);
          }}
          onCancel={() => setDialogDraft(null)}
        />
      ) : dialogDraft.mode === "edit-group" ? (
        <ClipGroupEditorDialog
          name={dialogDraft.name}
          color={dialogDraft.color}
          onNameChange={(name) => setDialogDraft((current) => current?.mode === "edit-group"
            ? { ...current, name }
            : current)}
          onColorChange={(color) => setDialogDraft((current) => current?.mode === "edit-group"
            ? { ...current, color }
            : current)}
          onConfirm={() => {
            if (dialogDraft.name.trim().length === 0) return;
            props.onUpdateGroup(dialogDraft.groupId, {
              name: dialogDraft.name.trim(),
              color: dialogDraft.color,
            });
            setDialogDraft(null);
          }}
          onDelete={() => setDialogDraft({
            mode: "delete-group",
            groupId: dialogDraft.groupId,
            name: dialogDraft.name,
            color: dialogDraft.color,
            descendantClipCount: dialogDraft.descendantClipCount,
            canDeleteClips: dialogDraft.descendantClipCount < clipOrder.length,
          })}
          onCancel={() => setDialogDraft(null)}
        />
      ) : (
        <ClipHierarchyCreateDialog
          kind={dialogDraft.mode === "create-clip" ? "clip" : "group"}
          name={dialogDraft.name}
          color={dialogDraft.color}
          parentGroupId={dialogDraft.parentGroupId}
          parentOptions={createParentOptions(
            parentEntries,
            dialogDraft.mode === "create-group",
          )}
          onNameChange={(name) => setDialogDraft((current) =>
            current !== null
              && current.mode !== "edit-group"
              && current.mode !== "delete-group"
              ? { ...current, name }
              : current)}
          onColorChange={(color) => setDialogDraft((current) =>
            current?.mode === "create-group"
              ? { ...current, color }
              : current)}
          onParentChange={(parentGroupId) => setDialogDraft((current) =>
            current !== null
              && current.mode !== "edit-group"
              && current.mode !== "delete-group"
              ? { ...current, parentGroupId }
              : current)}
          onConfirm={() => {
            const name = dialogDraft.name.trim();
            if (name.length === 0) return;

            if (dialogDraft.mode === "create-clip") {
              props.onAdd(dialogDraft.parentGroupId, name);
            } else if (props.onCreateGroup(
              dialogDraft.parentGroupId,
              name,
              dialogDraft.color,
            ) === null) {
              return;
            }

            const parentGroupId = dialogDraft.parentGroupId;
            if (parentGroupId !== null) {
              setCollapsedGroupIds((current) => withoutId(current, parentGroupId));
            }
            setDialogDraft(null);
          }}
          onCancel={() => setDialogDraft(null)}
        />
      )}
    </section>
  );
}

interface HierarchyListProps {
  readonly nodes: readonly ClipHierarchyNode[];
  readonly parentGroupId: ClipGroupId | null;
  readonly projectState: ProjectState;
  readonly clipCount: number;
  readonly playingClipId: ClipId | null;
  readonly playheadPosition: ReadonlyRenderSignal<PlayheadPosition>;
  readonly suppressSelectionHighlight: boolean;
  readonly collapsedGroupIds: ReadonlySet<ClipGroupId>;
  readonly reorder: ReturnType<typeof useClipHierarchyReorder>;
  readonly onToggleGroup: (groupId: ClipGroupId) => void;
  readonly onEditGroup: (group: ClipHierarchyGroupNode) => void;
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
  const descendantClipIds = getClipPlaybackOrder(group.children);
  const playback = resolveClipGroupPlaybackAction(
    descendantClipIds,
    props.playingClipId,
  );
  const identity = { kind: "group", groupId: group.id } as const;

  return (
    <section
      className="clip-hierarchy-node clip-group"
      role="treeitem"
      aria-expanded={!collapsed}
      style={{ "--group-color": group.color } as React.CSSProperties}
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
        <div className="clip-group-name">
          <strong>{group.name}</strong>
          <small>{countDescendantClips(group)} clips</small>
        </div>
        <div className="clip-group-actions">
          <GroupAction label="Edit group" onClick={() => props.onEditGroup(group)}>
            <SettingsIcon />
          </GroupAction>
          <GroupAction
            label={playback.active ? `Stop ${group.name}` : `Play ${group.name}`}
            disabled={playback.targetClipId === null}
            active={playback.active}
            toggle
            onClick={() => {
              if (playback.targetClipId !== null) {
                props.onTogglePlayback(playback.targetClipId);
              }
            }}
          >
            <PlayIcon playing={playback.active} />
          </GroupAction>
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
  active = false,
  toggle = false,
  onClick,
  children,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly active?: boolean;
  readonly toggle?: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      className={active ? "is-active" : undefined}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={toggle ? active : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SettingsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="3" />
      <path d="M8.3 2.5h3.4l.5 2a6 6 0 0 1 1.3.8l2-.6 1.7 3-1.5 1.4a6 6 0 0 1 0 1.8l1.5 1.4-1.7 3-2-.6a6 6 0 0 1-1.3.8l-.5 2H8.3l-.5-2a6 6 0 0 1-1.3-.8l-2 .6-1.7-3 1.5-1.4a6 6 0 0 1 0-1.8L2.8 7.7l1.7-3 2 .6a6 6 0 0 1 1.3-.8Z" />
    </svg>
  );
}

function PlayIcon({ playing }: { readonly playing: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {playing
        ? <rect x="6" y="6" width="8" height="8" rx="1" />
        : <path d="M7 5.5v9l7-4.5Z" />}
    </svg>
  );
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

function collectGroupParentEntries(
  nodes: readonly ClipHierarchyNode[],
  parentPath = "",
  depth = 1,
): readonly GroupParentEntry[] {
  const entries: GroupParentEntry[] = [];

  for (const node of nodes) {
    if (node.kind !== "group") continue;

    const path = parentPath.length === 0 ? node.name : `${parentPath} / ${node.name}`;
    entries.push({ id: node.id, path, depth });
    entries.push(...collectGroupParentEntries(node.children, path, depth + 1));
  }

  return entries;
}

function createParentOptions(
  entries: readonly GroupParentEntry[],
  creatingGroup: boolean,
): readonly ClipParentOption[] {
  return [
    { id: null, label: "Project root" },
    ...entries
      .filter((entry) => !creatingGroup || entry.depth < MAXIMUM_CLIP_GROUP_DEPTH)
      .map((entry) => ({ id: entry.id, label: entry.path })),
  ];
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
