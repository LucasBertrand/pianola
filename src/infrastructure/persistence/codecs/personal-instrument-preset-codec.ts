import {
  INSTRUMENT_CONSTANTS,
} from "../../../config/domain-limits";
import {
  createDefaultInstrumentPresetLibrary,
} from "../../../domain/instrument-presets";
import type {
  PresetId,
} from "../../../domain/identifiers";
import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../../../domain/identifiers";
import {
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
  MAXIMUM_PROJECT_INSTRUMENT_COUNT,
  MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
  MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
  type AdsrEnvelope,
  type InstrumentPreset,
  type OscillatorWaveform,
  type SubtractiveSynthConfig,
} from "../../../domain/instruments/instrument";
import {
  validateInstrumentPreset,
} from "../../../domain/validation/instrument-validation";
import {
  ProjectPersistenceError,
} from "./project-persistence-error";
import {
  readPersistenceBoolean,
  readPersistenceInteger,
  readPersistenceNumber,
  readPersistenceRecord,
  readPersistenceString,
} from "./persistence-codec-readers";

export interface PersonalInstrumentPresetLibrary {
  readonly presetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly presetOrder: readonly PresetId[];
}

export function parsePersonalInstrumentPresetLibrary(
  presetsSource: unknown,
  orderSource: unknown,
  path: string,
): PersonalInstrumentPresetLibrary {
  if (!Array.isArray(orderSource)) {
    return fail(`${path}.order`, "Expected an array.");
  }

  if (orderSource.length > MAXIMUM_PROJECT_INSTRUMENT_COUNT) {
    return fail(`${path}.order`, "Too many personal instrument presets.");
  }

  const presetOrder: PresetId[] = [];
  const seen = new Set<PresetId>();

  for (let index = 0; index < orderSource.length; index += 1) {
    const presetId = readPersistenceString(
      orderSource[index],
      `${path}.order[${index}]`,
      MAXIMUM_ENTITY_ID_LENGTH,
    );

    if (seen.has(presetId)) {
      return fail(`${path}.order[${index}]`, "Duplicate personal preset ID.");
    }

    seen.add(presetId);
    presetOrder.push(presetId);
  }

  const sourcePresets = readPersistenceRecord(
    presetsSource,
    `${path}.byId`,
  );
  const sourceKeys = Object.keys(sourcePresets).sort();
  const expectedKeys = [...presetOrder].sort();

  if (
    sourceKeys.length !== expectedKeys.length
    || sourceKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return fail(`${path}.byId`, "Personal preset IDs and order must match.");
  }

  const builtIns = createDefaultInstrumentPresetLibrary().instrumentPresetsById;
  const presetsById: Record<PresetId, InstrumentPreset> = {};

  for (const presetId of presetOrder) {
    if (builtIns[presetId] !== undefined) {
      return fail(`${path}.byId.${presetId}`, "A personal preset cannot replace a built-in preset.");
    }

    presetsById[presetId] = parsePersonalInstrumentPreset(
      sourcePresets[presetId],
      presetId,
      `${path}.byId.${presetId}`,
    );
  }

  return { presetsById, presetOrder };
}

function parsePersonalInstrumentPreset(
  source: unknown,
  expectedId: PresetId,
  path: string,
): InstrumentPreset {
  const preset = readPersistenceRecord(source, path);
  const id = readPersistenceString(
    preset["id"],
    `${path}.id`,
    MAXIMUM_ENTITY_ID_LENGTH,
  );

  if (id !== expectedId) {
    return fail(`${path}.id`, "Personal preset ID must match its record key.");
  }

  const kind = readPersistenceString(preset["kind"], `${path}.kind`, 32);

  if (kind !== "subtractive") {
    return fail(`${path}.kind`, "Unsupported personal preset engine.");
  }

  const parsed: InstrumentPreset = {
    id,
    name: readPersistenceString(
      preset["name"],
      `${path}.name`,
      MAXIMUM_INSTRUMENT_NAME_LENGTH,
    ),
    kind,
    config: parseSubtractiveConfig(preset["config"], `${path}.config`),
  };
  const validation = validateInstrumentPreset(parsed);

  if (!validation.valid) {
    return fail(path, validation.issues[0]?.message ?? "Invalid personal preset.");
  }

  return parsed;
}

function parseSubtractiveConfig(
  source: unknown,
  path: string,
): SubtractiveSynthConfig {
  const config = readPersistenceRecord(source, path);
  const kind = readPersistenceString(config["kind"], `${path}.kind`, 32);

  if (kind !== "subtractive") {
    return fail(`${path}.kind`, "Unsupported personal preset engine.");
  }

  return {
    kind,
    oscillatorWaveform: parseWaveform(
      config["oscillatorWaveform"],
      `${path}.oscillatorWaveform`,
    ),
    polyphony: readIntegerInRange(
      config["polyphony"],
      `${path}.polyphony`,
      MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
      MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
    ),
    oscillatorDetuneCents: readFiniteNumber(
      config["oscillatorDetuneCents"],
      `${path}.oscillatorDetuneCents`,
    ),
    oscillatorFreePhase: readPersistenceBoolean(
      config["oscillatorFreePhase"],
      `${path}.oscillatorFreePhase`,
    ),
    pulseWidth: readPersistenceNumber(
      config["pulseWidth"],
      `${path}.pulseWidth`,
      INSTRUMENT_CONSTANTS.minimumPulseWidth,
      INSTRUMENT_CONSTANTS.maximumPulseWidth,
    ),
    envelope: parseEnvelope(config["envelope"], `${path}.envelope`),
    filterCutoffHz: readPersistenceNumber(
      config["filterCutoffHz"],
      `${path}.filterCutoffHz`,
      INSTRUMENT_CONSTANTS.minimumFilterCutoffHz,
      INSTRUMENT_CONSTANTS.maximumFilterCutoffHz,
    ),
    filterResonance: readPersistenceNumber(
      config["filterResonance"],
      `${path}.filterResonance`,
      INSTRUMENT_CONSTANTS.minimumFilterResonance,
      INSTRUMENT_CONSTANTS.maximumFilterResonance,
    ),
    filterKeyTracking: readPersistenceNumber(
      config["filterKeyTracking"],
      `${path}.filterKeyTracking`,
      INSTRUMENT_CONSTANTS.minimumFilterKeyTracking,
      INSTRUMENT_CONSTANTS.maximumFilterKeyTracking,
    ),
    filterEnvelopeAmountOctaves: readPersistenceNumber(
      config["filterEnvelopeAmountOctaves"],
      `${path}.filterEnvelopeAmountOctaves`,
      INSTRUMENT_CONSTANTS.minimumFilterEnvelopeAmountOctaves,
      INSTRUMENT_CONSTANTS.maximumFilterEnvelopeAmountOctaves,
    ),
    filterEnvelope: parseEnvelope(
      config["filterEnvelope"],
      `${path}.filterEnvelope`,
    ),
  };
}

function parseEnvelope(source: unknown, path: string): AdsrEnvelope {
  const envelope = readPersistenceRecord(source, path);

  return {
    attackSeconds: readPersistenceNumber(
      envelope["attackSeconds"],
      `${path}.attackSeconds`,
      0,
      INSTRUMENT_CONSTANTS.maximumEnvelopeTimeSeconds,
    ),
    decaySeconds: readPersistenceNumber(
      envelope["decaySeconds"],
      `${path}.decaySeconds`,
      0,
      INSTRUMENT_CONSTANTS.maximumEnvelopeDecaySeconds,
    ),
    sustainLevel: readPersistenceNumber(
      envelope["sustainLevel"],
      `${path}.sustainLevel`,
      0,
      1,
    ),
    releaseSeconds: readPersistenceNumber(
      envelope["releaseSeconds"],
      `${path}.releaseSeconds`,
      0,
      INSTRUMENT_CONSTANTS.maximumEnvelopeTimeSeconds,
    ),
    curve: readPersistenceNumber(
      envelope["curve"],
      `${path}.curve`,
      INSTRUMENT_CONSTANTS.minimumEnvelopeCurve,
      INSTRUMENT_CONSTANTS.maximumEnvelopeCurve,
    ),
  };
}

function parseWaveform(source: unknown, path: string): OscillatorWaveform {
  const waveform = readPersistenceString(source, path, 16);

  if (
    waveform !== "sine"
    && waveform !== "square"
    && waveform !== "sawtooth"
    && waveform !== "triangle"
  ) {
    return fail(path, "Unsupported oscillator waveform.");
  }

  return waveform;
}

function readIntegerInRange(
  source: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  const value = readPersistenceInteger(source, path, minimum);

  return value <= maximum
    ? value
    : fail(path, "Integer exceeds the supported range.");
}

function readFiniteNumber(source: unknown, path: string): number {
  if (typeof source !== "number" || !Number.isFinite(source)) {
    return fail(path, "Expected a finite number.");
  }

  return source;
}

function fail(path: string, message: string): never {
  throw new ProjectPersistenceError(
    "INVALID_DATA",
    `${message} Location: ${path}.`,
  );
}
