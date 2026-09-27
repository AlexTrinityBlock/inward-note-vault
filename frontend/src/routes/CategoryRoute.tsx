import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import {
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
} from "../client/generated";
import { Breadcrumbs } from "../components/drive/Breadcrumbs";
import { EmptyState } from "../components/drive/EmptyState";
import { FileGrid } from "../components/drive/FileGrid";
import { useDialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { useI18n } from "../i18n";
import { CATEGORY_COUNT_MAX, CATEGORY_NAME_MAX_CHARS } from "../lib/limits";
import type { DriveOutletContext } from "./DriveLayout";

/**
 * Category management: the design's own page, built on the existing category
 * table rather than a new one.
 *
 * Two views share the page. The overview is a grid of cards with note counts and
 * an add field; picking one drills into the notes that carry it. The drill-down
 * is the same page with a filter applied, not a separate screen, which is why it
 * is one route and not two.
 */
export function CategoryRoute() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const dialog = useDialog();
  const toast = useToast();
  const { notebook, categories, notes, decrypted, createNote, creating, refresh } =
    useOutletContext<DriveOutletContext>();

  const [drill, setDrill] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const createCategory = useCreateCategory();
  const renameCategory = useRenameCategory();
  const removeCategory = useDeleteCategory();

  const atLimit = categories.length >= CATEGORY_COUNT_MAX;

  const drilledNotes = useMemo(
    () =>
      drill === null
        ? []
        : notes
            .filter((note) => (note.categories ?? []).includes(drill))
            .map((note) => ({ note, secret: decrypted[note.id] ?? null })),
    [drill, notes, decrypted],
  );

  async function addCategory() {
    const name = draft.trim();
    if (name === "" || atLimit) {
      return;
    }
    setDraft("");
    try {
      await createCategory.mutateAsync({ data: { name } });
      toast.success(t("categories.created"));
      await refresh();
    } catch {
      toast.error(t("categories.addFailed"));
    }
  }

  async function renameTo(current: string) {
    const name = await dialog.prompt({
      title: t("categories.renameTitle"),
      defaultValue: current,
      confirmLabel: t("common.rename"),
      validate: (value) => (value === "" ? t("categories.newPlaceholder") : null),
    });
    if (name === null || name === current) {
      return;
    }
    const target = categories.find((category) => category.name === current);
    if (!target) {
      return;
    }
    try {
      await renameCategory.mutateAsync({ categoryId: target.id, data: { name } });
      if (drill === current) {
        setDrill(name);
      }
      toast.success(t("categories.renamed"));
      await refresh();
    } catch {
      toast.error(t("categories.renameFailed"));
    }
  }

  async function deleteCategoryByName(name: string) {
    const target = categories.find((category) => category.name === name);
    if (!target) {
      return;
    }
    const ok = await dialog.confirm({
      message: t("categories.deleteConfirm"),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) {
      return;
    }
    try {
      await removeCategory.mutateAsync({ categoryId: target.id });
      if (drill === name) {
        setDrill(null);
      }
      toast.success(t("categories.deleted"));
      await refresh();
    } catch {
      toast.error(t("categories.deleteFailed"));
    }
  }

  /** Create a note that already carries this category. */
  async function newNoteIn(category: string) {
    const id = await createNote(null, [category]);
    if (id !== null) {
      navigate(`/n/${notebook}/notes/${id}?mode=edit`);
    }
  }

  if (drill !== null) {
    return (
      <div className="drive-content">
        <div className="drive-canvas-header">
          <Breadcrumbs
            trail={[
              { label: t("drive.rootCrumb"), onClick: () => navigate(`/n/${notebook}`) },
              { label: t("categories.title"), onClick: () => setDrill(null) },
              { label: drill },
            ]}
          />
        </div>

        <div className="category-notes-header">
          <div className="category-notes-heading">
            <button type="button" className="ghost" onClick={() => setDrill(null)}>
              <Icon name="arrow-left" size={14} />
              <span>{t("categories.backToAll")}</span>
            </button>
            <div className="category-card-icon">
              <Icon name="tag" size={15} />
            </div>
            <h3>{drill}</h3>
            <span className="category-card-count">
              {t("categories.noteCount", { count: drilledNotes.length })}
            </span>
          </div>

          <button
            type="button"
            className="primary"
            disabled={creating}
            onClick={() => void newNoteIn(drill)}
          >
            <Icon name="plus" size={13} />
            <span>{t("categories.newNoteIn")}</span>
          </button>
        </div>

        {drilledNotes.length === 0 ? (
          <EmptyState title={t("categories.noNotes")} body={t("categories.manageHint")} icon="tag" />
        ) : (
          <FileGrid notes={drilledNotes} onOpen={(id) => navigate(`/n/${notebook}/notes/${id}`)} />
        )}
      </div>
    );
  }

  return (
    <div className="drive-content">
      <div className="drive-canvas-header">
        <Breadcrumbs
          trail={[
            { label: t("drive.rootCrumb"), onClick: () => navigate(`/n/${notebook}`) },
            { label: t("categories.title") },
          ]}
        />
      </div>

      <section className="drive-section">
        <div className="category-page-header">
          <div className="category-page-heading">
            <div className="category-page-icon">
              <Icon name="tag" size={20} />
            </div>
            <div>
              <h3 className="drive-section-title">{t("categories.title")}</h3>
              <p className="muted small">{t("categories.subtitle")}</p>
            </div>
          </div>

          <form
            className="category-add-bar"
            onSubmit={(event) => {
              event.preventDefault();
              void addCategory();
            }}
          >
            <input
              type="text"
              value={draft}
              placeholder={t("categories.newPlaceholder")}
              maxLength={CATEGORY_NAME_MAX_CHARS}
              autoComplete="off"
              disabled={atLimit}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className="primary" disabled={atLimit || draft.trim() === ""}>
              <Icon name="plus" size={14} />
              <span>{t("categories.add")}</span>
            </button>
          </form>
        </div>

        {atLimit ? <p className="error">{t("categories.atLimit")}</p> : null}

        {categories.length === 0 ? (
          <EmptyState
            title={t("categories.empty")}
            body={t("categories.manageHint")}
            icon="tag"
          />
        ) : (
          <div className="category-cards-grid">
            {categories.map((category) => (
              <div key={category.id} className="category-card">
                <div className="category-card-top">
                  <div className="category-card-icon">
                    <Icon name="tag" size={16} />
                  </div>
                  <span className="category-card-count">
                    {t("categories.noteCount", { count: category.note_count })}
                  </span>
                </div>

                <button
                  type="button"
                  className="category-card-name"
                  title={category.name}
                  onClick={() => setDrill(category.name)}
                >
                  {category.name}
                </button>

                <div className="category-card-actions">
                  <button
                    type="button"
                    className="ghost"
                    title={t("common.rename")}
                    onClick={() => void renameTo(category.name)}
                  >
                    <Icon name="edit" size={13} />
                    <span>{t("common.rename")}</span>
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    title={t("common.delete")}
                    onClick={() => void deleteCategoryByName(category.name)}
                  >
                    <Icon name="trash" size={13} />
                    <span>{t("common.delete")}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
