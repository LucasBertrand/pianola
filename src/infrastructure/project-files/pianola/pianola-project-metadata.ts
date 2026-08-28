import { APPLICATION_CONSTANTS } from "../../../application/product/product-constants";
import { FILE_CONSTANTS } from "./pianola-file-constants";

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
