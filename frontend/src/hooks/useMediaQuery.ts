/**
 * Media-query booleans, kept in sync for the component's lifetime.
 *
 * Used for the breakpoints the stylesheet cannot cover on its own — the editor
 * needs to know whether it is on a phone to decide what the "write" toggle does,
 * and the reader's browser has to be told when that changes.
 */
import { useEffect, useState } from "react";

/**
 * The phone breakpoint, matching the `max-width: 768px` the stylesheet uses for
 * `.mobile-only` and the drawer. One definition means a component and a media
 * query cannot disagree about what "on a phone" means.
 */
export const PHONE_QUERY = "(max-width: 768px)";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);

  return matches;
}
