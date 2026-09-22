import { useCallback, useEffect, useRef, useState } from "react";

import { useClassifyNote } from "../client/generated";
import type { ClassificationRead, NoteRead } from "../client/generated/models";
import { ApiError } from "../client/http";
import { useI18n } from "../i18n";
import type { NoteSecret } from "../lib/crypto";
import { Icon } from "./Icon";

type ClassifyPanelProps = {
  note: NoteRead;
  secret: NoteSecret | null;
  /** How many categories the vault has: Jev can only choose among those. */
  knownCategoryCount: number;
  onApply: (choice: {
    folderId: number | null;
    move: boolean;
    categories: string[];
  }) => Promise<void>;
  onClose: () => void;
};

/**
 * Jev's suggestions for one note, as the design's `#classify-modal`.
 *
 * Encrypted notes start on a consent step and stay there until the reader
 * agrees. That step is a privacy mechanism, not decoration: classifying an
 * encrypted note means sending its decrypted text to TypeSafe, so it must not
 * be skipped, defaulted past, or removed when this component is restyled.
 */
export function ClassifyPanel({
  note,
  secret,
  knownCategoryCount,
  onApply,
  onClose,
}: ClassifyPanelProps) {
  const { t } = useI18n();
  const classify = useClassifyNote();
  const encrypted = note.notebook === "encrypted";

  const [stage, setStage] = useState<"consent" | "running" | "done">(
    encrypted ? "consent" : "running",
  );
  const [result, setResult] = useState<ClassificationRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [useFolder, setUseFolder] = useState(false);

  const startedFor = useRef<number | null>(null);

  const run = useCallback(
    async (consent: boolean) => {
      setStage("running");
      setError(null);
      try {
        const response = await classify.mutateAsync({
          noteId: note.id,
          data: {
            content: encrypted ? (secret?.body ?? "") : null,
            consent,
          },
        });
        setResult(response);
        setSelectedCategories(
          response.categories
            .filter((category) => category.probability >= response.category_threshold)
            .map((category) => category.name),
        );
        setUseFolder(response.folder.folder_id !== null);
        setStage("done");
      } catch (caught) {
        // Show what the server said: a bad key, a rate limit and an upstream
        // failure need different reactions from the reader.
        if (caught instanceof ApiError) {
          setError(
            caught.status === 400
              ? t("classify.needsKey")
              : caught.status === 429
                ? t("classify.rateLimited")
                : caught.message,
          );
        } else {
          setError(t("classify.failed"));
        }
        setStage("done");
      }
    },
    [classify, encrypted, note.id, secret, t],
  );

  /**
   * Ask Jev automatically for plain notes — at most once per note.
   *
   * `run` gets a new identity on every render, so this guards with a ref rather
   * than trusting the dependency list: without the guard, every render would
   * fire another request at the API.
   */
  useEffect(() => {
    if (encrypted || startedFor.current === note.id) {
      return;
    }
    startedFor.current = note.id;
    void run(false);
  }, [encrypted, note.id, run]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function apply() {
    await onApply({
      folderId: useFolder ? (result?.folder.folder_id ?? null) : null,
      move: useFolder && result?.folder.folder_id !== null,
      categories: selectedCategories,
    });
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal-card classify-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="classify-title"
      >
        <div className="modal-header">
          <div className="modal-title" id="classify-title">
            <Icon name="sparkles" size={18} />
            <span>{t("classify.title")}</span>
          </div>
          <button
            type="button"
            className="icon-btn ghost"
            title={t("common.close")}
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="modal-body">
          {stage === "consent" ? (
            <section className="consent">
              <h4>
                <Icon name="alert" size={16} />
                <span>{t("consent.title")}</span>
              </h4>
              <p>{t("consent.body")}</p>
              <div className="row modal-inline-actions">
                <button type="button" className="primary" onClick={() => void run(true)}>
                  {t("consent.confirm")}
                </button>
                <button type="button" className="ghost" onClick={onClose}>
                  {t("consent.cancel")}
                </button>
              </div>
            </section>
          ) : null}

          {stage === "running" ? <p className="muted">{t("classify.running")}</p> : null}

          {stage === "done" && error ? <p className="error">{error}</p> : null}

          {stage === "done" && result ? (
            <>
              <p className="modal-intro">{t("classify.intro")}</p>

              <div className="suggested-item">
                <label className="suggested-folder">
                  <input
                    type="checkbox"
                    checked={useFolder}
                    disabled={result.folder.folder_id === null}
                    onChange={(event) => setUseFolder(event.target.checked)}
                  />
                  <span>{t("classify.folderLabel")}</span>
                </label>
                <span className="suggested-folder-name">
                  {result.folder.folder_id !== null
                    ? `${result.folder.path} · ${Math.round(result.folder.confidence * 100)}%`
                    : t("classify.noFolderSuggestion")}
                </span>
              </div>

              <div className="suggestion">
                <span className="suggestion-label">{t("classify.categoriesLabel")}</span>
                {result.categories.length === 0 ? (
                  <span className="muted">
                    {knownCategoryCount === 0
                      ? t("classify.noCandidates")
                      : t("classify.noCategorySuggestion")}
                  </span>
                ) : (
                  <ul className="meter-list">
                    {result.categories.slice(0, 12).map((category) => {
                      const selected = selectedCategories.includes(category.name);
                      const probability = Math.round(category.probability * 100);
                      return (
                        <li key={category.name}>
                          <button
                            type="button"
                            className={`meter-row${selected ? " selected" : ""}`}
                            aria-pressed={selected}
                            onClick={() =>
                              setSelectedCategories((current) =>
                                current.includes(category.name)
                                  ? current.filter((name) => name !== category.name)
                                  : [...current, category.name],
                              )
                            }
                          >
                            <span className="meter-head">
                              <span className="meter-name">{category.name}</span>
                              <span className="meter-value">{probability}%</span>
                            </span>
                            <span className="meter-track" aria-hidden="true">
                              <span className="meter-fill" style={{ width: `${probability}%` }} />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <p className="muted small">
                {result.samples > 1
                  ? `${t("classify.sampled")} ${result.samples} × ${Math.round(
                      result.characters / result.samples,
                    )} ${t("classify.characters")}`
                  : null}
                {result.samples_failed > 0
                  ? ` ${result.samples_failed} ${t("classify.samplesFailed")}`
                  : null}
              </p>

              {result.model ? (
                <p className="muted small">
                  {t("classify.model")}: {result.model}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        {stage === "done" && result ? (
          <div className="modal-footer">
            <button type="button" className="ghost" onClick={onClose}>
              {t("classify.dismiss")}
            </button>
            <button type="button" className="primary" onClick={() => void apply()}>
              {t("classify.applyAll")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
