import {
  EDITOR_CONSTANTS,
  VIEWPORT_CONSTANTS,
} from "../config/editor-config";
import {
  MAXIMUM_ENTITY_ID_LENGTH,
  type ClipId,
} from "../domain/identifiers";
import type {
  ProjectDocument,
} from "../domain/project/project-document";
import {
  getClipPlaybackOrder,
} from "../domain/clips/clip-hierarchy";
import {
  createGridSettings,
  parseGridSubdivision,
} from "../editor/model/grid-settings";
import type {
  TonalPatternType,
} from "../music/pitch-snap";
import {
  isTonalPatternId,
} from "../music/pitch-snap";
import type {
  PersistedClipEditorState,
  PersistedEditorWorkspace,
} from "./project-persistence-model";
import {
  ProjectPersistenceError,
} from "./project-persistence-model";
import {
  readPersistenceBoolean,
  readPersistenceInteger,
  readPersistenceNumber,
  readPersistenceRecord,
  readPersistenceString,
} from "./persistence-codec-readers";

export function parsePersistedEditorWorkspace(
  source: unknown,
  document: ProjectDocument,
  path: string,
): PersistedEditorWorkspace {
  const workspace = readPersistenceRecord(source, path);
  const activeClipId = readPersistenceString(
    workspace["activeClipId"],
    `${path}.activeClipId`,
    MAXIMUM_ENTITY_ID_LENGTH,
  );

  if (document.clipsById[activeClipId] === undefined) {
    return invalid(`${path}.activeClipId`, "Active clip does not exist.");
  }

  const selectedSource = workspace["selectedInstrumentId"];
  const selectedInstrumentId = selectedSource === null
    ? null
    : readPersistenceString(
        selectedSource,
        `${path}.selectedInstrumentId`,
        MAXIMUM_ENTITY_ID_LENGTH,
      );

  if (
    selectedInstrumentId !== null
    && document.projectInstrumentsById[selectedInstrumentId] === undefined
  ) {
    return invalid(
      `${path}.selectedInstrumentId`,
      "Selected instrument does not exist.",
    );
  }

  const storedClipStates = readPersistenceRecord(
    workspace["clipStatesById"],
    `${path}.clipStatesById`,
  );
  const storedKeys = Object.keys(storedClipStates).sort();
  const clipOrder = getClipPlaybackOrder(document.clipHierarchy);
  const expectedKeys = [...clipOrder].sort();

  if (
    storedKeys.length !== expectedKeys.length
    || storedKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return invalid(
      `${path}.clipStatesById`,
      "Workspace clip keys do not match the document.",
    );
  }

  const clipStatesById: Record<ClipId, PersistedClipEditorState> = {};

  for (const clipId of clipOrder) {
    const clip = document.clipsById[clipId];
    const clipPath = `${path}.clipStatesById.${clipId}`;
    const stored = readPersistenceRecord(
      storedClipStates[clipId],
      clipPath,
    );

    if (clip === undefined) {
      return invalid(clipPath, "Clip does not exist.");
    }

    if ("playheadTick" in stored) {
      // v1 persisted a clip-local playhead. It is validated for corruption,
      // then deliberately discarded because playback position is transient.
      readPersistenceNumber(
        stored["playheadTick"],
        `${clipPath}.playheadTick`,
        0,
        clip.timeline.durationTicks,
      );
    }

    if ("firstVisibleTick" in stored) {
      // v1/v2 persisted viewport info. Discarded in favor of auto-fit.
      readPersistenceNumber(
        stored["firstVisibleTick"],
        `${clipPath}.firstVisibleTick`,
        0,
        clip.timeline.durationTicks,
      );
    }
    
    if ("highestVisiblePitch" in stored) {
      readPersistenceNumber(
        stored["highestVisiblePitch"],
        `${clipPath}.highestVisiblePitch`,
        0,
        VIEWPORT_CONSTANTS.maximumMidiPitch,
      );
    }

    if ("horizontalZoom" in stored) {
      readPersistenceNumber(
        stored["horizontalZoom"],
        `${clipPath}.horizontalZoom`,
        VIEWPORT_CONSTANTS.minimumStoredZoom,
        VIEWPORT_CONSTANTS.maximumHorizontalZoom,
      );
    }

    if ("verticalZoom" in stored) {
      readPersistenceNumber(
        stored["verticalZoom"],
        `${clipPath}.verticalZoom`,
        VIEWPORT_CONSTANTS.minimumStoredZoom,
        VIEWPORT_CONSTANTS.maximumVerticalZoom,
      );
    }

    clipStatesById[clipId] = {
      pitchSnapSettings: parsePitchSnapSettings(
        stored["pitchSnapSettings"],
        `${clipPath}.pitchSnapSettings`,
      ),
      gridSettings: parseStoredGridSettings(
        stored["gridSettings"],
        `${clipPath}.gridSettings`,
      ),
    };
  }

  return {
    activeClipId,
    selectedInstrumentId,
    clipStatesById,
  };
}

function parsePitchSnapSettings(source: unknown, path: string) {
  const settings = readPersistenceRecord(source, path);
  const patternId = readPersistenceString(
    settings["patternId"],
    `${path}.patternId`,
    64,
  );
  const patternType = readPersistenceString(
    settings["patternType"],
    `${path}.patternType`,
    16,
  );

  if (!isTonalPatternId(patternId)) {
    return invalid(`${path}.patternId`, "Unsupported tonal pattern.");
  }

  if (patternType !== "scale" && patternType !== "chord") {
    return invalid(`${path}.patternType`, "Unsupported tonal pattern type.");
  }

  return {
    enabled: readPersistenceBoolean(
      settings["enabled"],
      `${path}.enabled`,
    ),
    visualGuideEnabled: readPersistenceBoolean(
      settings["visualGuideEnabled"],
      `${path}.visualGuideEnabled`,
    ),
    rootNote: readPersistenceString(
      settings["rootNote"],
      `${path}.rootNote`,
      10,
    ),
    patternType: patternType as TonalPatternType,
    patternId,
  };
}

function parseStoredGridSettings(source: unknown, path: string) {
  const settings = readPersistenceRecord(source, path);
  const baseResolutionTicks = readPersistenceInteger(
    settings["baseResolutionTicks"],
    `${path}.baseResolutionTicks`,
    1,
  );
  const subdivisionName = readPersistenceString(
    settings["subdivision"],
    `${path}.subdivision`,
    16,
  );
  const subdivision = parseGridSubdivision(subdivisionName);

  if (
    subdivision === null
    || !EDITOR_CONSTANTS.gridResolutionOptions.some(
      (option) => option.ticks === baseResolutionTicks,
    )
  ) {
    return invalid(path, "Unsupported grid settings.");
  }

  const result = createGridSettings(baseResolutionTicks, subdivision);
  const resolutionTicks = readPersistenceInteger(
    settings["resolutionTicks"],
    `${path}.resolutionTicks`,
    1,
  );

  if (result.resolutionTicks !== resolutionTicks) {
    return invalid(path, "Inconsistent grid resolution.");
  }

  return result;
}

function invalid(path: string, message: string): never {
  throw new ProjectPersistenceError(
    "INVALID_DATA",
    `${message} Location: ${path}.`,
  );
}
