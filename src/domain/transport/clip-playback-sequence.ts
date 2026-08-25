import type {
  ClipId,
} from "../identifiers";
import type {
  ProjectDocument,
} from "../project/project-document";
import {
  getClipPlaybackOrder,
} from "../clips/clip-hierarchy";

/** Resolves the next playable visible clip while preserving loop priority. */
export function getAutoAdvanceTargetClipId(
  project: Pick<
    ProjectDocument,
    "clipHierarchy" | "clipsById" | "autoAdvanceEnabled"
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

  const clipOrder = getClipPlaybackOrder(project.clipHierarchy);
  const currentIndex = clipOrder.indexOf(currentClipId);

  if (currentIndex < 0) {
    return null;
  }

  for (
    let candidateIndex = currentIndex + 1;
    candidateIndex < clipOrder.length;
    candidateIndex += 1
  ) {
    const candidateClipId = clipOrder[candidateIndex];

    if (candidateClipId === undefined) {
      continue;
    }

    const candidateClip = project.clipsById[candidateClipId];

    if (candidateClip !== undefined && !candidateClip.bypassEnabled) {
      return candidateClipId;
    }
  }

  return null;
}
