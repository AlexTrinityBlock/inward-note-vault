import { useCallback, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import {
  useCreateNote,
  useListCategories,
  useListFolders,
  useListNotes,
} from "../client/generated";
import type { CategoryRead, FolderRead, NoteCreate, NoteRead } from "../client/generated/models";
import { AppHeader } from "../components/AppHeader";
import { DriveSidebar } from "../components/drive/DriveSidebar";
import { Icon } from "../components/Icon";
import { LockedNotebook } from "../components/LockedNotebook";
import { SearchBox } from "../components/SearchBox";
import { UnlockDialog } from "../components/UnlockDialog";
import { useDecryptedFolders } from "../hooks/useDecryptedFolders";
import { useDecryptedNotes } from "../hooks/useDecryptedNotes";
import { useDriveParams } from "../hooks/useDriveParams";
import { useEncryptedNotebook } from "../hooks/useEncryptedNotebook";
import { useI18n } from "../i18n";
import type { NoteSecret } from "../lib/crypto";
import { sealNote } from "../lib/crypto";

export type Notebook = "plain" | "encrypted";

/** What every screen under the drive layout receives. */
export type DriveOutletContext = {
  notebook: Notebook;
  folders: FolderRead[];
  categories: CategoryRead[];
  notes: NoteRead[];
  decrypted: Record<number, NoteSecret>;
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  /**
   * Whether the search text still has to be applied in the browser. True for
   * the encrypted notebook only, where the server cannot do it.
   */
  searchInBrowser: boolean;
  folderId: number | null;
  setFolder: (id: number | null) => void;
  category: string | null;
  setCategory: (name: string | null) => void;
  /** Create a note and return its id, or `null` when the notebook is locked. */
  createNote: (folderId?: number | null, categories?: string[]) => Promise<number | null>;
  creating: boolean;
  refresh: () => Promise<void>;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
};

/**
 * Tier two's frame: the top bar, the directory sidebar, and the canvas the
 * drive and the workspace both render into.
 *
 * The sidebar is fixed on a desktop and slides over the canvas on a phone,
 * which is why the drawer state lives here rather than inside it.
 */
export function DriveLayout({ notebook }: { notebook: Notebook }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const encryptedNotebook = useEncryptedNotebook();
  const drive = useDriveParams();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("inward:sidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });
  const [showUnlock, setShowUnlock] = useState(false);

  const locked = notebook === "encrypted" && !encryptedNotebook.unlocked;

  const foldersQuery = useListFolders(
    { notebook },
    { query: { enabled: !locked } },
  );
  const categoriesQuery = useListCategories();

  // A locked notebook must not even ask the server for its notes: without the
  // key there is nothing readable to show, so the request would only leak
  // metadata and waste a round trip.
  const notesQuery = useListNotes(
    {
      notebook,
      category: drive.category ?? undefined,
      // Not sent for the encrypted notebook: the server cannot read ciphertext,
      // and the API answers a `q` on that notebook with plain notes only, so a
      // query sent there always comes back empty. `DriveRoute` filters the
      // decrypted notes in the browser instead.
      q: notebook === "plain" && drive.q.trim() !== "" ? drive.q.trim() : undefined,
    },
    { query: { enabled: !locked } },
  );

  const rawFolders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const folders = useDecryptedFolders(rawFolders, encryptedNotebook.key);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const allNotes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);

  const decrypted = useDecryptedNotes(allNotes, encryptedNotebook.key);

  const createNote = useCreateNote();

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const openUnlock = useCallback(() => setShowUnlock(true), []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("inward:sidebarCollapsed", String(next));
      } catch {}
      return next;
    });
  }, []);

  const addNote = useCallback(
    async (folderId: number | null = null, categoriesForNote: string[] = []) => {
      if (locked) {
        openUnlock();
        return null;
      }

      let payload: NoteCreate;
      if (notebook === "encrypted") {
        const key = encryptedNotebook.key;
        if (!key) {
          openUnlock();
          return null;
        }
        const sealed = await sealNote(key, { title: "", body: "" });
        payload = {
          notebook: "encrypted",
          ciphertext: sealed.ciphertext,
          iv: sealed.iv,
          folder_id: folderId,
          categories: categoriesForNote,
        };
      } else {
        payload = {
          notebook: "plain",
          title: t("notes.untitled"),
          body: "",
          folder_id: folderId,
          categories: categoriesForNote,
        };
      }

      const created = await createNote.mutateAsync({ data: payload });
      await refresh();
      return created.id;
    },
    [createNote, encryptedNotebook.key, locked, notebook, openUnlock, refresh, t],
  );

  const context: DriveOutletContext = {
    notebook,
    folders,
    categories,
    notes: allNotes,
    decrypted,
    loading: notesQuery.isPending && !locked,
    search: drive.q,
    setSearch: drive.setSearch,
    searchInBrowser: notebook === "encrypted",
    folderId: drive.folderId,
    setFolder: drive.setFolder,
    category: drive.category,
    setCategory: drive.setCategory,
    createNote: addNote,
    creating: createNote.isPending,
    refresh,
    sidebarCollapsed,
    toggleSidebar,
  };

  // The sidebar highlights whichever directory the current screen belongs to.
  const activeSection = location.pathname.endsWith("/categories") ? "categories" : "folders";

  /**
   * A single note brings its own header, because editing needs Save / Read mode
   * / the phone's read-write switch, and that row is specific to the editor.
   * Rendering this layout's bar above it as well stacks two headers whose action
   * rows overlap, which is how the Edit button ends up visible but not
   * clickable. So the editor gets the whole screen, exactly as the design's
   * `#workspace-screen` does.
   */
  const isNoteScreen = /\/notes\/[^/]+$/.test(location.pathname);

  return (
    <div className="drive-app-container">
      {isNoteScreen ? null : (
        <AppHeader
          leading={
            <>
              <button
                type="button"
                className="drive-icon-btn ghost"
                title={t("drive.toggleSidebar")}
                aria-label={t("drive.toggleSidebar")}
                onClick={() => {
                  if (typeof window !== "undefined" && window.innerWidth <= 768) {
                    setDrawerOpen((open) => !open);
                  } else {
                    toggleSidebar();
                  }
                }}
              >
                <Icon name="menu" size={20} />
              </button>
              <button
                type="button"
                className="drive-icon-btn ghost"
                title={t("drive.backToVaults")}
                aria-label={t("drive.backToVaults")}
                onClick={() => navigate("/")}
              >
                <Icon name="arrow-left" size={18} />
              </button>
            </>
          }
        />
      )}

      {locked ? (
        <LockedNotebook
          hasProfile={Boolean(encryptedNotebook.profile)}
          onUnlock={openUnlock}
        />
      ) : (
        <div className={`drive-layout${isNoteScreen ? " note-mode" : ""}`}>
          <div
            className={`drive-drawer-backdrop mobile-only${drawerOpen ? " open" : ""}`}
            role="presentation"
            onClick={() => setDrawerOpen(false)}
          />

          <DriveSidebar
            folders={folders}
            categories={categories}
            activeSection={activeSection}
            open={drawerOpen}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            onOpenFolders={() => {
              setDrawerOpen(false);
              drive.setFolder(null);
              drive.setCategory(null);
              navigate(`/n/${notebook}`);
            }}
            onOpenCategories={() => {
              setDrawerOpen(false);
              navigate(`/n/${notebook}/categories`);
            }}
            onNewNote={() => {
              void addNote(drive.folderId).then((id) => {
                if (id !== null) {
                  navigate(`/n/${notebook}/notes/${id}?mode=edit`);
                }
              });
            }}
          />

          <main className={`drive-main-canvas${isNoteScreen ? " note-mode" : ""}`}>
            {!isNoteScreen ? (
              <div className="drive-canvas-header">
                <div className="drive-header-center">
                  <SearchBox
                    value={drive.q}
                    onChange={drive.setSearch}
                    placeholder={t("drive.searchPlaceholder")}
                  />
                </div>
              </div>
            ) : null}
            <Outlet context={context} />
          </main>
        </div>
      )}

      {showUnlock ? (
        <UnlockDialog
          mode={encryptedNotebook.profile ? "unlock" : "create"}
          onCancel={() => setShowUnlock(false)}
          onSubmit={async (password) => {
            if (encryptedNotebook.profile) {
              const ok = await encryptedNotebook.unlock(password);
              if (ok) {
                setShowUnlock(false);
              }
              return ok;
            }
            await encryptedNotebook.create(password);
            setShowUnlock(false);
            return true;
          }}
        />
      ) : null}
    </div>
  );
}
