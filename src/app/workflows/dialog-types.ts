import type {
  ApplicationDialogTone,
} from "../../ui/components/ApplicationDialogOverlay";

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
