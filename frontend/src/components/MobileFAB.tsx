import { useI18n } from "../i18n";
import { Icon } from "./Icon";

/** The phone's floating create button. Hidden at wider widths by the stylesheet. */
export function MobileFAB({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useI18n();

  return (
    <div className="drive-mobile-fab-container mobile-only">
      <button
        type="button"
        className="drive-mobile-fab"
        title={t("drive.newNote")}
        aria-label={t("drive.newNote")}
        onClick={onClick}
        disabled={disabled}
      >
        <Icon name="plus" size={24} />
      </button>
    </div>
  );
}
