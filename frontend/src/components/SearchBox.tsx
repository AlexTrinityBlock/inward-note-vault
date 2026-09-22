import { Icon } from "./Icon";
import { useI18n } from "../i18n";

type SearchBoxProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

/**
 * The centre search field.
 *
 * Which side does the searching differs by notebook — the server for plain
 * notes, the browser for encrypted ones — and the field used to say so in a line
 * under it. That line is gone: it explained machinery the reader does not need,
 * and the empty state already gives the reason when a search finds nothing.
 */
export function SearchBox({ value, onChange, placeholder }: SearchBoxProps) {
  const { t } = useI18n();

  return (
    <div className="drive-search-box">
      <Icon name="search" size={16} className="drive-search-icon" />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value !== "" ? (
        <button
          type="button"
          className="drive-search-clear"
          title={t("drive.searchClear")}
          aria-label={t("drive.searchClear")}
          onClick={() => onChange("")}
        >
          <Icon name="close" size={13} />
        </button>
      ) : null}
    </div>
  );
}
