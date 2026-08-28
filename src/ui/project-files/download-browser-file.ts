import {
  FILE_CONSTANTS,
} from "../../infrastructure/project-files/pianola/pianola-file-constants";

/** Starts a browser download and releases its object URL after navigation. */
export function downloadBrowserFile(
  blob: Blob,
  fileName: string,
): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, FILE_CONSTANTS.objectUrlRevokeDelayMs);
}
