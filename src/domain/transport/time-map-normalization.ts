import type { Tick } from "../identifiers";
import type {
  MeterMarker,
  ScaleMarker,
  SectionMarker,
  TempoMarker,
} from "./time-map-model";

/** Sorts by tick and keeps the first marker of a duplicate tick. */
export function normalizeMeterMarkers(
  markers: readonly MeterMarker[],
): MeterMarker[] {
  const sorted = sortByTick(markers);
  const normalized: MeterMarker[] = [];

  for (const marker of sorted) {
    const previous = normalized[normalized.length - 1];

    if (previous !== undefined && previous.startTick === marker.startTick) {
      continue;
    }

    normalized.push(marker);
  }

  return normalized;
}

/** Sorts by tick and keeps the first marker of a duplicate tick. */
export function normalizeTempoMarkers(
  markers: readonly TempoMarker[],
): TempoMarker[] {
  const sorted = sortByTick(markers);
  const normalized: TempoMarker[] = [];

  for (const marker of sorted) {
    const previous = normalized[normalized.length - 1];

    if (previous !== undefined && previous.startTick === marker.startTick) {
      continue;
    }

    normalized.push(marker);
  }

  return normalized;
}

/** Sorts by tick and keeps the first marker of a duplicate tick. */
export function normalizeScaleMarkers(
  markers: readonly ScaleMarker[],
): ScaleMarker[] {
  const sorted = sortByTick(markers);
  const normalized: ScaleMarker[] = [];

  for (const marker of sorted) {
    const previous = normalized[normalized.length - 1];

    if (previous !== undefined && previous.startTick === marker.startTick) {
      continue;
    }

    normalized.push(marker);
  }

  return normalized;
}

/** Sorts by tick and keeps the first marker of a duplicate tick. */
export function normalizeSectionMarkers(
  markers: readonly SectionMarker[],
): SectionMarker[] {
  const sorted = sortByTick(markers);
  const normalized: SectionMarker[] = [];

  for (const marker of sorted) {
    const previous = normalized[normalized.length - 1];

    if (previous !== undefined && previous.startTick === marker.startTick) {
      continue;
    }

    normalized.push(marker);
  }

  return normalized;
}

function sortByTick<T extends { readonly startTick: Tick }>(
  markers: readonly T[],
): T[] {
  return [...markers].sort(
    (left, right) => left.startTick - right.startTick,
  );
}
