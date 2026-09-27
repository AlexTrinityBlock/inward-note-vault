import { Icon } from "./Icon";
import { StatusPill, type SaveState } from "./StatusPill";
import { useI18n } from "../i18n";

type EditorHeaderProps = {
  title: string;
  onTitleChange: (title: string) => void;
  onBack: () => void;
  editing: boolean;
  /** Focuses the writing pane when the title is clicked, in read mode. */
  onRequestEdit: () => void;
  onToggleEdit: () => void;
  onSave: () => void;
  onClassify: () => void;
  onMove?: () => void;
  onDelete: () => void;
  saveState: SaveState;
  saving: boolean;
  /** Shown only while a phone is in read mode. */
  mobileMode: "read" | "write";
  onMobileModeChange: (mode: "read" | "write") => void;
  onToggleSidebar?: () => void;
  notebook?: "plain" | "encrypted";
};

/**
 * The workspace header: back link, title, and the actions that act on the note.
 *
 * In read mode the title is not an input — clicking it is what asks to start
 * editing, so the "am I allowed to type here?" question never arises from a
 * caret appearing in a field that will not accept anything.
 */
export function EditorHeader({
  title,
  onTitleChange,
  onBack,
  editing,
  onRequestEdit,
  onToggleEdit,
  onSave,
  onClassify,
  onMove,
  onDelete,
  saveState,
  saving,
  mobileMode,
  onMobileModeChange,
  onToggleSidebar,
  notebook,
}: EditorHeaderProps) {
  const { t } = useI18n();

  return (
    <header className="app-header">
      <div className="app-header-main">
        <div className="header-left">
          {onToggleSidebar ? (
            <button
              type="button"
              className="drive-icon-btn ghost"
              title={t("drive.toggleSidebar")}
              aria-label={t("drive.toggleSidebar")}
              onClick={onToggleSidebar}
            >
              <Icon name="menu" size={18} />
            </button>
          ) : null}

          <button type="button" className="back-home-btn" title={t("drive.backToFolders")} onClick={onBack}>
            <Icon name="arrow-left" size={15} />
            <span>{t("common.back")}</span>
          </button>

          {notebook ? (
            <div
              className={`current-vault-indicator${notebook === "encrypted" ? " encrypted" : ""}`}
            >
              <span className="vault-mini-badge">
                <Icon name={notebook === "encrypted" ? "lock" : "file"} size={11} />
              </span>
              <span>
                {notebook === "encrypted" ? t("notes.encryptedNotebook") : t("notes.plainNotebook")}
              </span>
            </div>
          ) : null}

          <div className="header-divider" />

          <div className="header-title-wrapper">
            <input
              className="editor-title-input"
              type="text"
              value={title}
              placeholder={t("editor.titlePlaceholder")}
              readOnly={!editing}
              onChange={(event) => onTitleChange(event.target.value)}
              onClick={() => {
                if (!editing) {
                  onRequestEdit();
                }
              }}
            />
          </div>
        </div>

        <div className="header-right">
          <StatusPill state={saveState} />

          {editing ? (
            <>
              <button
                type="button"
                className="primary compact-btn"
                title={t("common.save")}
                onClick={onSave}
                disabled={saving}
              >
                <Icon name="save" size={13} />
                <span>{t("common.save")}</span>
              </button>
              <button type="button" className="ghost compact-btn" onClick={onToggleEdit}>
                <Icon name="eye" size={14} />
                <span>{t("editor.readMode")}</span>
              </button>
            </>
          ) : (
            <button type="button" className="primary compact-btn" onClick={onRequestEdit}>
              <Icon name="edit" size={14} />
              <span>{t("editor.editMode")}</span>
            </button>
          )}

          <button type="button" className="ghost compact-btn" onClick={onClassify}>
            <Icon name="sparkles" size={14} />
            <span>{t("editor.autoCategory")}</span>
          </button>

          {onMove ? (
            <button
              type="button"
              className="ghost compact-btn"
              title={t("drive.move")}
              onClick={onMove}
            >
              <Icon name="move" size={14} />
              <span>{t("drive.move")}</span>
            </button>
          ) : null}

          <button
            type="button"
            className="danger icon-btn compact-icon-btn"
            title={t("drive.deleteNote")}
            aria-label={t("drive.deleteNote")}
            onClick={onDelete}
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      <div className="mobile-mode-bar">
        <div className="mobile-mode-segmented">
          <button
            type="button"
            className={`mobile-mode-btn${mobileMode === "read" ? " active" : ""}`}
            aria-pressed={mobileMode === "read"}
            onClick={() => onMobileModeChange("read")}
          >
            <Icon name="eye" size={14} />
            <span>{t("editor.mobileRead")}</span>
          </button>
          <button
            type="button"
            className={`mobile-mode-btn${mobileMode === "write" ? " active" : ""}`}
            aria-pressed={mobileMode === "write"}
            onClick={() => onMobileModeChange("write")}
          >
            <Icon name="edit" size={14} />
            <span>{t("editor.mobileWrite")}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
