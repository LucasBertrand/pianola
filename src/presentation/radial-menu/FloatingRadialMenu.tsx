import React, {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  createPortal,
} from "react-dom";
import {
  getRadialDividerEndPoint,
  getRadialSegmentClipPath,
  getRadialSegmentTransform,
  type ViewportPoint,
} from "./floating-radial-menu-model";

export interface FloatingRadialMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
  readonly tone?: "default" | "danger" | "transport";
  readonly onSelect: () => void;
}

export interface FloatingRadialMenuProps {
  readonly position: ViewportPoint;
  readonly revision: number;
  readonly closing: boolean;
  readonly items: readonly FloatingRadialMenuItem[];
  readonly centerButton?: {
    readonly label: string;
    readonly icon: ReactNode;
    readonly onSelect: () => void;
  };
  readonly onClose: () => void;
}

interface RadialMenuStyle extends CSSProperties {
  readonly "--radial-item-count": number;
}

interface RadialSegmentStyle extends CSSProperties {
  readonly "--radial-segment-rotation": string;
  readonly "--radial-segment-counter-rotation": string;
  readonly "--radial-segment-index": number;
}

/**
 * Accessible command menu rendered above the entire application. Commands are
 * data-driven so callers can replace or reorder sectors without changing the
 * radial layout.
 */
export function FloatingRadialMenu({
  position,
  revision,
  closing,
  items,
  centerButton,
  onClose,
}: FloatingRadialMenuProps): React.JSX.Element | null {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const enabledItemIndex = items.findIndex((item) => item.disabled !== true);
  const menuStyle = useMemo<RadialMenuStyle>(() => ({
    left: position.x,
    top: position.y,
    "--radial-item-count": items.length,
  }), [items.length, position.x, position.y]);
  const segmentClipPath = useMemo(
    () => getRadialSegmentClipPath(items.length),
    [items.length],
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (
        menuRef.current !== null
        && event.target instanceof Node
        && !menuRef.current.contains(event.target)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return (): void => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (closing) {
      return;
    }

    const firstEnabledItem = menuRef.current?.querySelector<HTMLButtonElement>(
      '.radial-menu-segment:not(:disabled)',
    );
    firstEnabledItem?.focus({ preventScroll: true });
  }, [closing, revision]);

  if (items.length < 1) {
    return null;
  }

  return createPortal(
    <div className="radial-menu-layer" aria-hidden={closing}>
      <div
        key={revision}
        ref={menuRef}
        className={`radial-menu${closing ? " is-closing" : ""}`}
        style={menuStyle}
        role="menu"
        aria-label="Commandes de la grille"
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (
            event.key !== "ArrowRight"
            && event.key !== "ArrowDown"
            && event.key !== "ArrowLeft"
            && event.key !== "ArrowUp"
            && event.key !== "Home"
            && event.key !== "End"
          ) {
            return;
          }

          const enabledItems = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              ".radial-menu-segment:not(:disabled)",
            ),
          );

          if (enabledItems.length === 0) {
            return;
          }

          event.preventDefault();
          const currentIndex = enabledItems.findIndex(
            (item) => item === document.activeElement,
          );
          const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
              ? enabledItems.length - 1
              : event.key === "ArrowRight" || event.key === "ArrowDown"
                ? (currentIndex + 1 + enabledItems.length) % enabledItems.length
                : (currentIndex - 1 + enabledItems.length) % enabledItems.length;

          enabledItems[nextIndex]?.focus();
        }}
      >
        <div className="radial-menu-disc" aria-hidden="true" />
        {items.map((item, index) => {
          const transform = getRadialSegmentTransform(index, items.length);
          const segmentStyle: RadialSegmentStyle = {
            clipPath: segmentClipPath,
            "--radial-segment-rotation": transform.rotation,
            "--radial-segment-counter-rotation": transform.counterRotation,
            "--radial-segment-index": index,
          };

          return (
            <button
              key={item.id}
              className={`radial-menu-segment is-${item.tone ?? "default"}`}
              style={segmentStyle}
              type="button"
              role="menuitem"
              tabIndex={index === enabledItemIndex ? 0 : -1}
              disabled={item.disabled}
              aria-label={item.label}
              title={item.label}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
            >
              <span className="radial-menu-segment-content">
                <span className="radial-menu-segment-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="radial-menu-segment-label">{item.label}</span>
              </span>
            </button>
          );
        })}
        <svg
          className="radial-menu-dividers"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          {items.map((item, index) => {
            const endpoint = getRadialDividerEndPoint(index, items.length);

            return (
              <line
                key={`${item.id}-divider`}
                x1="50"
                y1="50"
                x2={endpoint.x}
                y2={endpoint.y}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {centerButton ? (
          <button
            className="radial-menu-center"
            type="button"
            aria-label={centerButton.label}
            title={centerButton.label}
            onClick={() => {
              centerButton.onSelect();
              onClose();
            }}
          >
            <span className="radial-menu-segment-icon" aria-hidden="true">
              {centerButton.icon}
            </span>
          </button>
        ) : (
          <button
            className="radial-menu-center"
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <span className="radial-menu-center-close" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
