import {
  expect,
  test,
} from "vitest";
import {
  BoundedPointerTickPosition,
} from "../bounded-pointer-tick-position";

function clampDelta(deltaTicks: number): number {
  return Math.min(100, Math.max(-50, deltaTicks));
}

test("reverses immediately after the pointer crosses the start boundary", () => {
  const position = new BoundedPointerTickPosition(50, clampDelta);

  expect(position.resolve(-20, identity)).toBe(0);
  expect(position.resolve(-15, identity)).toBe(5);
});

test("reverses immediately after the pointer crosses the end boundary", () => {
  const position = new BoundedPointerTickPosition(50, clampDelta);

  expect(position.resolve(200, identity)).toBe(150);
  expect(position.resolve(190, identity)).toBe(140);
});

test("snaps only after constraining and recalibrating the raw pointer", () => {
  const position = new BoundedPointerTickPosition(50, clampDelta);
  const snapToTen = (tick: number): number => Math.round(tick / 10) * 10;

  expect(position.resolve(205, snapToTen)).toBe(150);
  expect(position.resolve(199, snapToTen)).toBe(140);
});

function identity(value: number): number {
  return value;
}
