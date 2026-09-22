import { expect, test } from "bun:test";

import { applyMarkdownAction } from "./markdownEdit";

/**
 * Apply an action the way the toolbar does: splice the returned text into the
 * value over the edit's own range. Testing the splice rather than the returned
 * fragment alone is what catches an edit that replaces too much.
 */
function apply(
  action: Parameters<typeof applyMarkdownAction>[0],
  value: string,
  start: number,
  end: number,
): string {
  const edit = applyMarkdownAction(action, value, start, end);
  return value.slice(0, edit.from) + edit.text + value.slice(edit.to);
}

test("bold wraps the selection", () => {
  expect(apply("bold", "hello world", 0, 5)).toBe("**hello** world");
});

test("bold inserts a placeholder and selects it when nothing is selected", () => {
  const edit = applyMarkdownAction("bold", "", 0, 0);

  expect(edit.text).toBe("**bold text**");
  // The selection covers the placeholder, not the markers.
  expect(edit.text.slice(edit.selection.start, edit.selection.end)).toBe("bold text");
});

test("italic wraps the selection in single markers", () => {
  expect(apply("italic", "hello", 0, 5)).toBe("*hello*");
});

test("headings prefix every line the selection touches", () => {
  const value = "one\ntwo\nthree";
  const edit = applyMarkdownAction("h2", value, 0, value.length);

  expect(edit.text).toBe("## one\n## two\n## three");
});

test("a heading prefixes the line the caret is on", () => {
  // Caret at the very start of the second line, nothing selected.
  const value = "intro\ntitle here";
  const result = apply("h1", value, 6, 6);

  expect(result).toBe("intro\n# title here");
});

test("a heading prefixes the line the caret is on, from its start", () => {
  const edit = applyMarkdownAction("h1", "title here", 3, 3);

  // The replacement covers "tit" and puts the prefix in front of it; nothing
  // before the line start is touched and no text is duplicated.
  expect(edit.from).toBe(0);
  expect(edit.text).toBe("# tit");
  expect(edit.selection.start).toBe(5);
});

test("list and task prefix every selected line", () => {
  const value = "one\ntwo";

  expect(apply("list", value, 0, value.length)).toBe("- one\n- two");
  expect(apply("task", value, 0, value.length)).toBe("- [ ] one\n- [ ] two");
});

test("quote prefixes every selected line", () => {
  expect(apply("quote", "a\nb", 0, 3)).toBe("> a\n> b");
});

test("code wraps a short inline selection in backticks", () => {
  expect(apply("code", "let x = 1", 0, 9)).toBe("`let x = 1`");
});

test("code uses a fenced block for a multi-line selection", () => {
  const value = "a\nb";
  const result = apply("code", value, 0, value.length);

  expect(result).toContain("```");
  expect(result).toContain("a\nb");
});

test("a fenced block is followed by a newline so the text below stays separate", () => {
  const edit = applyMarkdownAction("code", "text", 4, 4);

  expect(edit.text.endsWith("\n")).toBe(true);
  expect(edit.text).toContain("```\ncode\n```");
});

test("link wraps the selection and selects the URL for typing over", () => {
  const edit = applyMarkdownAction("link", "docs", 0, 4);

  expect(edit.text).toBe("[docs](https://)");
  expect(edit.text.slice(edit.selection.start, edit.selection.end)).toBe("https://");
});

test("link inserts a placeholder label when nothing is selected", () => {
  expect(apply("link", "", 0, 0)).toBe("[link text](https://)");
});

test("table inserts a three-row skeleton", () => {
  const result = apply("table", "", 0, 0);

  expect(result).toContain("| Column | Column |");
  expect(result).toContain("| --- | --- |");
  expect(result).toContain("| Cell | Cell |");
});

test("an insertion replaces only the selected range", () => {
  const value = "keep drop keep";
  const result = apply("italic", value, 5, 9);

  expect(result).toBe("keep *drop* keep");
});

test("block insertions land at the start of the line", () => {
  const value = "first\nsecond";
  // Caret at index 8, in the middle of "second".
  const edit = applyMarkdownAction("table", value, 8, 8);

  // The table is appended after the existing lines, not spliced into one.
  expect(edit.text.startsWith("\n")).toBe(true);
});
