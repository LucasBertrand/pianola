import { useEffect } from "react";

export function useKeyboardShortcut(
  codes: readonly string[],
  onAction: () => void,
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (codes.includes(event.code)) {
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
  }, [codes, onAction]);
}
