import type {
  SelectionMode,
} from "../interactions/gestures/gesture-draft";
import type {
  EditorSelection,
  SelectedTimeMapMarkerGroup,
} from "./editor-selection";

/** Applies one gesture selection mode to a selectable time-map marker group. */
export function applyTimeMapMarkerSelection(
  selection: EditorSelection,
  group: SelectedTimeMapMarkerGroup,
  mode: SelectionMode,
): boolean {
  if (mode === "subtract") {
    return selection.deleteMarkerGroup(group.startTick);
  }

  if (mode === "add") {
    return selection.addMarkerGroup(group);
  }

  // Keep an already-selected group intact so a later drag can move the whole
  // timeline selection, matching direct note selection behavior.
  if (selection.hasMarkerGroup(group.startTick)) {
    return false;
  }

  selection.restoreSnapshot({
    notes: [],
    markerGroups: [group],
  });
  return true;
}
