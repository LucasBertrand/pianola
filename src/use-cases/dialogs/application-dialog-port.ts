export type ApplicationDialogTone = "default" | "danger";

export interface ApplicationDialogState {
  readonly title: string;
  readonly message: string;
  readonly details?: readonly string[];
  readonly confirmLabel: string;
  readonly alternateLabel: string | null;
  readonly cancelLabel: string | null;
  readonly tone: ApplicationDialogTone;
  readonly onConfirm: (() => void) | null;
  readonly onAlternate: (() => void) | null;
}

export interface ApplicationConfirmationOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly tone?: ApplicationDialogTone;
  readonly onConfirm: () => void;
}

export type ShowApplicationAlert = (
  title: string,
  message: string,
  tone?: ApplicationDialogTone,
) => void;

export type ShowApplicationConfirmation = (
  options: ApplicationConfirmationOptions,
) => void;
