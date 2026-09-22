/**
 * Light / dark theme, chosen by hand and remembered.
 *
 * The design tokens in `styles/tokens.css` define the light palette on `:root`
 * and the dark one on `[data-theme="dark"]`, so switching themes is a matter of
 * setting one attribute on `<html>`.
 *
 * The system preference is the starting point, but only until the reader
 * switches once: from then on the stored choice wins, even if the system
 * changes underneath. That is deliberately different from the `light-dark()`
 * CSS this replaced, which could only ever follow the system.
 *
 * The initial resolution lives in an inline script in `index.html`, not here,
 * so that a dark-mode reload does not flash white before React mounts. This hook
 * reads back the decision that script already made.
 */
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

/** Follows this project's `inward.*` localStorage convention. */
const STORAGE_KEY = "inward.theme";

function readStored(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const applied = document.documentElement.dataset.theme;
    return applied === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Until the reader makes a choice of their own, keep following the system.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      if (readStored() === null) {
        setThemeState(systemTheme());
      }
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggle, isDark: theme === "dark" };
}
