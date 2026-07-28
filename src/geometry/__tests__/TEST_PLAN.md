# Geometry Test Plan

## Coordinate properties

Use a property-based testing library such as `fast-check` when the test runner is introduced.

Generate finite values within these domains:

- `tick`: integer from `0` to `Number.MAX_SAFE_INTEGER / 1024`;
- `pitch`: integer from `0` to `127`;
- `zoomX` and `zoomY`: floating-point values from `0.05` to `64`;
- `scrollX` and `scrollY`: floating-point values from `0` to `10_000_000`;
- `pitchHeight`: floating-point values from `1` to `128`;
- `ticksPerPixel`: floating-point values from `0.01` to `10_000`;
- `devicePixelRatio`: floating-point values from `0.5` to `8`.

Required properties:

```ts
approximatelyEqual(
  converter.pixelXToTick(converter.tickToPixelX(tick)),
  tick,
);

approximatelyEqual(
  converter.cssPixelXToTick(converter.tickToCssPixelX(tick)),
  tick,
);

converter.pixelYToPitch(converter.pitchToPixelY(pitch)) === pitch;
converter.cssPixelYToPitch(converter.pitchToCssPixelY(pitch)) === pitch;
```

The floating-point comparison tolerance should scale with the magnitude of the expected value:

```ts
const tolerance =
  Math.max(
    1e-7,
    Number.EPSILON * Math.max(1, Math.abs(expected)) * 256,
  );
```

Critical deterministic scenarios:

1. Identity viewport with no zoom, scroll, or HiDPI scaling.
2. Fractional zoom and a non-integer device pixel ratio.
3. Very large ticks close to the supported safe range.
4. Negative viewport scroll offsets.
5. Runtime viewport replacement on the same converter instance.
6. Invalid zero, negative, infinite, and `NaN` configuration values.
7. Pitch row boundaries and one device pixel on either side of a boundary.

## Spatial index correctness

Compare every indexed query against a simple linear reference implementation.

Required scenarios:

1. Empty index.
2. One note with start-inclusive and end-exclusive point queries.
3. Multiple non-overlapping notes on one pitch.
4. Overlapping notes with equal and different start ticks.
5. Notes distributed across all 128 pitches.
6. Rectangle queries partially intersecting long notes.
7. Rectangle pitch ranges outside `0..127`.
8. Index replacement through consecutive `update` calls.
9. Reuse of the optional result buffer in `queryRect`.
10. Rejection of invalid pitches, start ticks, and durations.

For generated datasets, compare:

```ts
index.queryPoint(tick, pitch)
linearPointQuery(notes, tick, pitch)

index.queryRect(startTick, endTick, minPitch, maxPitch, reusableBuffer)
linearRectQuery(notes, startTick, endTick, minPitch, maxPitch)
```

When several notes overlap at a point, compare against the documented deterministic ordering: latest start tick, then longest duration, then lexicographically greatest note ID.

## Ten-thousand-note benchmark

Create 10,000 deterministic notes using a seeded pseudo-random generator. Distribute pitches uniformly across `0..127`, keep ticks within a representative song length, and include both short and long durations.

Measure these operations separately after warm-up:

- one complete `update`;
- 100,000 `queryPoint` calls;
- 10,000 viewport-sized `queryRect` calls with a reused output buffer.

Use an injected monotonic clock supplied by the benchmark environment. Record median, p95, maximum duration, result count, and heap delta when the runtime exposes memory measurements.

The benchmark should fail only against baselines established on controlled hardware. In continuous integration, detect large regressions relative to the stored baseline instead of enforcing an absolute duration.

The hot-query allocation target is:

- zero explicit allocation for `queryPoint`;
- zero explicit allocation for `queryRect` when a reusable target is supplied;
- no bucket or comparator recreation during queries.
