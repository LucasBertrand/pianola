import {
  APPLICATION_COLORS,
} from "./application-colors";

/** Product identity shared by runtime features and generated file names. */
export const APPLICATION_CONSTANTS = Object.freeze({
  productName: "Pianola",
  productSlug: "pianola",
  defaultProjectTitle: "Pianola Project",
  demoProjectTitle: "Pianola Demo",
} as const);

/** Product-owned sample instruments used only by the demo project. */
export const DEMO_INSTRUMENTS = Object.freeze([
  Object.freeze({
    id: "instrument-atlas",
    name: "Atlas",
    color: APPLICATION_COLORS.notes.instrumentPalette[0],
  }),
  Object.freeze({
    id: "instrument-bloom",
    name: "Bloom",
    color: APPLICATION_COLORS.notes.instrumentPalette[1],
  }),
] as const);
