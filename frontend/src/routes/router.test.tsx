/**
 * A render smoke test: mount the real screens in a DOM and walk the routes.
 *
 * The point is to catch wiring mistakes TypeScript cannot see — a hook called
 * outside its provider type-checks perfectly and then throws on the first paint,
 * which is exactly how `/settings` broke once. The API is stubbed, so this
 * exercises the client's own composition rather than a backend.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });

beforeAll(() => {
  // React, and our own hooks, read these as bare globals rather than off
  // `window`, so every one the app touches has to be forwarded.
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = dom;
  globals.document = dom.document;
  globals.navigator = dom.navigator;
  globals.localStorage = dom.localStorage;
  globals.HTMLElement = dom.HTMLElement;
  globals.Element = dom.Element;
  globals.Node = dom.Node;
  globals.MouseEvent = dom.MouseEvent;
  globals.KeyboardEvent = dom.KeyboardEvent;
  globals.Event = dom.Event;
  globals.getComputedStyle = dom.getComputedStyle.bind(dom);
  globals.requestAnimationFrame = (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 0) as unknown as number;
  globals.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
  globals.IS_REACT_ACT_ENVIRONMENT = true;

  const mediaQuery = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  dom.matchMedia = mediaQuery as unknown as typeof dom.matchMedia;
  globals.matchMedia = mediaQuery;

  // The theme resolves from localStorage during the first render.
  dom.localStorage.setItem("inward.theme", "light");
});

afterAll(() => {
  dom.close();
});

/** The smallest API surface these routes touch. */
function stubFetch(): void {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/setup/status")) {
      return json({ needs_setup: false });
    }
    if (url.includes("/api/auth/me")) {
      return json({ username: "owner" });
    }
    if (url.includes("/api/crypto/profile")) {
      return json({ initialized: false });
    }
    if (url.includes("/api/settings")) {
      return json({
        typesafe_configured: false,
        typesafe_source: null,
        typesafe_model: "",
        auto_classify_enabled: false,
      });
    }
    // Everything else is an empty collection: folders, categories, notes.
    return json([]);
  }) as typeof fetch;
}

/**
 * Mount the app, navigate to `path`, and report the rendered markup plus
 * anything React logged. A throw inside a provider boundary otherwise only
 * shows up as a blank page.
 */
async function renderAt(path: string): Promise<{ errors: string[]; html: string }> {
  stubFetch();
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
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
              // `DriveLayout` is the parent route in the real router, so this
              // mirrors `router.tsx` rather than mounting the screen alone.
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
    // Let the stubbed queries settle. React Query resolves on a microtask and
    // then re-renders, so this has to be a real turn of the event loop.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      if (!container.innerHTML.includes("Loading")) {
        break;
      }
    }

    const html = container.innerHTML;
    await act(async () => {
      root.unmount();
    });
    container.remove();
    return { errors, html };
  } finally {
    console.error = originalError;
  }
}

const ROUTES = [
  "/",
  "/n/plain",
  "/n/plain/categories",
  "/n/plain/notes/1",
  "/n/encrypted",
  "/settings",
];

for (const path of ROUTES) {
  test(`renders ${path} without throwing`, async () => {
    const { errors, html } = await renderAt(path);

    // A hook used outside its provider lands here, not in `tsc`.
    expect(errors.join("\n")).not.toContain("must be used inside");
    expect(html.length).toBeGreaterThan(0);
  });
}

test("the settings screen renders its form, not an error page", async () => {
  const { errors, html } = await renderAt("/settings");

  expect(errors.join("\n")).not.toContain("Unexpected Application Error");
  expect(html).toContain("TypeSafe");
});
