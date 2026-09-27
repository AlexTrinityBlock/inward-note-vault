import { useState } from "react";
import type { FolderRead } from "../../client/generated/models";
import { useI18n } from "../../i18n";
import { Icon } from "../Icon";

export type MoveDialogProps = {
  isOpen: boolean;
  itemTitle: string;
  itemType: "note" | "folder";
  currentFolderId: number | null;
  folders: FolderRead[];
  disabledFolderIds?: number[];
  onMove: (targetFolderId: number | null) => Promise<void> | void;
  onClose: () => void;
};

export function MoveDialog({
  isOpen,
  itemTitle,
  itemType,
  currentFolderId,
  folders,
  disabledFolderIds = [],
  onMove,
  onClose,
}: MoveDialogProps) {
  const { t } = useI18n();
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(currentFolderId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      await onMove(selectedFolderId);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card move-dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Icon name="move" size={16} />
            <span>{itemType === "folder" ? t("drive.moveFolder") : t("drive.moveNote")}</span>
          </div>
          <button type="button" className="ghost compact-icon-btn" onClick={onClose} aria-label={t("common.close")}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div className="move-dialog-item-info">
            <Icon name={itemType === "folder" ? "folder" : "file"} size={16} />
            <span className="move-dialog-item-title">{itemTitle}</span>
          </div>

          <label className="move-dialog-label">{t("drive.destinationFolder")}</label>

          <div className="move-dialog-folder-list">
            <div
              className={`move-dialog-folder-item${selectedFolderId === null ? " selected" : ""}`}
              onClick={() => setSelectedFolderId(null)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedFolderId(null);
                }
              }}
            >
              <Icon name="folder" size={16} />
              <span className="move-dialog-folder-name">{t("notes.noFolder")}</span>
              {currentFolderId === null ? (
                <span className="move-dialog-current-badge">{t("drive.currentLocation")}</span>
              ) : null}
            </div>

            {folders.map((folder) => {
              const isDisabled = disabledFolderIds.includes(folder.id);
              const isCurrent = currentFolderId === folder.id;
              const isSelected = selectedFolderId === folder.id;

              return (
                <div
                  key={folder.id}
                  className={`move-dialog-folder-item${isSelected ? " selected" : ""}${isDisabled ? " disabled" : ""}`}
                  onClick={() => {
                    if (!isDisabled) {
                      setSelectedFolderId(folder.id);
                    }
                  }}
                  role="button"
                  tabIndex={isDisabled ? -1 : 0}
                  onKeyDown={(e) => {
                    if (!isDisabled && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setSelectedFolderId(folder.id);
                    }
                  }}
                >
                  <Icon name="folder" size={16} />
                  <span className="move-dialog-folder-name" title={folder.path || folder.name || ""}>
                    {folder.path || folder.name || ""}
                  </span>
                  {isCurrent ? (
                    <span className="move-dialog-current-badge">{t("drive.currentLocation")}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="ghost" onClick={onClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || selectedFolderId === currentFolderId}
          >
            {t("drive.moveHere")}
          </button>
        </div>
      </div>
    </div>
  );
}
