import { useCallback, useEffect, useRef, useState } from "react";

import { useClassifyNote } from "../client/generated";
import type { ClassificationRead, NoteRead } from "../client/generated/models";
import { ApiError } from "../client/http";
import { useI18n } from "../i18n";
import type { NoteSecret } from "../lib/crypto";

type ClassifyPanelProps = {
  note: NoteRead;
  secret: NoteSecret | null;
  onApply: (choice: { folderId: number | null; move: boolean; tags: string[] }) => Promise<void>;
  onClose: () => void;
};

/**
 * Jev's suggestions for one note.
 *
 * Encrypted notes start on a consent step: classifying them means sending the
 * decrypted text to TypeSafe, which the user has to agree to explicitly.
 */
export function ClassifyPanel({ note, secret, onApply, onClose }: ClassifyPanelProps) {
  const { t } = useI18n();
  const classify = useClassifyNote();
  const encrypted = note.notebook === "encrypted";

  const [stage, setStage] = useState<"consent" | "running" | "done">(
    encrypted ? "consent" : "running",
  );
  const [result, setResult] = useState<ClassificationRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
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
        setSelectedTags(
          response.tags
            .filter((tag) => tag.probability >= response.tag_threshold)
            .map((tag) => tag.name),
        );
        setUseFolder(response.folder.folder_id !== null);
        setStage("done");
      } catch (caught) {
        // Show what the server said: a bad key, a rate limit and an upstream
        // failure need different reactions from the user.
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
   * `run` gets a new identity on every render, so this guards with a ref
   * instead of trusting the dependency list: without the guard, every render
   * would fire another request at the API.
   */
  useEffect(() => {
    if (encrypted || startedFor.current === note.id) {
      return;
    }
    startedFor.current = note.id;
    void run(false);
  }, [encrypted, note.id, run]);

  async function apply() {
    await onApply({
      folderId: useFolder ? (result?.folder.folder_id ?? null) : null,
      move: useFolder && result?.folder.folder_id !== null,
      tags: selectedTags,
    });
    onClose();
  }

  return (
    <aside className="classify-panel">
      <div className="panel-header">
        <h3>{t("classify.title")}</h3>
        <button type="button" className="ghost" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>

      {stage === "consent" ? (
        <div className="consent">
          <h4>⚠️ {t("consent.title")}</h4>
          <p>{t("consent.body")}</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => void run(true)}>
              {t("consent.confirm")}
            </button>
            <button type="button" onClick={onClose}>
              {t("consent.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {stage === "running" ? <p className="muted">{t("classify.running")}</p> : null}

      {stage === "done" && error ? <p className="error">{error}</p> : null}

      {stage === "done" && result ? (
        <div className="suggestions">
          <div className="suggestion">
            <span className="label">{t("classify.folderLabel")}</span>
            {result.folder.folder_id !== null ? (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={useFolder}
                  onChange={(event) => setUseFolder(event.target.checked)}
                />
                {result.folder.path}
                <span className="muted small">
                  {Math.round(result.folder.confidence * 100)}% {t("classify.confidence")}
                </span>
              </label>
            ) : (
              <span className="muted">{t("classify.noFolderSuggestion")}</span>
            )}
          </div>

          <div className="suggestion">
            <span className="label">{t("classify.tagsLabel")}</span>
            {result.tags.length === 0 ? (
              <span className="muted">{t("classify.noTagSuggestion")}</span>
            ) : (
              <div className="tag-filter">
                {result.tags.slice(0, 12).map((tag) => {
                  const selected = selectedTags.includes(tag.name);
                  const strong = tag.probability >= result.tag_threshold;
                  return (
                    <button
                      key={tag.name}
                      type="button"
                      className={`chip${selected ? " active" : ""}${strong ? "" : " weak"}`}
                      onClick={() =>
                        setSelectedTags((current) =>
                          current.includes(tag.name)
                            ? current.filter((name) => name !== tag.name)
                            : [...current, tag.name],
                        )
                      }
                    >
                      {tag.name}
                      <span className="count">{Math.round(tag.probability * 100)}%</span>
                      {tag.existing ? null : <span className="badge">{t("classify.newTag")}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {result.model ? (
            <p className="muted small">
              {t("classify.model")}: {result.model}
            </p>
          ) : null}

          <div className="row">
            <button type="button" className="primary" onClick={() => void apply()}>
              {t("classify.applyAll")}
            </button>
            <button type="button" onClick={onClose}>
              {t("classify.dismiss")}
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
