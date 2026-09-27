import { expect, test } from "bun:test";

import { markdownSnippet, matchesQuery } from "./markdown";

// `renderMarkdown` is deliberately not covered here: DOMPurify sanitizes
// against a real DOM, and these tests run in Bun without one. What is testable
// away from the browser — and what has the subtle rules — is the snippet.

test("a snippet drops Markdown syntax and keeps the words", () => {
  const snippet = markdownSnippet("# Heading\n\nSome **bold** and `code` text.");

  expect(snippet).toBe("Heading Some bold and code text.");
});

test("a snippet drops links to their label and images to their alt text", () => {
  const snippet = markdownSnippet("See [the docs](https://example.com) and ![a chart](c.png).");

  expect(snippet).toBe("See the docs and a chart.");
});

test("a snippet skips fenced code blocks", () => {
  const snippet = markdownSnippet("Before\n\n```js\nconst x = 1;\n```\n\nAfter");

  expect(snippet).toBe("Before After");
});

test("a snippet skips list markers, quotes and task boxes", () => {
  const snippet = markdownSnippet("> quoted\n\n- [ ] a task\n- an item\n\n1. ordered");

  expect(snippet).toBe("quoted a task an item ordered");
});

test("a snippet truncates with an ellipsis at the limit", () => {
  const snippet = markdownSnippet("word ".repeat(50), 20);

  expect(snippet.length).toBeLessThanOrEqual(21);
  expect(snippet.endsWith("…")).toBe(true);
});

test("an empty body produces an empty snippet", () => {
  expect(markdownSnippet("")).toBe("");
  expect(markdownSnippet("   \n  ")).toBe("");
});

test("a bare marker with nothing after it is left alone", () => {
  // Half-typed Markdown is not a heading yet, and dropping the hashes would
  // lose what the reader typed.
  expect(markdownSnippet("###")).toBe("###");
});

test("an empty query matches everything", () => {
  expect(matchesQuery("", { title: "a", body: "b" })).toBe(true);
  expect(matchesQuery("   ", { title: "a", body: "b" })).toBe(true);
});

test("a query matches the title regardless of case", () => {
  expect(matchesQuery("WORK", { title: "Work notes", body: "" })).toBe(true);
});

test("a query matches anywhere in the body, not only the snippet's worth", () => {
  const body = `${"filler ".repeat(60)}needle at the end`;

  expect(matchesQuery("needle", { title: "", body })).toBe(true);
});

test("a query matches the words, not the Markdown syntax around them", () => {
  // "**bold**" must be findable as "bold".
  expect(matchesQuery("bold", { title: "", body: "some **bold** text" })).toBe(true);
  // A marker on its own is not matchable text.
  expect(matchesQuery("**", { title: "", body: "some **bold** text" })).toBe(false);
});

test("a query that appears nowhere does not match", () => {
  expect(matchesQuery("absent", { title: "Title", body: "Body" })).toBe(false);
});

test("a query inside a fenced code block is not matched", () => {
  // Fenced blocks are dropped from the searchable text, matching what a reader
  // sees as prose in a card.
  expect(matchesQuery("const", { title: "", body: "```js\nconst x = 1;\n```" })).toBe(false);
});
