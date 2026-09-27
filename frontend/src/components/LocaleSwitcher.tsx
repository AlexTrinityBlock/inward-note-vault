import { LOCALES, useI18n } from "../i18n";

export function LocaleSwitcher() {
  const { locale, setLocale, labels, t } = useI18n();

  return (
    <label className="locale-switcher">
      <span className="visually-hidden">{t("common.language")}</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}>
        {LOCALES.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
