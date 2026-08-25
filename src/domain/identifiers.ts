import {
  PROJECT_CONSTANTS,
} from "../config/domain-limits";

export type NoteId = string;
export type InstrumentId = string;
export type PresetId = string;
export type ClipId = string;
export type ClipGroupId = string;
export type EffectId = string;
export type RuleId = string;
export type Tick = number;

export const MAXIMUM_ENTITY_ID_LENGTH =
  PROJECT_CONSTANTS.maximumEntityIdLength;
