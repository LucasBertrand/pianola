import {
  useCallback,
  useState,
} from "react";
import type {
  ApplicationConfirmationOptions,
  ApplicationDialogState,
  ApplicationDialogTone,
  ShowApplicationAlert,
  ShowApplicationConfirmation,
} from "../../use-cases/dialogs/application-dialog-port";

export interface ApplicationDialogWorkflow {
  readonly dialog: ApplicationDialogState | null;
  readonly showDialog: (dialog: ApplicationDialogState | null) => void;
  readonly alert: ShowApplicationAlert;
  readonly confirm: ShowApplicationConfirmation;
  readonly accept: () => void;
  readonly acceptAlternate: () => void;
  readonly cancel: () => void;
}

/** Owns the application-level alert and confirmation protocol. */
export function useApplicationDialogs(
  onCancel?: () => void,
): ApplicationDialogWorkflow {
  const [dialog, showDialog] = useState<ApplicationDialogState | null>(null);
  const alert = useCallback(
    (
      title: string,
      message: string,
      tone: ApplicationDialogTone = "default",
    ): void => {
      showDialog({
        title,
        message,
        confirmLabel: "OK",
        alternateLabel: null,
        cancelLabel: null,
        tone,
        onConfirm: null,
        onAlternate: null,
      });
    },
    [],
  );
  const confirm = useCallback(
    (options: ApplicationConfirmationOptions): void => {
      showDialog({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        alternateLabel: null,
        cancelLabel: options.cancelLabel ?? "Cancel",
        tone: options.tone ?? "default",
        onConfirm: options.onConfirm,
        onAlternate: null,
      });
    },
    [],
  );
  const cancel = useCallback((): void => {
    onCancel?.();
    showDialog(null);
  }, [onCancel]);
  const accept = useCallback((): void => {
    const action = dialog?.onConfirm;

    showDialog(null);
    action?.();
  }, [dialog]);
  const acceptAlternate = useCallback((): void => {
    const action = dialog?.onAlternate;

    showDialog(null);
    action?.();
  }, [dialog]);

  return {
    dialog,
    showDialog,
    alert,
    confirm,
    accept,
    acceptAlternate,
    cancel,
  };
}
