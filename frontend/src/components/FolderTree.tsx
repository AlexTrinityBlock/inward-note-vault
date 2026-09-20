import { useMemo, useState } from "react";

import type { FolderRead } from "../client/generated/models";
import { useI18n } from "../i18n";
import { buildFolderTree, type FolderNode } from "../lib/folders";

type FolderTreeProps = {
  folders: FolderRead[];
  selectedId: number | null;
  onSelect: (folderId: number | null) => void;
  onCreate: (name: string, parentId: number | null) => void;
  onDelete: (folderId: number) => void;
};

/** The `parent_id` tree, with an inline field for new folders at any level. */
export function FolderTree({
  folders,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
}: FolderTreeProps) {
  const { t } = useI18n();
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  // `undefined` closes the field; `null` targets the root.
  const [addingTo, setAddingTo] = useState<number | null | undefined>(undefined);
  const [draft, setDraft] = useState("");

  function commit() {
    const name = draft.trim();
    if (name) {
      onCreate(name, addingTo ?? null);
    }
    setDraft("");
    setAddingTo(undefined);
  }

  function field() {
    return (
      <div className="inline-field">
        <input
          autoFocus
          value={draft}
          placeholder={t("folders.namePlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") setAddingTo(undefined);
          }}
        />
        <button type="button" onClick={commit}>
          {t("common.add")}
        </button>
      </div>
    );
  }

  function branch(nodes: FolderNode[], depth: number) {
    return (
      <ul className="folder-tree" style={{ paddingLeft: depth === 0 ? 0 : "0.75rem" }}>
        {nodes.map((node) => (
          <li key={node.id}>
            <div className={`folder-row${selectedId === node.id ? " selected" : ""}`}>
              <button type="button" className="link" onClick={() => onSelect(node.id)}>
                {node.name}
              </button>
              <span className="row-actions">
                <button
                  type="button"
                  title={t("folders.addChild")}
                  onClick={() => {
                    setAddingTo(node.id);
                    setDraft("");
                  }}
                >
                  +
                </button>
                <button
                  type="button"
                  title={t("common.delete")}
                  onClick={() => {
                    if (confirm(t("folders.deleteConfirm"))) {
                      onDelete(node.id);
                    }
                  }}
                >
                  ×
                </button>
              </span>
            </div>
            {addingTo === node.id ? field() : null}
            {node.children.length > 0 ? branch(node.children, depth + 1) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="panel">
      <h2>{t("folders.title")}</h2>
      <div className={`folder-row${selectedId === null ? " selected" : ""}`}>
        <button type="button" className="link" onClick={() => onSelect(null)}>
          {t("notes.allNotes")}
        </button>
      </div>

      {tree.length === 0 ? <p className="muted small">{t("folders.empty")}</p> : branch(tree, 0)}

      {addingTo === null ? (
        field()
      ) : (
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setAddingTo(null);
            setDraft("");
          }}
        >
          + {t("folders.newFolder")}
        </button>
      )}
    </section>
  );
}
