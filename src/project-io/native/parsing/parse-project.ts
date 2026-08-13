import {
  type Clip,
} from "../../../domain/clips/clip";
import {
  type ClipId,
} from "../../../domain/identifiers";
import {
  type MasterBusState,
} from "../../../domain/master-bus";
import {
  type ProjectClock,
} from "../../../domain/transport/transport";
import {
  type ProjectDocument,
} from "../../../domain/project/project-document";
import {
  MAXIMUM_MASTER_GAIN,
  MAXIMUM_MASTER_TUNING_FREQUENCY_HZ,
  MINIMUM_MASTER_GAIN,
  MINIMUM_MASTER_TUNING_FREQUENCY_HZ,
} from "../../../domain/master-bus";
import {
  PROJECT_SCHEMA_VERSION,
} from "../../../domain/project/project-document";
import {
  validateProjectClock,
} from "../../../domain/validation/transport-validation";
import { fail } from "../native-project-error";
import { MAXIMUM_NATIVE_PROJECT_TITLE_LENGTH } from "../version";
import {
  assertExactRecordKeys,
  readBoolean,
  readNonEmptyString,
  readNumberInRange,
  readPositiveNumber,
  readPositiveSafeInteger,
  readRecord,
  readSafeInteger,
} from "./json-readers";
import { parseClip, parseClipOrder } from "./parse-clips";
import {
  parseInstrumentOrder,
  parseInstrumentPresets,
  parsePresetOrder,
  parseProjectInstruments,
} from "./parse-instruments";

export function parseProjectSnapshot(
  source: unknown,
  path: string,
): ProjectDocument {
  const project = readRecord(source, path);
  const schemaVersion = readSafeInteger(
    project["schemaVersion"],
    `${path}.schemaVersion`,
  );

  if (schemaVersion !== PROJECT_SCHEMA_VERSION) {
    fail(
      "INVALID_DATA",
      `${path}.schemaVersion`,
      `Project schema version ${schemaVersion} is not supported.`,
    );
  }

  const title = readNonEmptyString(
    project["title"],
    `${path}.title`,
    MAXIMUM_NATIVE_PROJECT_TITLE_LENGTH,
  );
  const clock = parseProjectClock(project["clock"], `${path}.clock`);
  const instrumentOrder = parseInstrumentOrder(
    project["instrumentOrder"],
    `${path}.instrumentOrder`,
  );
  const instrumentPresetOrder = parsePresetOrder(
    project["instrumentPresetOrder"],
    `${path}.instrumentPresetOrder`,
  );
  const instrumentPresetsById = parseInstrumentPresets(
    project["instrumentPresetsById"],
    instrumentPresetOrder,
    `${path}.instrumentPresetsById`,
  );
  const projectInstrumentsById = parseProjectInstruments(
    project["projectInstrumentsById"],
    instrumentOrder,
    instrumentPresetsById,
    `${path}.projectInstrumentsById`,
  );
  const masterBus = parseMasterBus(
    project["masterBus"],
    `${path}.masterBus`,
  );
  const clipOrder = parseClipOrder(
    project["clipOrder"],
    `${path}.clipOrder`,
  );
  const sourceClips = readRecord(
    project["clipsById"],
    `${path}.clipsById`,
  );
  assertExactRecordKeys(sourceClips, clipOrder, `${path}.clipsById`);
  const clipsById: Record<ClipId, Clip> = {};

  for (const clipId of clipOrder) {
    clipsById[clipId] = parseClip(
      sourceClips[clipId],
      clipId,
      instrumentOrder,
      clock,
      `${path}.clipsById.${clipId}`,
    );
  }

  const projectState: ProjectDocument = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 0,
    title,
    clock,
    projectInstrumentsById,
    instrumentOrder,
    instrumentPresetsById,
    instrumentPresetOrder,
    clipsById,
    clipOrder,
    masterBus,
  };
  return projectState;
}

function parseProjectClock(source: unknown, path: string): ProjectClock {
  const stored = readRecord(source, path);
  assertExactRecordKeys(stored, ["tempoBpm", "ppqn", "launchGridTicks"], path);
  const clock: ProjectClock = {
    tempoBpm: readPositiveNumber(stored["tempoBpm"], `${path}.tempoBpm`),
    ppqn: readPositiveSafeInteger(stored["ppqn"], `${path}.ppqn`),
    launchGridTicks: readPositiveSafeInteger(
      stored["launchGridTicks"],
      `${path}.launchGridTicks`,
    ),
  };
  const validation = validateProjectClock(clock);

  if (!validation.valid) {
    const issue = validation.issues[0];
    fail(
      "INVALID_DATA",
      issue === undefined ? path : `${path}.${issue.path}`,
      issue?.message ?? "Project clock is invalid.",
    );
  }

  return clock;
}

function parseMasterBus(
  source: unknown,
  path: string,
): MasterBusState {
  const masterBus = readRecord(source, path);

  return {
    gain: readNumberInRange(
      masterBus["gain"],
      `${path}.gain`,
      MINIMUM_MASTER_GAIN,
      MAXIMUM_MASTER_GAIN,
    ),
    muted: readBoolean(masterBus["muted"], `${path}.muted`),
    tuningFrequencyHz: readNumberInRange(
      masterBus["tuningFrequencyHz"],
      `${path}.tuningFrequencyHz`,
      MINIMUM_MASTER_TUNING_FREQUENCY_HZ,
      MAXIMUM_MASTER_TUNING_FREQUENCY_HZ,
    ),
  };
}
