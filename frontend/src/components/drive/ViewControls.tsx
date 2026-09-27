import { useI18n } from "../../i18n";
import { Icon } from "../Icon";
import { SORT_KEYS, type SortKey, type ViewMode } from "../../hooks/useDriveParams";

type ViewControlsProps = {
  sort: SortKey;
  view: ViewMode;
  onSortChange: (sort: SortKey) => void;
  onViewChange: (view: ViewMode) => void;
};

/**
 * Sorting and the grid/list switch.
 *
 * Both are pure presentation choices, so they are held in the URL rather than in
 * a store: switching to the list view and reloading keeps the list view.
 */
export function ViewControls({ sort, view, onSortChange, onViewChange }: ViewControlsProps) {
  const { t } = useI18n();

  const sortLabels: Record<SortKey, string> = {
    updated: t("drive.sortUpdated"),
    created: t("drive.sortCreated"),
    title: t("drive.sortTitle"),
  };

  return (
    <div className="drive-view-controls">
      <label className="drive-sort-select-wrapper">
        <span className="visually-hidden">{t("drive.sortBy")}</span>
        <select
          className="drive-sort-select"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {sortLabels[key]}
            </option>
          ))}
        </select>
      </label>

      <div className="view-mode-tabs" role="group" aria-label={t("drive.viewToggle")}>
        <button
          type="button"
          className={`view-mode-btn${view === "grid" ? " active" : ""}`}
          title={t("drive.viewGrid")}
          aria-label={t("drive.viewGrid")}
          aria-pressed={view === "grid"}
          onClick={() => onViewChange("grid")}
        >
          <Icon name="grid" size={14} />
        </button>
        <button
          type="button"
          className={`view-mode-btn${view === "list" ? " active" : ""}`}
          title={t("drive.viewList")}
          aria-label={t("drive.viewList")}
          aria-pressed={view === "list"}
          onClick={() => onViewChange("list")}
        >
          <Icon name="list" size={14} />
        </button>
      </div>
    </div>
  );
}
