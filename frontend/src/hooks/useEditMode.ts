/**
 * Read / edit mode for the workspace, including the "ask once" gate.
 *
 * Entering edit mode on desktop switches the editor to a split pane; on a phone
 * it also flips the read/write segmented control. The first time either happens
 * for a given note the reader is asked to confirm, and that answer is
 * remembered — but only for that note, and only until they leave the screen.
 * This mirrors the design's `state.editUnlocked`: the question is asked once per
 * note per visit, never persisted, and never carried across notes.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { PHONE_QUERY, useMediaQuery } from "./useMediaQuery";
import { useDialog } from "../components/Dialog";
import { useI18n } from "../i18n";

export type MobileMode = "read" | "write";

export type EditModeValue = {
  /** Whether the left-hand writing pane is available. */
  editing: boolean;
  /** Phone-only segmented control state. */
  mobileMode: MobileMode;
  isPhone: boolean;
  /** Enter edit mode, asking for confirmation at most once per note. */
  requestEnterEditMode: () => Promise<boolean>;
  /** Leave edit mode; the unlock is forgotten, so the next entry asks again. */
  exitEditMode: () => void;
  /** Switch the phone's segmented control. Selecting write runs the same gate. */
  setMobileMode: (mode: MobileMode) => void;
};

/**
 * @param noteId Identifies the note the unlock is scoped to. Changing it — or
 *   unmounting the screen — resets the gate, which is what makes the question
 *   come back when the reader moves to another note.
 * @param startInEdit A note created straight into edit mode is already
 *   unlocked, so it never asks.
 */
export function useEditMode(noteId: number, startInEdit = false): EditModeValue {
  const { t } = useI18n();
  const dialog = useDialog();
  const isPhone = useMediaQuery(PHONE_QUERY);

  const [editing, setEditing] = useState(startInEdit);
  const [mobileMode, setMobileModeState] = useState<MobileMode>(startInEdit ? "write" : "read");
  // Remembered answer, deliberately not persisted anywhere.
  const editUnlocked = useRef(startInEdit);

  /**
   * A different note is a different question: this is the reset the design does
   * when the note list switches notes.
   *
   * Keyed on the note alone, and not on `startInEdit`. That flag comes from the
   * URL and is cleared as soon as editing ends, so depending on it would re-run
   * this reset mid-session and fight the reader — tapping "read" on a phone
   * would bounce straight back into the editor.
   */
  const syncedNote = useRef(noteId);
  useEffect(() => {
    if (syncedNote.current === noteId) {
      return;
    }
    syncedNote.current = noteId;
    editUnlocked.current = false;
    setEditing(false);
    setMobileModeState("read");
  }, [noteId]);

  const requestEnterEditMode = useCallback(async (): Promise<boolean> => {
    if (editing && (!isPhone || mobileMode === "write")) {
      return true;
    }

    if (editUnlocked.current) {
      setEditing(true);
      if (isPhone) {
        setMobileModeState("write");
      }
      return true;
    }

    const confirmed = await dialog.confirm({
      title: t("editor.enterEditTitle"),
      message: t("editor.enterEditBody"),
      confirmLabel: t("editor.enterEditConfirm"),
    });

    if (confirmed) {
      editUnlocked.current = true;
      setEditing(true);
      if (isPhone) {
        setMobileModeState("write");
      }
      return true;
    }
    return false;
  }, [dialog, editing, isPhone, mobileMode, t]);

  /**
   * Go back to reading.
   *
   * The remembered answer is deliberately kept: the design asks once per note
   * per visit, so going back to reading and in again within the same visit is
   * silent. Clearing it here would re-ask on every toggle, which is the friction
   * the rule exists to remove. It resets when the note changes or the screen
   * unmounts.
   */
  const exitEditMode = useCallback(() => {
    setEditing(false);
    setMobileModeState("read");
  }, []);

  const setMobileMode = useCallback(
    (mode: MobileMode) => {
      if (mode === "write") {
        // Same gate as the desktop Edit button: silent once answered.
        void requestEnterEditMode();
        return;
      }
      setMobileModeState("read");
      // Leaving write mode on a phone also leaves editing, matching the design:
      // read mode hides the toolbar and the textarea.
      setEditing(false);
    },
    [requestEnterEditMode],
  );

  return {
    editing,
    mobileMode,
    isPhone,
    requestEnterEditMode,
    exitEditMode,
    setMobileMode,
  };
}
