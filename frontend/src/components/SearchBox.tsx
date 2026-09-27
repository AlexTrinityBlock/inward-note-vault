import { useEffect, useRef, useState } from "react";
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
 *
 * Handles CJK / IME composition so typing with Bopomofo/Pinyin does not trigger
 * parent re-renders and corrupt the composition session into duplicate characters.
 */
export function SearchBox({ value, onChange, placeholder }: SearchBoxProps) {
  const { t } = useI18n();
  const [localValue, setLocalValue] = useState(value);
  const isComposingRef = useRef(false);

  useEffect(() => {
    if (!isComposingRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  function handleCompositionStart() {
    isComposingRef.current = true;
  }

  function handleCompositionEnd(event: React.CompositionEvent<HTMLInputElement>) {
    isComposingRef.current = false;
    const next = event.currentTarget.value;
    setLocalValue(next);
    onChange(next);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const isComposing =
      Boolean((event.nativeEvent as unknown as { isComposing?: boolean })?.isComposing) ||
      isComposingRef.current;
    const next = event.target.value;
    setLocalValue(next);
    if (!isComposing) {
      onChange(next);
    }
  }

  function handleClear() {
    setLocalValue("");
    onChange("");
  }

  return (
    <div className="drive-search-box">
      <Icon name="search" size={16} className="drive-search-icon" />
      <input
        type="text"
        value={localValue}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={placeholder}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
      {localValue !== "" ? (
        <button
          type="button"
          className="drive-search-clear"
          title={t("drive.searchClear")}
          aria-label={t("drive.searchClear")}
          onClick={handleClear}
        >
          <Icon name="close" size={13} />
        </button>
      ) : null}
    </div>
  );
}
