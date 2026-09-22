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

function stubFetch(notes: unknown[]): void {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/setup/status")) return json({ needs_setup: false });
    if (url.includes("/api/auth/me")) return json({ username: "owner" });
    if (url.includes("/api/crypto/profile")) return json({ initialized: false });
    if (url.includes("/api/settings")) {
      return json({ typesafe_configured: false, typesafe_source: null, typesafe_model: "", auto_classify_enabled: false });
    }
    if (url.includes("/api/notes")) return json(notes);
    return json([]);
  }) as typeof fetch;
}

/** Mount the real route tree and hand back the container plus a click helper. */
async function mount(path: string, notes: unknown[] = []) {
  stubFetch(notes);
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

  await settle();

  return {
    container,
    click,
    clickByText,
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
