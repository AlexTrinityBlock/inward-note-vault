/**
 * The DOM harness for the route tests.
 *
 * `bun test` runs every file in one process, so the window is created once here
 * and shared rather than each file making (and then closing) its own — the
 * second file would otherwise install its globals into a document the first had
 * already torn down.
 */
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });

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

/** The window, for tests that need to build their own events. */
export { dom };
