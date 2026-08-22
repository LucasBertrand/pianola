import { useEffect } from "react";
import type {
  ShortcutBinding,
} from "../../../persistence/user-settings-model";

export function useKeyboardShortcut(
  bindings: readonly ShortcutBinding[],
  onAction: () => void,
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (bindings.some((binding) =>
        event.code === binding.code
        && event.ctrlKey === binding.control
        && event.shiftKey === binding.shift
        && event.altKey === binding.alt
        && event.metaKey === binding.meta
      )) {
        if (
          document.activeElement instanceof HTMLInputElement
          || document.activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }
        event.preventDefault();
        onAction();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return (): void => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [bindings, onAction]);
}
