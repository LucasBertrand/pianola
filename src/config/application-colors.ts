/**
 * Pianola application themes.
 *
 * This file is the single source of truth for every runtime color. CSS,
 * Canvas renderers, interaction overlays, note palettes, and the piano
 * keyboard all consume the active theme declared below.
 *
 * Theme maintenance rules:
 * - Never add hexadecimal, rgb(), or rgba() values to a component.
 * - Give every new color a semantic role in ApplicationColorTheme.
 * - Keep translucent Canvas colors explicit: they are composited frequently
 *   and must remain predictable on every browser.
 * - Verify contrast on both themes after adding a new visual state.
 *
 * Static PWA metadata and the standalone SVG icon cannot import TypeScript.
 * Their bootstrap colors are documented in the README maintenance guide.
 */

export type ApplicationThemeId = "dark" | "score-paper";

interface NeutralThemeColors {
  /** Deepest surface, used where maximum contrast is required. */
  readonly deepest: string;
  /** Shared background of the header, editor, piano strip, and inspector. */
  readonly application: string;
  /** Recessed inputs and the basic piano-roll row fill. */
  readonly inset: string;
  /** Secondary recessed areas such as dialog details. */
  readonly deep: string;
  /** Low-emphasis gradient endpoint. */
  readonly low: string;
  /** Standard panel and dialog surface. */
  readonly panel: string;
  /** Compact control surface. */
  readonly control: string;
  /** Inspector cards and grouped content. */
  readonly card: string;
  /** Default raised button surface. */
  readonly raised: string;
  /** Hovered or emphasized raised surface. */
  readonly raisedStrong: string;
  /** Selected neutral surface. */
  readonly selected: string;
  /** Informational surface with a subtle accent tint. */
  readonly information: string;
  /** Surface behind destructive controls and dialog marks. */
  readonly dangerSurface: string;
  /** Strong destructive button surface. */
  readonly dangerSurfaceStrong: string;
  /** Subtle separators and piano-roll row lines. */
  readonly borderSubtle: string;
  /** Standard separators and inactive range tracks. */
  readonly border: string;
  /** Default control border. */
  readonly borderControl: string;
  /** Strong control border. */
  readonly borderStrong: string;
  /** Active neutral border. */
  readonly borderActive: string;
  /** Border used for primary or informational actions. */
  readonly borderPrimary: string;
  /** Border used for destructive actions. */
  readonly borderDanger: string;
  /** Main body text. */
  readonly textPrimary: string;
  /** Brightest headings and editable project titles. */
  readonly textBright: string;
  /** Strong secondary text. */
  readonly textStrong: string;
  /** Button and input text. */
  readonly textControl: string;
  /** Standard secondary labels. */
  readonly textSecondary: string;
  /** Metadata and transport outputs. */
  readonly textMuted: string;
  /** Low-priority labels. */
  readonly textQuiet: string;
  /** Disabled controls and placeholders. */
  readonly textDisabled: string;
  /** Subdued blue-gray used by inspector section headings. */
  readonly inspectorHeading: string;
}

interface AccentThemeColors {
  /** Selection, focus, zoom, and generic interaction accent. */
  readonly primary: string;
  /** Higher-contrast primary accent for text and slider thumbs. */
  readonly primaryBright: string;
  /** Filled primary button surface. */
  readonly primarySurface: string;
  /** Loop, lock, tonic, and caution accent. */
  readonly warm: string;
  /** Error, destructive action, and mute accent. */
  readonly danger: string;
  /** Dedicated playhead color. */
  readonly playhead: string;
  /** Solo, success, and positive state accent. */
  readonly success: string;
  /** Scale and tonal-information accent. */
  readonly tonal: string;
  /** Secondary decorative accent used by instruments and gradients. */
  readonly purple: string;
  /** Secondary decorative accent used by instruments and gradients. */
  readonly orange: string;
}

interface PianoRollThemeColors {
  readonly background: string;
  readonly blackKeyRow: string;
  readonly pitchLine: string;
  readonly subdivisionLine: string;
  readonly beatLine: string;
  readonly barLine: string;
  readonly rulerSubdivision: string;
  readonly rulerBeat: string;
  readonly rulerBar: string;
  readonly rulerText: string;
  /**
   * Seven solid accents for diatonic degree families I through VII.
   * Minor/major variants share a family: bIII and III use the same entry.
   */
  readonly degreeAccents: readonly string[];
  /** Translucent degree-family fills used on ordinary tonal grid rows. */
  readonly degreePitchRows: readonly string[];
  /** Stronger degree-family fills used on tonic or selected-root rows. */
  readonly degreeRootRows: readonly string[];
  /** Fill for every pitch allowed by the selected mode or degree. */
  readonly tonalSnapPitchRow: string;
  /**
   * Fill for the tonic or selected degree root.
   * Change this value to customize the tonic highlight in the grid.
   */
  readonly tonalSnapRootRow: string;
  /** Temporary full-width lane highlight after piano-key interaction. */
  readonly activePitchLane: string;
  /** Hatch stroke rendered over notes belonging to a locked instrument. */
  readonly lockedNoteHatch: string;
}

interface NoteThemeColors {
  readonly default: string;
  /** Neutral note fill used when a pitch is outside the selected mode. */
  readonly outOfScale: string;
  readonly label: string;
  readonly instrumentPalette: readonly string[];
  /** One stable color per chromatic pitch class, starting at C. */
  readonly pitchClassPalette: readonly string[];
}

interface InteractionThemeColors {
  readonly lassoBorder: string;
  readonly lassoFill: string;
  readonly lassoInnerShadow: string;
}

interface PianoKeyboardThemeColors {
  readonly whiteKeyStart: string;
  readonly whiteKeyEnd: string;
  readonly whiteKeyText: string;
  readonly blackKeyStart: string;
  readonly blackKeyEnd: string;
}

interface EffectThemeColors {
  readonly overlayBackdrop: string;
  readonly shadowSoft: string;
  readonly shadowMedium: string;
  readonly shadowStrong: string;
  readonly highlightFaint: string;
  readonly highlightSoft: string;
  readonly highlightMedium: string;
  readonly highlightStrong: string;
  readonly highlightNearlyOpaque: string;
  readonly primaryFaint: string;
  readonly primarySoft: string;
  readonly primaryMedium: string;
  readonly primaryStrong: string;
  readonly warmFaint: string;
  readonly warmSoft: string;
  readonly warmMedium: string;
  readonly warmStrong: string;
  readonly dangerSoft: string;
  readonly dangerStrong: string;
  readonly successSoft: string;
  readonly successStrong: string;
  readonly purpleSoft: string;
  readonly orangeSoft: string;
  readonly mutedSoft: string;
  readonly mutedStrong: string;
  readonly neutralOverlay: string;
  readonly noteOutline: string;
  readonly playheadGlow: string;
  readonly tonalFaint: string;
  readonly tonalSoft: string;
  readonly tonalMedium: string;
}

export interface ApplicationColorTheme {
  /** Passed to the browser so native form controls match the theme. */
  readonly colorScheme: "dark" | "light";
  readonly neutral: NeutralThemeColors;
  readonly accent: AccentThemeColors;
  readonly pianoRoll: PianoRollThemeColors;
  readonly notes: NoteThemeColors;
  readonly interaction: InteractionThemeColors;
  readonly pianoKeyboard: PianoKeyboardThemeColors;
  readonly effects: EffectThemeColors;
}

/**
 * Existing dark theme.
 *
 * This palette intentionally preserves the previously customized playhead
 * and tonal-grid colors. It remains available by changing ACTIVE_THEME_ID.
 */
const DARK_APPLICATION_THEME = Object.freeze({
  colorScheme: "dark",
  neutral: Object.freeze({
    deepest: "#060708",
    application: "#111318",
    inset: "#121419",
    deep: "#13171d",
    low: "#15181d",
    panel: "#171a20",
    control: "#1a1d23",
    card: "#1b1f26",
    raised: "#20242c",
    raisedStrong: "#242a34",
    selected: "#212733",
    information: "#202a39",
    dangerSurface: "#352126",
    dangerSurfaceStrong: "#713941",
    borderSubtle: "#252a33",
    border: "#303642",
    borderControl: "#353b47",
    borderStrong: "#39414f",
    borderActive: "#46566e",
    borderPrimary: "#5274ac",
    borderDanger: "#77464b",
    textPrimary: "#edf1f7",
    textBright: "#f8faff",
    textStrong: "#dce2eb",
    textControl: "#c5cedb",
    textSecondary: "#a8b1bf",
    textMuted: "#8a94a3",
    textQuiet: "#697484",
    textDisabled: "#596271",
    inspectorHeading: "#344a69",
  }),
  accent: Object.freeze({
    primary: "#79a7ff",
    primaryBright: "#a8c5f7",
    primarySurface: "#31558b",
    warm: "#f0c66f",
    danger: "#ef5c65",
    playhead: "#f3163b",
    success: "#62d6b4",
    tonal: "#d25671",
    purple: "#a77bf3",
    orange: "#ff9b71",
  }),
  pianoRoll: Object.freeze({
    background: "#111318",
    blackKeyRow: "#121419",
    pitchLine: "#252a33",
    subdivisionLine: "#242933",
    beatLine: "#303744",
    barLine: "#465164",
    rulerSubdivision: "#343b47",
    rulerBeat: "#4a5464",
    rulerBar: "#667388",
    rulerText: "#8b96a7",
    degreeAccents: Object.freeze([
      "#5b9cff",
      "#ff8c42",
      "#d6d94a",
      "#4fd17a",
      "#35ced0",
      "#ff5d73",
      "#b277f2",
    ] as const),
    degreePitchRows: Object.freeze([
      "rgba(91, 156, 255, 0.1)",
      "rgba(255, 140, 66, 0.1)",
      "rgba(214, 217, 74, 0.1)",
      "rgba(79, 209, 122, 0.1)",
      "rgba(53, 206, 208, 0.1)",
      "rgba(255, 93, 115, 0.1)",
      "rgba(178, 119, 242, 0.1)",
    ] as const),
    degreeRootRows: Object.freeze([
      "rgba(91, 156, 255, 0.24)",
      "rgba(255, 140, 66, 0.24)",
      "rgba(214, 217, 74, 0.24)",
      "rgba(79, 209, 122, 0.24)",
      "rgba(53, 206, 208, 0.24)",
      "rgba(255, 93, 115, 0.24)",
      "rgba(178, 119, 242, 0.24)",
    ] as const),
    tonalSnapPitchRow: "rgba(91, 156, 255, 0.1)",
    tonalSnapRootRow: "rgba(91, 156, 255, 0.24)",
    activePitchLane: "rgba(121, 167, 255, 0.16)",
    lockedNoteHatch: "rgba(8, 10, 14, 0.72)",
  }),
  notes: Object.freeze({
    default: "#6ea8fe",
    outOfScale: "#596271",
    label: "rgba(18, 22, 29, 0.78)",
    instrumentPalette: Object.freeze([
      "#79a7ff",
      "#a77bf3",
      "#ff9b71",
      "#62d6b4",
      "#f0c66f",
      "#f17ca8",
    ] as const),
    pitchClassPalette: Object.freeze([
      "#ef5c65",
      "#f07c5d",
      "#eaa64f",
      "#d3c958",
      "#8bcf63",
      "#55c89e",
      "#4bc2d1",
      "#5797ea",
      "#7775e8",
      "#a66fdc",
      "#d56dbc",
      "#ea6f8d",
    ] as const),
  }),
  interaction: Object.freeze({
    lassoBorder: "rgba(120, 180, 255, 0.95)",
    lassoFill: "rgba(80, 150, 255, 0.18)",
    lassoInnerShadow: "rgba(30, 70, 120, 0.3)",
  }),
  pianoKeyboard: Object.freeze({
    whiteKeyStart: "#d2d5db",
    whiteKeyEnd: "#f5f6f8",
    whiteKeyText: "#5c626e",
    blackKeyStart: "#08090b",
    blackKeyEnd: "#252931",
  }),
  effects: Object.freeze({
    overlayBackdrop: "rgba(5, 7, 10, 0.72)",
    shadowSoft: "rgba(0, 0, 0, 0.32)",
    shadowMedium: "rgba(0, 0, 0, 0.42)",
    shadowStrong: "rgba(0, 0, 0, 0.48)",
    highlightFaint: "rgba(255, 255, 255, 0.12)",
    highlightSoft: "rgba(255, 255, 255, 0.18)",
    highlightMedium: "rgba(255, 255, 255, 0.42)",
    highlightStrong: "rgba(255, 255, 255, 0.88)",
    highlightNearlyOpaque: "rgba(255, 255, 255, 0.9)",
    primaryFaint: "rgba(121, 167, 255, 0.05)",
    primarySoft: "rgba(121, 167, 255, 0.16)",
    primaryMedium: "rgba(121, 167, 255, 0.48)",
    primaryStrong: "rgba(121, 167, 255, 0.62)",
    warmFaint: "rgba(240, 198, 111, 0.055)",
    warmSoft: "rgba(240, 198, 111, 0.12)",
    warmMedium: "rgba(240, 198, 111, 0.5)",
    warmStrong: "rgba(240, 198, 111, 0.68)",
    dangerSoft: "rgba(239, 92, 101, 0.14)",
    dangerStrong: "rgba(239, 92, 101, 0.58)",
    successSoft: "rgba(98, 214, 180, 0.14)",
    successStrong: "rgba(98, 214, 180, 0.58)",
    purpleSoft: "rgba(167, 123, 243, 0.16)",
    orangeSoft: "rgba(255, 155, 113, 0.14)",
    mutedSoft: "rgba(124, 133, 147, 0.14)",
    mutedStrong: "rgba(124, 133, 147, 0.52)",
    neutralOverlay: "rgba(115, 125, 141, 0.46)",
    noteOutline: "rgba(20, 25, 34, 0.8)",
    playheadGlow: "rgba(255, 77, 77, 0.36)",
    tonalFaint: "rgba(86, 190, 210, 0.035)",
    tonalSoft: "rgba(86, 190, 210, 0.1)",
    tonalMedium: "rgba(86, 190, 210, 0.44)",
  }),
} satisfies ApplicationColorTheme);

/**
 * Light theme inspired by aged score paper, graphite, and printed music ink.
 *
 * Warm beige surfaces avoid the clinical look of pure white. Muted teal is
 * used for interaction, sepia for structure, amber for tonal landmarks, and
 * restrained red for destructive states and the playhead.
 */
const SCORE_PAPER_APPLICATION_THEME = Object.freeze({
  colorScheme: "light",
  neutral: Object.freeze({
    deepest: "#332b22",
    application: "#f2ead9",
    inset: "#e9dec8",
    deep: "#e2d4ba",
    low: "#d9c9aa",
    panel: "#f8f1e3",
    control: "#eadfc9",
    card: "#efe4cf",
    raised: "#fff9ee",
    raisedStrong: "#f7ead2",
    selected: "#dfd0b4",
    information: "#dce7e1",
    dangerSurface: "#f2dcd7",
    dangerSurfaceStrong: "#e4b9b1",
    borderSubtle: "#ddcfb3",
    border: "#cbb994",
    borderControl: "#baa67d",
    borderStrong: "#a59068",
    borderActive: "#7e6a48",
    borderPrimary: "#60817b",
    borderDanger: "#a75a55",
    textPrimary: "#332b22",
    textBright: "#211b15",
    textStrong: "#44392c",
    textControl: "#544735",
    textSecondary: "#6d5f4c",
    textMuted: "#85755d",
    textQuiet: "#998a72",
    textDisabled: "#b1a58f",
    inspectorHeading: "#66758a",
  }),
  accent: Object.freeze({
    primary: "#557d78",
    primaryBright: "#315f5b",
    primarySurface: "#c9dcd5",
    warm: "#b57935",
    danger: "#b6524e",
    playhead: "#c6403d",
    success: "#527a60",
    tonal: "#4f8984",
    purple: "#7c6687",
    orange: "#bd7042",
  }),
  pianoRoll: Object.freeze({
    background: "#f2ead9",
    blackKeyRow: "#e5d8be",
    pitchLine: "#ddcfb3",
    subdivisionLine: "#d7c7a7",
    beatLine: "#c5b18b",
    barLine: "#9e8963",
    rulerSubdivision: "#cfbc97",
    rulerBeat: "#b59f78",
    rulerBar: "#826f4f",
    rulerText: "#6d5f4c",
    degreeAccents: Object.freeze([
      "#b6524e",
      "#bd7042",
      "#9b8b3f",
      "#527a60",
      "#497f83",
      "#4f7194",
      "#7c6687",
    ] as const),
    degreePitchRows: Object.freeze([
      "rgba(182, 82, 78, 0.1)",
      "rgba(189, 112, 66, 0.1)",
      "rgba(155, 139, 63, 0.1)",
      "rgba(82, 122, 96, 0.1)",
      "rgba(73, 127, 131, 0.1)",
      "rgba(79, 113, 148, 0.1)",
      "rgba(124, 102, 135, 0.1)",
    ] as const),
    degreeRootRows: Object.freeze([
      "rgba(182, 82, 78, 0.22)",
      "rgba(189, 112, 66, 0.22)",
      "rgba(155, 139, 63, 0.22)",
      "rgba(82, 122, 96, 0.22)",
      "rgba(73, 127, 131, 0.22)",
      "rgba(79, 113, 148, 0.22)",
      "rgba(124, 102, 135, 0.22)",
    ] as const),
    tonalSnapPitchRow: "rgba(79, 137, 132, 0.1)",
    tonalSnapRootRow: "rgba(181, 121, 53, 0.2)",
    activePitchLane: "rgba(85, 125, 120, 0.18)",
    lockedNoteHatch: "rgba(51, 43, 34, 0.5)",
  }),
  notes: Object.freeze({
    default: "#587f91",
    outOfScale: "#998a72",
    label: "rgba(255, 250, 240, 0.9)",
    instrumentPalette: Object.freeze([
      "#557d78",
      "#7c6687",
      "#bd7042",
      "#527a60",
      "#b57935",
      "#a85d70",
    ] as const),
    pitchClassPalette: Object.freeze([
      "#b6524e",
      "#bd6449",
      "#b77b3f",
      "#9b8b3f",
      "#668545",
      "#4f8066",
      "#497f83",
      "#4f7194",
      "#656595",
      "#7c6687",
      "#985f7c",
      "#aa5d68",
    ] as const),
  }),
  interaction: Object.freeze({
    lassoBorder: "rgba(49, 95, 91, 0.92)",
    lassoFill: "rgba(85, 125, 120, 0.18)",
    lassoInnerShadow: "rgba(49, 95, 91, 0.3)",
  }),
  pianoKeyboard: Object.freeze({
    whiteKeyStart: "#fffdf7",
    whiteKeyEnd: "#e8dcc4",
    whiteKeyText: "#6d5f4c",
    blackKeyStart: "#4b4032",
    blackKeyEnd: "#2d271f",
  }),
  effects: Object.freeze({
    overlayBackdrop: "rgba(51, 43, 34, 0.38)",
    shadowSoft: "rgba(63, 49, 32, 0.12)",
    shadowMedium: "rgba(63, 49, 32, 0.2)",
    shadowStrong: "rgba(63, 49, 32, 0.28)",
    highlightFaint: "rgba(255, 255, 255, 0.2)",
    highlightSoft: "rgba(255, 255, 255, 0.32)",
    highlightMedium: "rgba(255, 255, 255, 0.5)",
    highlightStrong: "rgba(255, 255, 255, 0.82)",
    highlightNearlyOpaque: "rgba(255, 255, 255, 0.9)",
    primaryFaint: "rgba(85, 125, 120, 0.06)",
    primarySoft: "rgba(85, 125, 120, 0.16)",
    primaryMedium: "rgba(85, 125, 120, 0.42)",
    primaryStrong: "rgba(85, 125, 120, 0.62)",
    warmFaint: "rgba(181, 121, 53, 0.06)",
    warmSoft: "rgba(181, 121, 53, 0.14)",
    warmMedium: "rgba(181, 121, 53, 0.42)",
    warmStrong: "rgba(181, 121, 53, 0.66)",
    dangerSoft: "rgba(182, 82, 78, 0.13)",
    dangerStrong: "rgba(182, 82, 78, 0.55)",
    successSoft: "rgba(82, 122, 96, 0.14)",
    successStrong: "rgba(82, 122, 96, 0.52)",
    purpleSoft: "rgba(124, 102, 135, 0.15)",
    orangeSoft: "rgba(189, 112, 66, 0.14)",
    mutedSoft: "rgba(133, 117, 93, 0.13)",
    mutedStrong: "rgba(133, 117, 93, 0.48)",
    neutralOverlay: "rgba(109, 95, 76, 0.42)",
    noteOutline: "rgba(45, 37, 28, 0.76)",
    playheadGlow: "rgba(198, 64, 61, 0.3)",
    tonalFaint: "rgba(79, 137, 132, 0.04)",
    tonalSoft: "rgba(79, 137, 132, 0.11)",
    tonalMedium: "rgba(79, 137, 132, 0.42)",
  }),
} satisfies ApplicationColorTheme);

/**
 * Active compile-time theme.
 *
 * Change only this value to switch the complete application between the
 * original dark palette and the light score-paper palette.
 */
export const ACTIVE_APPLICATION_THEME_ID: ApplicationThemeId =
  "dark";

export const APPLICATION_COLOR_THEMES = Object.freeze({
  dark: DARK_APPLICATION_THEME,
  "score-paper": SCORE_PAPER_APPLICATION_THEME,
} satisfies Readonly<Record<ApplicationThemeId, ApplicationColorTheme>>);

export const APPLICATION_COLORS =
  APPLICATION_COLOR_THEMES[ACTIVE_APPLICATION_THEME_ID];

/**
 * CSS-facing semantic tokens generated from the active palette.
 *
 * Components consume these names through var(--color-name). Canvas code uses
 * APPLICATION_COLORS directly, so both rendering paths always match.
 */
export const APPLICATION_CSS_COLOR_VARIABLES = Object.freeze({
  "--color-browser-scheme": APPLICATION_COLORS.colorScheme,
  "--color-surface-deepest": APPLICATION_COLORS.neutral.deepest,
  "--color-surface-app": APPLICATION_COLORS.neutral.application,
  "--color-surface-inset": APPLICATION_COLORS.neutral.inset,
  "--color-surface-deep": APPLICATION_COLORS.neutral.deep,
  "--color-surface-low": APPLICATION_COLORS.neutral.low,
  "--color-surface-panel": APPLICATION_COLORS.neutral.panel,
  "--color-surface-control": APPLICATION_COLORS.neutral.control,
  "--color-surface-card": APPLICATION_COLORS.neutral.card,
  "--color-surface-raised": APPLICATION_COLORS.neutral.raised,
  "--color-surface-raised-strong": APPLICATION_COLORS.neutral.raisedStrong,
  "--color-surface-selected": APPLICATION_COLORS.neutral.selected,
  "--color-surface-information": APPLICATION_COLORS.neutral.information,
  "--color-surface-danger": APPLICATION_COLORS.neutral.dangerSurface,
  "--color-surface-danger-strong":
    APPLICATION_COLORS.neutral.dangerSurfaceStrong,
  "--color-surface-primary": APPLICATION_COLORS.accent.primarySurface,
  "--color-border-subtle": APPLICATION_COLORS.neutral.borderSubtle,
  "--color-border": APPLICATION_COLORS.neutral.border,
  "--color-border-control": APPLICATION_COLORS.neutral.borderControl,
  "--color-border-strong": APPLICATION_COLORS.neutral.borderStrong,
  "--color-border-active": APPLICATION_COLORS.neutral.borderActive,
  "--color-border-primary": APPLICATION_COLORS.neutral.borderPrimary,
  "--color-border-danger": APPLICATION_COLORS.neutral.borderDanger,
  "--color-text-primary": APPLICATION_COLORS.neutral.textPrimary,
  "--color-text-bright": APPLICATION_COLORS.neutral.textBright,
  "--color-text-strong": APPLICATION_COLORS.neutral.textStrong,
  "--color-text-control": APPLICATION_COLORS.neutral.textControl,
  "--color-text-secondary": APPLICATION_COLORS.neutral.textSecondary,
  "--color-text-muted": APPLICATION_COLORS.neutral.textMuted,
  "--color-text-quiet": APPLICATION_COLORS.neutral.textQuiet,
  "--color-text-disabled": APPLICATION_COLORS.neutral.textDisabled,
  "--color-inspector-heading": APPLICATION_COLORS.neutral.inspectorHeading,
  "--color-accent-primary": APPLICATION_COLORS.accent.primary,
  "--color-accent-primary-bright": APPLICATION_COLORS.accent.primaryBright,
  "--color-accent-warm": APPLICATION_COLORS.accent.warm,
  "--color-accent-danger": APPLICATION_COLORS.accent.danger,
  "--color-accent-playhead": APPLICATION_COLORS.accent.playhead,
  "--color-accent-success": APPLICATION_COLORS.accent.success,
  "--color-accent-tonal": APPLICATION_COLORS.accent.tonal,
  "--color-accent-purple": APPLICATION_COLORS.accent.purple,
  "--color-accent-orange": APPLICATION_COLORS.accent.orange,
  "--color-overlay-backdrop": APPLICATION_COLORS.effects.overlayBackdrop,
  "--color-shadow-soft": APPLICATION_COLORS.effects.shadowSoft,
  "--color-shadow-medium": APPLICATION_COLORS.effects.shadowMedium,
  "--color-shadow-strong": APPLICATION_COLORS.effects.shadowStrong,
  "--color-white-faint": APPLICATION_COLORS.effects.highlightFaint,
  "--color-white-soft": APPLICATION_COLORS.effects.highlightSoft,
  "--color-white-medium": APPLICATION_COLORS.effects.highlightMedium,
  "--color-white-strong": APPLICATION_COLORS.effects.highlightStrong,
  "--color-white-nearly-opaque":
    APPLICATION_COLORS.effects.highlightNearlyOpaque,
  "--color-primary-faint": APPLICATION_COLORS.effects.primaryFaint,
  "--color-primary-soft": APPLICATION_COLORS.effects.primarySoft,
  "--color-primary-medium": APPLICATION_COLORS.effects.primaryMedium,
  "--color-primary-strong": APPLICATION_COLORS.effects.primaryStrong,
  "--color-warm-faint": APPLICATION_COLORS.effects.warmFaint,
  "--color-warm-soft": APPLICATION_COLORS.effects.warmSoft,
  "--color-warm-medium": APPLICATION_COLORS.effects.warmMedium,
  "--color-warm-strong": APPLICATION_COLORS.effects.warmStrong,
  "--color-danger-soft": APPLICATION_COLORS.effects.dangerSoft,
  "--color-danger-strong": APPLICATION_COLORS.effects.dangerStrong,
  "--color-success-soft": APPLICATION_COLORS.effects.successSoft,
  "--color-success-strong": APPLICATION_COLORS.effects.successStrong,
  "--color-purple-soft": APPLICATION_COLORS.effects.purpleSoft,
  "--color-orange-soft": APPLICATION_COLORS.effects.orangeSoft,
  "--color-muted-soft": APPLICATION_COLORS.effects.mutedSoft,
  "--color-muted-strong": APPLICATION_COLORS.effects.mutedStrong,
  "--color-neutral-overlay": APPLICATION_COLORS.effects.neutralOverlay,
  "--color-note-outline": APPLICATION_COLORS.effects.noteOutline,
  "--color-playhead-glow": APPLICATION_COLORS.effects.playheadGlow,
  "--color-tonal-faint": APPLICATION_COLORS.effects.tonalFaint,
  "--color-tonal-soft": APPLICATION_COLORS.effects.tonalSoft,
  "--color-tonal-medium": APPLICATION_COLORS.effects.tonalMedium,
  "--color-piano-white-start":
    APPLICATION_COLORS.pianoKeyboard.whiteKeyStart,
  "--color-piano-white-end": APPLICATION_COLORS.pianoKeyboard.whiteKeyEnd,
  "--color-piano-white-text": APPLICATION_COLORS.pianoKeyboard.whiteKeyText,
  "--color-piano-black-start":
    APPLICATION_COLORS.pianoKeyboard.blackKeyStart,
  "--color-piano-black-end": APPLICATION_COLORS.pianoKeyboard.blackKeyEnd,
} as const satisfies Readonly<Record<`--color-${string}`, string>>);
