import { useEffect } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { NoteRead } from "../client/generated/models";

/** Marks a note that was created straight into edit mode. */
export const START_IN_EDIT = "edit";

/** How the file list is ordered. */
export const SORT_KEYS = ["updated", "created", "title"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Grid cards or a table. */
export const VIEW_MODES = ["grid", "list"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export function isSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as readonly string[]).includes(value);
}

export function isViewMode(value: string | null): value is ViewMode {
  return value !== null && (VIEW_MODES as readonly string[]).includes(value);
}

/**
 * What the canvas is showing inside the current folder: its subfolders, or the
 * notes it holds.
 *
 * The sidebar used to render the whole folder tree and every category, which
 * stops working as soon as a vault is real — two unbounded lists competing in
 * one narrow column. Browsing moved onto the canvas instead, one level at a
 * time, and this is the switch between "where can I go" and "what is in here".
 */
export const SCOPES = ["folders", "files"] as const;
export type Scope = (typeof SCOPES)[number];

export function isScope(value: string | null): value is Scope {
  return value !== null && (SCOPES as readonly string[]).includes(value);
}

/**
 * Driving the drive screen from the URL.
 *
 * Which notebook, which folder, which category, the search text, the ordering
 * and the view mode all live in the query string rather than in component
 * state. The reason is not aesthetics: the encrypted notebook locks again on
 * reload, so a note selection remembered in `localStorage` would point at
 * something unreadable and leave the screen blank while the UI claimed
 * otherwise. A URL is also the only version a reader can bookmark or share, and
 * the back button then walks back through the folders they actually visited.
 */
export function useDriveParams() {
  const [params, setParams] = useSearchParams();
  const { notebook, folderId: routeFolderId } = useParams<{ notebook?: string; folderId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const folderPathMatch = location.pathname.match(/\/folders\/(\d+)/);
  const pathFolderId =
    routeFolderId && /^\d+$/.test(routeFolderId)
      ? Number(routeFolderId)
      : folderPathMatch
      ? Number(folderPathMatch[1])
      : null;

  const rawFolder = params.get("folder");
  const queryFolderId = rawFolder !== null && /^\d+$/.test(rawFolder) ? Number(rawFolder) : null;

  const folderId = pathFolderId !== null ? pathFolderId : queryFolderId;

  const currentNotebook = notebook || location.pathname.match(/\/n\/([^/]+)/)?.[1] || "plain";

  // Redirect legacy query parameter ?folder=2 to RESTful /n/:notebook/folders/2
  useEffect(() => {
    if (queryFolderId !== null && currentNotebook) {
      const next = new URLSearchParams(params);
      next.delete("folder");
      const qs = next.toString();
      const searchPart = qs ? `?${qs}` : "";
      navigate(`/n/${currentNotebook}/folders/${queryFolderId}${searchPart}`, { replace: true });
    }
  }, [queryFolderId, currentNotebook, params, navigate]);

  const category = params.get("category");
  const q = params.get("q") ?? "";
  const rawSort = params.get("sort");
  const rawView = params.get("view");
  const rawScope = params.get("show");

  const sort: SortKey = isSortKey(rawSort) ? rawSort : "updated";
  const view: ViewMode = isViewMode(rawView) ? rawView : "grid";
  // A search always means notes, so it forces the file scope.
  const scope: Scope = q.trim() !== "" ? "files" : isScope(rawScope) ? rawScope : "folders";

  function update(changes: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === "") {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }
        return next;
      },
      // Typing in the search box should not push a history entry per keystroke.
      { replace: true },
    );
  }

  function setFolder(id: number | null) {
    const next = new URLSearchParams(params);
    next.delete("folder");
    next.delete("category");
    const qs = next.toString();
    const searchPart = qs ? `?${qs}` : "";
    if (id === null) {
      navigate(`/n/${currentNotebook}${searchPart}`);
    } else {
      navigate(`/n/${currentNotebook}/folders/${id}${searchPart}`);
    }
  }

  function setCategory(name: string | null) {
    const next = new URLSearchParams(params);
    next.delete("folder");
    if (name === null) {
      next.delete("category");
    } else {
      next.set("category", name);
    }
    const qs = next.toString();
    const searchPart = qs ? `?${qs}` : "";
    navigate(`/n/${currentNotebook}${searchPart}`);
  }

  return {
    folderId,
    category,
    q,
    sort,
    view,
    scope,
    setFolder,
    setCategory,
    setSearch: (value: string) => update({ q: value }),
    setSort: (value: SortKey) => update({ sort: value === "updated" ? null : value }),
    setView: (value: ViewMode) => update({ view: value === "grid" ? null : value }),
    setScope: (value: Scope) => update({ show: value === "folders" ? null : value }),
  };
}

/** Order notes for the file list, newest first except for the title sort. */
export function sortNotes(notes: NoteRead[], sort: SortKey): NoteRead[] {
  const copy = [...notes];
  switch (sort) {
    case "created":
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "title":
      return copy.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
    case "updated":
      return copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
}

/**
 * Drop `mode=edit` from the URL once the note is no longer being edited.
 *
 * That parameter is what opens a freshly created note straight into the editor.
 * Leaving it in place would re-assert edit mode on every later render: exiting
 * to read mode would appear to do nothing, and switching notes would silently
 * re-enter the editor.
 */
export function useClearStartInEdit(editing: boolean): void {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!editing && searchParams.get("mode") === START_IN_EDIT) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("mode");
          return next;
        },
        { replace: true },
      );
    }
  }, [editing, searchParams, setSearchParams]);
}
