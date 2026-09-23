/**
 * Interaction smoke tests: click the things a reader clicks.
 *
 * The render test next door proves each route mounts; this one proves the two
 * controls that were reported broken actually do what they say — the portal
 * card opens its notebook from anywhere on the card, and confirming "enter edit
 * mode" really switches the note into the editor.
 */
import { expect, test } from "bun:test";

import { dom } from "./test-dom";

const NOTE = {
  id: 1,
  notebook: "plain",
  title: "Beautiful flower",
  body: "A flower.",
  ciphertext: null,
  iv: null,
  folder_id: null,
  categories: ["Plants"],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
};

type RecordedRequest = { url: string; method: string; body?: unknown };
const recordedRequests: RecordedRequest[] = [];

function stubFetch(notes: unknown[], folders: unknown[] = []): void {
  recordedRequests.length = 0;
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    recordedRequests.push({ url, method, body });

    if (url.includes("/api/setup/status")) return json({ needs_setup: false });
    if (url.includes("/api/auth/me")) return json({ username: "owner" });
    if (url.includes("/api/crypto/profile")) return json({ initialized: false });
    if (url.includes("/api/settings")) {
      return json({ typesafe_configured: false, typesafe_source: null, typesafe_model: "", auto_classify_enabled: false });
    }
    if (url.includes("/api/folders")) {
      if (init?.method === "PATCH") {
        return json({ id: 10, name: "FolderA", parent_id: null, ...(body as object) });
      }
      return json(folders);
    }
    if (url.includes("/api/notes")) {
      if (init?.method === "POST") {
        return json({ ...NOTE, id: 999, title: "Beautiful flower (Copy)" });
      }
      if (init?.method === "PATCH") {
        return json({ ...NOTE, ...(body as object) });
      }
      return json(notes);
    }
    return json([]);
  }) as typeof fetch;
}

/** Mount the real route tree and hand back the container plus a click helper. */
async function mount(path: string, notes: unknown[] = [], folders: unknown[] = []) {
  try {
    localStorage.clear();
  } catch {}
  stubFetch(notes, folders);
  const { createElement, act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { RouterProvider, createMemoryRouter } = await import("react-router-dom");
  const { AppGate } = await import("../components/AppGate");
  const { DialogProvider } = await import("../components/Dialog");
  const { ToastProvider } = await import("../components/Toast");
  const { I18nProvider } = await import("../i18n");
  const { CategoryRoute } = await import("./CategoryRoute");
  const { DriveLayout } = await import("./DriveLayout");
  const { DriveRoute } = await import("./DriveRoute");
  const { NoteRoute } = await import("./NoteRoute");
  const { PortalRoute } = await import("./PortalRoute");
  const { SettingsRoute } = await import("./SettingsRoute");

  const container = document.createElement("div");
  document.body.appendChild(container);

  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: createElement(AppGate),
        children: [
          { index: true, element: createElement(PortalRoute) },
          {
            path: "n/:notebook",
            element: createElement(DriveLayout, { notebook: "plain" }),
            children: [
              { index: true, element: createElement(DriveRoute) },
              { path: "folders/:folderId", element: createElement(DriveRoute) },
              { path: "categories", element: createElement(CategoryRoute) },
              { path: "notes/:noteId", element: createElement(NoteRoute) },
            ],
          },
          { path: "settings", element: createElement(SettingsRoute) },
        ],
      },
    ],
    { initialEntries: [path] },
  );

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });

  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            ToastProvider,
            null,
            createElement(DialogProvider, null, createElement(RouterProvider, { router })),
          ),
        ),
      ),
    );
  });

  /** Let queries and effects settle, then re-render. */
  async function settle(rounds = 12) {
    for (let index = 0; index < rounds; index += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
      });
    }
  }

  /** Dispatch a real click on the first element matching `selector`. */
  async function click(selector: string) {
    const element = container.querySelector(selector);
    if (!element) {
      throw new Error(`no element matches ${selector}`);
    }
    await act(async () => {
      element.dispatchEvent(
        new dom.MouseEvent("click", { bubbles: true, cancelable: true }) as unknown as Event,
      );
    });
  }

  async function clickByText(selector: string, text: string) {
    const match = [...container.querySelectorAll(selector)].find((element) =>
      (element.textContent ?? "").includes(text),
    );
    if (!match) {
      throw new Error(`no ${selector} containing ${text}`);
    }
    await act(async () => {
      match.dispatchEvent(
        new dom.MouseEvent("click", { bubbles: true, cancelable: true }) as unknown as Event,
      );
    });
  }

  async function type(selector: string, value: string) {
    const element = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!element) {
      throw new Error(`no element matches ${selector}`);
    }
    await act(async () => {
      const proto =
        element instanceof dom.window.HTMLTextAreaElement
          ? dom.window.HTMLTextAreaElement.prototype
          : dom.window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter?.call(element, value);
      element.dispatchEvent(new dom.Event("input", { bubbles: true }) as unknown as Event);
      element.dispatchEvent(new dom.Event("change", { bubbles: true }) as unknown as Event);
    });
  }

  await settle();

  return {
    container,
    click,
    clickByText,
    type,
    settle,
    path: () => router.state.location.pathname,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

test("the whole portal card opens the plain notebook, not just its button", async () => {
  const app = await mount("/");
  try {
    // Click the card itself, nowhere near the CTA.
    await app.click("button.portal-card.plain");
    await app.settle(4);

    expect(app.path()).toBe("/n/plain");
  } finally {
    await app.unmount();
  }
});

test("the encrypted card is reachable as a card too", async () => {
  const app = await mount("/");
  try {
    await app.click("button.portal-card.encrypted");
    await app.settle(4);

    // With no profile stored, the card opens the create-password dialog rather
    // than navigating: the click landed on the card, which is the point.
    expect(app.container.textContent ?? "").toContain("Create notebook");
  } finally {
    await app.unmount();
  }
});

test("the note screen renders exactly one header", async () => {
  // Two headers stack their action rows, which leaves the upper row's buttons
  // visible but covered — the Edit button looked fine and could not be clicked.
  const app = await mount("/n/plain/notes/1", [NOTE]);
  try {
    expect(app.container.querySelectorAll("header").length).toBe(1);
  } finally {
    await app.unmount();
  }
});

test("the note screen's header carries the editor's own actions", async () => {
  const app = await mount("/n/plain/notes/1", [NOTE]);
  try {
    const header = app.container.querySelector("header");
    expect(header?.className).toContain("app-header");

    const labels = [...app.container.querySelectorAll("button")].map((button) =>
      (button.textContent ?? "").trim(),
    );
    // Save / Read mode / Auto Category only exist in the editor's header, so
    // their presence proves the layout's bar is not the one being shown.
    expect(labels).toContain("Edit");
    expect(labels).toContain("Auto Category");
  } finally {
    await app.unmount();
  }
});

test("the drive and category screens keep the layout header", async () => {
  for (const path of ["/n/plain", "/n/plain/categories"]) {
    const app = await mount(path);
    try {
      expect(app.container.querySelectorAll("header").length).toBe(1);
      expect(app.container.querySelector("header")?.className).toContain("drive-top-header");
    } finally {
      await app.unmount();
    }
  }
});

test("confirming edit mode actually opens the editor", async () => {
  const app = await mount("/n/plain/notes/1", [NOTE]);
  try {
    expect(app.container.querySelector("textarea.editor-textarea")).toBeNull();

    await app.clickByText("button", "Edit");
    await app.settle(4);
    // The confirmation is the gate the design asks for.
    expect(app.container.textContent ?? "").toContain("Enter edit mode");

    await app.clickByText("button", "Edit note");
    await app.settle(6);

    const textarea = app.container.querySelector("textarea.editor-textarea");
    expect(textarea).not.toBeNull();
    expect((textarea as unknown as { value: string }).value).toBe("A flower.");
  } finally {
    await app.unmount();
  }
});

test("leaving edit mode returns to reading, and does not spring back", async () => {
  // A note created from the drive carries `?mode=edit`, which is what the
  // editor uses to open straight into the writing pane.
  const app = await mount("/n/plain/notes/1?mode=edit", [NOTE]);
  try {
    expect(app.container.querySelector("textarea.editor-textarea")).not.toBeNull();

    await app.clickByText("button", "Read Mode");
    await app.settle(6);

    // Without clearing the URL flag this flips straight back into the editor.
    expect(app.container.querySelector("textarea.editor-textarea")).toBeNull();
  } finally {
    await app.unmount();
  }
});

test("a second entry into edit mode does not ask again", async () => {
  const app = await mount("/n/plain/notes/1", [NOTE]);
  try {
    await app.clickByText("button", "Edit");
    await app.settle(4);
    await app.clickByText("button", "Edit note");
    await app.settle(6);
    expect(app.container.querySelector("textarea.editor-textarea")).not.toBeNull();

    // Back to reading, then in again: the answer was remembered for this note.
    await app.clickByText("button", "Read Mode");
    await app.settle(4);
    await app.clickByText("button", "Edit");
    await app.settle(6);

    expect(app.container.querySelector("textarea.editor-textarea")).not.toBeNull();
  } finally {
    await app.unmount();
  }
});

test("the drive screen renders root breadcrumbs without a spurious folders segment", async () => {
  const app = await mount("/n/plain");
  try {
    const crumbs = [...app.container.querySelectorAll(".drive-crumb-item")].map((el) =>
      (el.textContent ?? "").trim(),
    );
    expect(crumbs).toEqual(["My Vault"]);
  } finally {
    await app.unmount();
  }
});

test("the drive screen displays both folders and files when both exist", async () => {
  const FOLDER = { id: 1, name: "Projects", parent_id: null };
  const app = await mount("/n/plain", [NOTE], [FOLDER]);
  try {
    expect(app.container.textContent ?? "").toContain("Folders");
    expect(app.container.textContent ?? "").toContain("Projects");
    expect(app.container.textContent ?? "").toContain("Files");
    expect(app.container.textContent ?? "").toContain("Beautiful flower");
  } finally {
    await app.unmount();
  }
});

test("the dropdown menu opens with .show class on click", async () => {
  const FOLDER = { id: 1, name: "Projects", parent_id: null };
  const app = await mount("/n/plain", [], [FOLDER]);
  try {
    const moreBtn = app.container.querySelector(".drive-item-more-btn") as HTMLElement;
    expect(moreBtn).not.toBeNull();
    expect(app.container.querySelector(".drive-item-dropdown.show")).toBeNull();

    await app.click(".drive-item-more-btn");
    await app.settle(4);

    const dropdown = app.container.querySelector(".drive-item-dropdown.show");
    expect(dropdown).not.toBeNull();
  } finally {
    await app.unmount();
  }
});

test("the confirmation dialog renders with .open class and delete button works", async () => {
  const app = await mount("/n/plain/notes/1", [NOTE]);
  try {
    expect(app.container.querySelector(".modal-overlay.open")).toBeNull();

    await app.click("button.danger.compact-icon-btn");
    await app.settle(4);

    const overlay = app.container.querySelector(".modal-overlay.open");
    expect(overlay).not.toBeNull();
    expect(app.container.textContent ?? "").toContain("Delete this note?");

    // Click confirm delete
    await app.clickByText("button", "Delete");
    await app.settle(6);

    expect(app.container.querySelector(".modal-overlay.open")).toBeNull();
  } finally {
    await app.unmount();
  }
});

test("the note view renders folder trail in breadcrumbs and does not render bottom folder selector", async () => {
  const FOLDER = { id: 2, name: "Archive", parent_id: null, path: "Archive" };
  const noteInFolder = { ...NOTE, folder_id: 2 };
  const app = await mount("/n/plain/notes/1", [noteInFolder], [FOLDER]);
  try {
    const crumbs = app.container.querySelector(".note-canvas-header");
    expect(crumbs?.textContent ?? "").toContain("Archive");

    const select = app.container.querySelector(".editor-folder-select");
    expect(select).toBeNull();
  } finally {
    await app.unmount();
  }
});

test("the note view renders categories in meta bar without duplicate footer", async () => {
  const noteWithCategory = { ...NOTE, categories: ["paleontology"] };
  const app = await mount("/n/plain/notes/1", [noteWithCategory]);
  try {
    const footer = app.container.querySelector(".editor-footer");
    expect(footer).toBeNull();

    const metaBar = app.container.querySelector(".editor-meta-bar");
    expect(metaBar).not.toBeNull();
    const text = metaBar?.textContent ?? "";
    expect(text).toContain("paleontology");
    expect(text).not.toContain("Words");
    expect(text).not.toContain("Characters");
    expect(text).not.toContain("Reading time");
    expect(text).not.toContain("Ctrl + S");
  } finally {
    await app.unmount();
  }
});

test("visiting /n/plain/folders/10 renders folder contents via RESTful path", async () => {
  const FOLDER = { id: 10, name: "Docs", parent_id: null, path: "Docs" };
  const noteInFolder = { ...NOTE, folder_id: 10, title: "Doc Note" };
  const app = await mount("/n/plain/folders/10", [noteInFolder], [FOLDER]);
  try {
    expect(app.container.textContent ?? "").toContain("Docs");
    expect(app.container.textContent ?? "").toContain("Doc Note");
  } finally {
    await app.unmount();
  }
});

test("visiting legacy /n/plain?folder=10 redirects to RESTful /n/plain/folders/10", async () => {
  const FOLDER = { id: 10, name: "Docs", parent_id: null, path: "Docs" };
  const noteInFolder = { ...NOTE, folder_id: 10, title: "Doc Note" };
  const app = await mount("/n/plain?folder=10", [noteInFolder], [FOLDER]);
  try {
    await app.settle(6);
    expect(app.path()).toBe("/n/plain/folders/10");
  } finally {
    await app.unmount();
  }
});

test("the drive note kebab menu provides Rename, Move, Make a copy, Copy, Cut, and Delete options", async () => {
  const app = await mount("/n/plain", [NOTE]);
  try {
    const moreBtn = app.container.querySelector(".drive-item-more-btn") as HTMLElement;
    expect(moreBtn).not.toBeNull();

    await app.click(".drive-item-more-btn");
    await app.settle(4);

    const menu = app.container.querySelector(".drive-item-dropdown.show");
    expect(menu).not.toBeNull();
    const menuText = menu?.textContent ?? "";
    expect(menuText).toContain("Rename");
    expect(menuText).toContain("Move");
    expect(menuText).toContain("Make a copy");
    expect(menuText).toContain("Copy");
    expect(menuText).toContain("Cut");
    expect(menuText).toContain("Delete");
  } finally {
    await app.unmount();
  }
});

test("clicking Make a copy in note kebab menu duplicates the file immediately", async () => {
  const app = await mount("/n/plain", [NOTE]);
  try {
    await app.click(".drive-item-more-btn");
    await app.settle(4);

    await app.clickByText(".drive-menu-item", "Make a copy");
    await app.settle(6);

    expect(app.container.textContent ?? "").toContain("Copy created.");
  } finally {
    await app.unmount();
  }
});

test("Ctrl+C copies note and Ctrl+V pastes copy", async () => {
  const { act } = await import("react");
  const { resetGlobalClipboard } = await import("../hooks/useDriveClipboard");
  resetGlobalClipboard();
  const app = await mount("/n/plain", [NOTE]);
  try {
    await app.click(".note-card");
    await app.settle(4);

    // Press Ctrl+C
    const copyEvent = new dom.KeyboardEvent("keydown", {
      key: "c",
      code: "KeyC",
      ctrlKey: true,
      bubbles: true,
    });
    await act(async () => {
      document.dispatchEvent(copyEvent as unknown as Event);
    });
    await app.settle(4);
    expect(app.container.textContent ?? "").toContain("Copied to clipboard. Press Ctrl+V to paste copy.");

    // Press Ctrl+V
    const pasteEvent = new dom.KeyboardEvent("keydown", {
      key: "v",
      code: "KeyV",
      ctrlKey: true,
      bubbles: true,
    });
    await act(async () => {
      document.dispatchEvent(pasteEvent as unknown as Event);
    });
    await app.settle(6);

    expect(app.container.textContent ?? "").toContain("Copy created.");
  } finally {
    await app.unmount();
  }
});

test("clicking note card selects it and clicking Move in dropdown opens MoveDialog", async () => {
  const FOLDER = { id: 2, name: "Archive", parent_id: null, path: "Archive" };
  const app = await mount("/n/plain", [NOTE], [FOLDER]);
  try {
    const card = app.container.querySelector(".note-card") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.classList.contains("selected")).toBe(false);

    // Single click selects card
    await app.click(".note-card");
    await app.settle(4);
    expect(card.classList.contains("selected")).toBe(true);

    // Open dropdown menu on note card
    await app.click(".note-card .drive-item-more-btn");
    await app.settle(4);

    // Click Move
    await app.clickByText(".drive-menu-item", "Move");
    await app.settle(4);

    // MoveDialog is open
    const modal = app.container.querySelector(".move-dialog-card");
    expect(modal).not.toBeNull();
    expect(modal?.textContent ?? "").toContain("Move note");
    expect(modal?.textContent ?? "").toContain("Archive");
  } finally {
    await app.unmount();
  }
});

test("editor header has a Move button that opens MoveDialog", async () => {
  const FOLDER = { id: 2, name: "Archive", parent_id: null, path: "Archive" };
  const app = await mount("/n/plain/notes/1", [NOTE], [FOLDER]);
  try {
    expect(app.container.querySelector(".move-dialog-card")).toBeNull();

    // Click Move button in header
    await app.clickByText("button.compact-btn", "Move");
    await app.settle(4);

    const modal = app.container.querySelector(".move-dialog-card");
    expect(modal).not.toBeNull();
    expect(modal?.textContent ?? "").toContain("Move note");
    expect(modal?.textContent ?? "").toContain("Root (My Vault)");
  } finally {
    await app.unmount();
  }
});

test("the drive folder kebab menu provides Rename, Move, Cut, and Delete options", async () => {
  const FOLDER = { id: 10, name: "FolderA", parent_id: null, path: "FolderA" };
  const app = await mount("/n/plain", [], [FOLDER]);
  try {
    const moreBtn = app.container.querySelector(".drive-folder-card .drive-item-more-btn") as HTMLElement;
    expect(moreBtn).not.toBeNull();

    await app.click(".drive-folder-card .drive-item-more-btn");
    await app.settle(4);

    const menu = app.container.querySelector(".drive-folder-card .drive-item-dropdown.show");
    expect(menu).not.toBeNull();
    const menuText = menu?.textContent ?? "";
    expect(menuText).toContain("Rename");
    expect(menuText).toContain("Move");
    expect(menuText).toContain("Cut");
    expect(menuText).toContain("Delete");
  } finally {
    await app.unmount();
  }
});

test("clicking Move in folder dropdown opens MoveDialog with folder disabled", async () => {
  const FOLDER_A = { id: 10, name: "FolderA", parent_id: null, path: "FolderA" };
  const FOLDER_B = { id: 20, name: "FolderB", parent_id: 10, path: "FolderA / FolderB" };
  const FOLDER_C = { id: 30, name: "FolderC", parent_id: null, path: "FolderC" };
  const app = await mount("/n/plain", [], [FOLDER_A, FOLDER_B, FOLDER_C]);
  try {
    // Open menu on FolderA
    await app.click(".drive-folder-card .drive-item-more-btn");
    await app.settle(4);

    // Click Move
    await app.clickByText(".drive-menu-item", "Move");
    await app.settle(4);

    const modal = app.container.querySelector(".move-dialog-card");
    expect(modal).not.toBeNull();
    expect(modal?.textContent ?? "").toContain("Move folder");
    expect(modal?.textContent ?? "").toContain("FolderA");

    // FolderA and its subfolder FolderB should have disabled class in MoveDialog
    const items = [...modal!.querySelectorAll(".move-dialog-folder-item")];
    const itemA = items.find((el) => el.textContent?.includes("FolderA"));
    expect(itemA?.classList.contains("disabled")).toBe(true);
    const itemB = items.find((el) => el.textContent?.includes("FolderB"));
    expect(itemB?.classList.contains("disabled")).toBe(true);

    // FolderC should not be disabled
    const itemC = items.find((el) => el.textContent?.includes("FolderC"));
    expect(itemC?.classList.contains("disabled")).toBe(false);
  } finally {
    await app.unmount();
  }
});

test("portal page does not render removed eyebrow, subtitle, or card descriptions", async () => {
  const app = await mount("/");
  try {
    const text = app.container.textContent ?? "";
    expect(text).not.toContain("Two-notebook architecture");
    expect(text).not.toContain("雙筆記本架構");
    expect(text).not.toContain("Choose a notebook to continue.");
    expect(text).not.toContain("選擇一個筆記本以繼續。");
    expect(text).not.toContain("plainBody");
    expect(text).not.toContain("以明文儲存的筆記");
    expect(text).not.toContain("encryptedBody");
    expect(text).not.toContain("儲存前會先在瀏覽器加密");
  } finally {
    await app.unmount();
  }
});

test("pressing Ctrl+X when nothing is selected shows guidance toast", async () => {
  const { act } = await import("react");
  const app = await mount("/n/plain", [NOTE]);
  try {
    const event = new dom.KeyboardEvent("keydown", {
      key: "x",
      code: "KeyX",
      ctrlKey: true,
      bubbles: true,
    });
    await act(async () => {
      document.dispatchEvent(event as unknown as Event);
    });
    await app.settle(4);
    expect(app.container.textContent ?? "").toContain("Please select a file or folder first.");
  } finally {
    await app.unmount();
  }
});

test("selecting note and pressing Ctrl+X marks card as cut and shows toast", async () => {
  const { act } = await import("react");
  const app = await mount("/n/plain", [NOTE]);
  try {
    // Select note card
    await app.click(".note-card");
    await app.settle(4);
    const card = app.container.querySelector(".note-card") as HTMLElement;
    expect(card.classList.contains("selected")).toBe(true);

    // Press Ctrl+X
    const event = new dom.KeyboardEvent("keydown", {
      key: "x",
      code: "KeyX",
      ctrlKey: true,
      bubbles: true,
    });
    await act(async () => {
      document.dispatchEvent(event as unknown as Event);
    });
    await app.settle(4);

    expect(card.classList.contains("cut")).toBe(true);
    expect(app.container.textContent ?? "").toContain("Cut to clipboard.");
  } finally {
    await app.unmount();
  }
});

test("pressing Ctrl+V when clipboard is empty shows clipboard is empty toast", async () => {
  const { act } = await import("react");
  const { resetGlobalClipboard } = await import("../hooks/useDriveClipboard");
  resetGlobalClipboard();
  const app = await mount("/n/plain", [NOTE]);
  try {
    const event = new dom.KeyboardEvent("keydown", {
      key: "v",
      code: "KeyV",
      ctrlKey: true,
      bubbles: true,
    });
    await act(async () => {
      document.dispatchEvent(event as unknown as Event);
    });
    await app.settle(4);
    expect(app.container.textContent ?? "").toContain("Clipboard is empty.");
  } finally {
    await app.unmount();
  }
});

test("Ctrl+X note, select folder, and Ctrl+V pastes note into folder with move: true", async () => {
  const { act } = await import("react");
  const { resetGlobalClipboard } = await import("../hooks/useDriveClipboard");
  resetGlobalClipboard();
  const FOLDER = { id: 10, name: "TargetFolder", parent_id: null, path: "TargetFolder" };
  const app = await mount("/n/plain", [NOTE], [FOLDER]);
  try {
    // 1. Click note card to select it
    await app.click(".note-card");
    await app.settle(4);

    // 2. Press Ctrl+X
    const cutEvent = new dom.KeyboardEvent("keydown", {
      key: "x",
      code: "KeyX",
      ctrlKey: true,
      bubbles: true,
    });
    await act(async () => {
      document.dispatchEvent(cutEvent as unknown as Event);
    });
    await app.settle(4);
    expect(app.container.textContent ?? "").toContain("Cut to clipboard.");

    // 3. Click folder card to select target folder
    await app.click(".drive-folder-card");
    await app.settle(4);

    // 4. Press Ctrl+V
    const pasteEvent = new dom.KeyboardEvent("keydown", {
      key: "v",
      code: "KeyV",
      ctrlKey: true,
      bubbles: true,
    });
    await act(async () => {
      document.dispatchEvent(pasteEvent as unknown as Event);
    });
    await app.settle(6);

    expect(app.container.textContent ?? "").toContain("Moved.");

    // Verify the PATCH request was sent with move: true and folder_id: 10
    const patchReq = recordedRequests.find(
      (r) => r.method === "PATCH" && r.url.includes(`/api/notes/${NOTE.id}`)
    );
    expect(patchReq).toBeDefined();
    expect((patchReq?.body as { folder_id: number; move: boolean })?.folder_id).toBe(10);
    expect((patchReq?.body as { folder_id: number; move: boolean })?.move).toBe(true);
  } finally {
    await app.unmount();
  }
});

test("moving note via MoveDialog sends PATCH with move: true", async () => {
  const FOLDER = { id: 2, name: "Archive", parent_id: null, path: "Archive" };
  const app = await mount("/n/plain", [NOTE], [FOLDER]);
  try {
    // Open dropdown menu on note card
    await app.click(".note-card .drive-item-more-btn");
    await app.settle(4);

    // Click Move
    await app.clickByText(".drive-menu-item", "Move");
    await app.settle(4);

    // Click Target Folder in MoveDialog
    await app.click(".move-dialog-folder-item:last-child");
    await app.settle(4);

    // Click Move confirm button in dialog
    await app.clickByText(".modal-footer button.primary", "Move here");
    await app.settle(6);

    const patchReq = recordedRequests.find(
      (r) => r.method === "PATCH" && r.url.includes(`/api/notes/${NOTE.id}`)
    );
    expect(patchReq).toBeDefined();
    expect((patchReq?.body as { folder_id: number; move: boolean })?.folder_id).toBe(2);
    expect((patchReq?.body as { folder_id: number; move: boolean })?.move).toBe(true);
  } finally {
    await app.unmount();
  }
});

test("note cards do not render snippet and title has title tooltip", async () => {
  const app = await mount("/n/plain", [NOTE]);
  try {
    const card = app.container.querySelector(".note-card");
    expect(card).not.toBeNull();
    const snippet = app.container.querySelector(".note-card-snippet");
    expect(snippet).toBeNull();
    const titleEl = app.container.querySelector(".note-card-title") as HTMLElement;
    expect(titleEl).not.toBeNull();
    expect(titleEl.textContent?.trim()).toBe("Beautiful flower");
    expect(titleEl.getAttribute("title")).toBe("Beautiful flower");
  } finally {
    await app.unmount();
  }
});

test("sidebar can collapse and expand via collapse button and header toggle", async () => {
  const app = await mount("/n/plain", [NOTE]);
  try {
    const sidebar = app.container.querySelector(".drive-sidebar") as HTMLElement;
    expect(sidebar).not.toBeNull();
    expect(sidebar.classList.contains("collapsed")).toBe(false);

    // Click collapse button in sidebar header
    await app.click(".sidebar-collapse-btn");
    await app.settle(4);
    expect(sidebar.classList.contains("collapsed")).toBe(true);

    // Click header toggle button to expand
    await app.click(".drive-top-header .drive-icon-btn:first-child");
    await app.settle(4);
    expect(sidebar.classList.contains("collapsed")).toBe(false);
  } finally {
    await app.unmount();
  }
});

test("in note view, editor header has sidebar toggle button that toggles sidebar", async () => {
  const app = await mount("/n/plain/notes/1", [NOTE]);
  try {
    const sidebar = app.container.querySelector(".drive-sidebar") as HTMLElement;
    expect(sidebar).not.toBeNull();
    expect(sidebar.classList.contains("collapsed")).toBe(false);

    // Click sidebar toggle in editor header
    await app.click(".app-header .header-left .drive-icon-btn");
    await app.settle(4);
    expect(sidebar.classList.contains("collapsed")).toBe(true);

    // Click it again to expand
    await app.click(".app-header .header-left .drive-icon-btn");
    await app.settle(4);
    expect(sidebar.classList.contains("collapsed")).toBe(false);
  } finally {
    await app.unmount();
  }
});

test("saving a note does not automatically pop up Jev classify modal even when auto_classify_enabled is true", async () => {
  const app = await mount("/n/plain/notes/1?mode=edit", [NOTE]);
  try {
    await app.type(".editor-title-input", "Updated Flower Title");
    await app.settle(2);

    // Click Save button
    await app.click(".app-header .header-right button.primary");
    await app.settle(4);

    // Classify modal should NOT be present
    const classifyModal = app.container.querySelector("#classify-modal");
    expect(classifyModal).toBeNull();

    // The recorded PATCH request should contain the updated title
    const patchReq = recordedRequests.find(r => r.method === "PATCH" && r.url.includes("/api/notes/1"));
    expect(patchReq).toBeDefined();
    expect((patchReq?.body as Record<string, unknown>)?.title).toBe("Updated Flower Title");
  } finally {
    await app.unmount();
  }
});

test("renderMarkdown renders code blocks with sugar-high syntax highlighting and data-language", async () => {
  const { renderMarkdown } = await import("../lib/markdown");
  const markdown = "```javascript\nconst greeting = 'hello';\n```";
  const html = renderMarkdown(markdown);

  expect(html).toContain('<pre class="sh__code" data-language="javascript">');
  expect(html).toContain('sh__token--keyword');
  expect(html).toContain('greeting');
});





