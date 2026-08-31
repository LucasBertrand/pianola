import {
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  handleDocumentContextMenu,
} from "../useDocumentRadialMenu";

function createContextMenuEvent(
  pointerType?: string,
): MouseEvent & { readonly pointerType?: string } {
  return {
    clientX: 240,
    clientY: 135,
    pointerType,
    preventDefault: vi.fn(),
  } as unknown as MouseEvent & { readonly pointerType?: string };
}

describe("document radial menu", () => {
  test("replaces the native mouse context menu at the pointer position", () => {
    const event = createContextMenuEvent("mouse");
    const openAt = vi.fn();

    handleDocumentContextMenu(event, openAt);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(openAt).toHaveBeenCalledWith({ x: 240, y: 135 });
  });

  test("also handles browsers exposing contextmenu as a MouseEvent", () => {
    const event = createContextMenuEvent();
    const openAt = vi.fn();

    handleDocumentContextMenu(event, openAt);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(openAt).toHaveBeenCalledWith({ x: 240, y: 135 });
  });

  test("disables the native menu without opening for touch or pen", () => {
    const openAt = vi.fn();

    for (const pointerType of ["touch", "pen"]) {
      const event = createContextMenuEvent(pointerType);

      handleDocumentContextMenu(event, openAt);

      expect(event.preventDefault).toHaveBeenCalledOnce();
    }

    expect(openAt).not.toHaveBeenCalled();
  });
});
