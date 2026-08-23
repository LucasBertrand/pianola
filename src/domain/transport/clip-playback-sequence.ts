import type {
  ClipId,
} from "../identifiers";
import type {
  ProjectDocument,
} from "../project/project-document";

/** Resolves the next visible clip while preserving loop priority. */
export function getAutoAdvanceTargetClipId(
  project: Pick<
    ProjectDocument,
    "clipOrder" | "clipsById" | "autoAdvanceEnabled"
  >,
  currentClipId: ClipId,
): ClipId | null {
  const currentClip = project.clipsById[currentClipId];

  if (
    currentClip === undefined
    || currentClip.transportSettings.loopEnabled
    || !project.autoAdvanceEnabled
  ) {
    return null;
  }

  const currentIndex = project.clipOrder.indexOf(currentClipId);

  if (currentIndex < 0) {
    return null;
  }

  const nextClipId = project.clipOrder[currentIndex + 1];

  return nextClipId !== undefined
    && project.clipsById[nextClipId] !== undefined
    ? nextClipId
    : null;
}
