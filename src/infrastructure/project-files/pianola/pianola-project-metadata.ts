import { APPLICATION_CONSTANTS } from "../../../config/product-config";
import { FILE_CONSTANTS } from "../../../config/pianola-file-config";

export function createPianolaProjectFileName(
  projectTitle: string,
): string {
  const baseName = projectTitle
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);

  return (
    `${
      baseName.length > 0
        ? baseName
        : `${APPLICATION_CONSTANTS.productSlug}-project`
    }`
    + FILE_CONSTANTS.pianolaProjectExtension
  );
}
