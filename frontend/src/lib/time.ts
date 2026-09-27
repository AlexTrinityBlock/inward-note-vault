/**
 * Relative timestamps, localized.
 *
 * "3 days ago" answers "is this recent?" at a glance, which is what a file list
 * is actually being scanned for; an absolute date makes the reader do the
 * subtraction. `Intl.RelativeTimeFormat` handles the wording in all three
 * languages the interface ships in.
 */
import type { Locale } from "../i18n";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

/**
 * @param iso An ISO-8601 timestamp, as the API returns.
 * @returns A localized relative phrase, or `""` for an unparseable input.
 */
export function formatRelativeTime(iso: string, locale: Locale): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }

  const seconds = Math.round((then - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  for (const [unit, secondsPerUnit] of UNITS) {
    if (Math.abs(seconds) >= secondsPerUnit) {
      return formatter.format(Math.round(seconds / secondsPerUnit), unit);
    }
  }
  return formatter.format(seconds, "second");
}

/** An absolute timestamp for a `title`, where the relative form is too vague. */
export function formatAbsolute(iso: string, locale: Locale): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}
