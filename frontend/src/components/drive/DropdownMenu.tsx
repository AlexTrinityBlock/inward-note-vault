import { useEffect, useRef, useState, type ReactNode } from "react";

import { useI18n } from "../../i18n";
import { Icon } from "../Icon";

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  onSelect: () => void;
};

/**
 * The `⋯` actions menu on a card or a table row.
 *
 * Closes on an outside click, on Escape, and after an item is chosen — the
 * three ways people expect a menu to go away. The design shows it opening
 * downwards from the trigger; cards near the bottom of a long grid would open
 * it off-screen, so the open direction is left to the stylesheet's overflow
 * rather than computed here.
 */
export function DropdownMenu({
  items,
  label,
  onOpenMenu,
}: {
  items: MenuItem[];
  label: string;
  onOpenMenu?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (container.current && !container.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="drive-item-action-wrapper" ref={container}>
      <button
        type="button"
        className={`drive-item-more-btn${open ? " active" : ""}`}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          // The card around this button is clickable; the menu is not a choice
          // of card.
          event.stopPropagation();
          onOpenMenu?.();
          setOpen((current) => !current);
        }}
      >
        <Icon name="more" size={14} filled />
      </button>

      {open ? (
        <div className="drive-item-dropdown show" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`drive-menu-item${item.danger ? " danger" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
            >
              <span className="drive-menu-item-left">
                {item.icon}
                <span>{item.label}</span>
              </span>
              {item.shortcut ? (
                <span className="drive-menu-item-shortcut">{item.shortcut}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      <span className="visually-hidden">{t("drive.openMenu")}</span>
    </div>
  );
}
