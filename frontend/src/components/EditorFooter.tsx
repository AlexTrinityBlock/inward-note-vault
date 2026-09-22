import { useI18n } from "../i18n";
import { textStats } from "../lib/stats";

/**
 * The statistics strip under the editor: words, characters, reading time, and
 * the categories the note currently carries.
 *
 * Counting is delegated to `lib/stats.ts`, which counts CJK glyphs individually
 * — a plain whitespace split reports a Chinese paragraph as one word.
 */
export function EditorFooter({ body, categories }: { body: string; categories: string[] }) {
  const { t } = useI18n();
  const { words, characters, readingMinutes } = textStats(body);

  return (
    <footer className="editor-footer">
      <div className="editor-footer-stats">
        <span>
          {t("editor.words")}: <strong>{words}</strong>
        </span>
        <span>
          {t("editor.characters")}: <strong>{characters}</strong>
        </span>
        <span>
          {t("editor.readingTime")}:{" "}
          <strong>
            {readingMinutes} {t("editor.minutes")}
          </strong>
        </span>
        <div className="meta-category-pills">
          {categories.map((category) => (
            <span key={category} className="meta-category-pill">
              {category}
            </span>
          ))}
        </div>
      </div>
      <span className="editor-footer-hint">{t("editor.shortcutHint")}</span>
    </footer>
  );
}
