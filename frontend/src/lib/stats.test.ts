import { expect, test } from "bun:test";

import { textStats } from "./stats";

test("counts nothing for empty or whitespace-only text", () => {
  expect(textStats("")).toEqual({ words: 0, characters: 0, readingMinutes: 0 });
  expect(textStats("   \n\t ")).toEqual({ words: 0, characters: 0, readingMinutes: 0 });
});

test("counts Latin words by whitespace", () => {
  const stats = textStats("one two three four five");

  expect(stats.words).toBe(5);
  expect(stats.characters).toBe(19);
  // Five words is well under a minute, and the floor is one.
  expect(stats.readingMinutes).toBe(1);
});

test("counts CJK glyphs individually, not as one word", () => {
  const stats = textStats("今天天氣很好");

  // A whitespace split would report 1 here, which is the bug this guards.
  expect(stats.words).toBe(6);
  expect(stats.characters).toBe(6);
});

test("mixes Latin words and CJK glyphs in one count", () => {
  const stats = textStats("Hello 世界");

  expect(stats.words).toBe(3);
  expect(stats.characters).toBe(7);
});

test("characters excludes whitespace and counts code points", () => {
  // The emoji is one code point but two UTF-16 units.
  const stats = textStats("a b 🎉");

  expect(stats.characters).toBe(3);
});

test("reading time grows with length", () => {
  const words = Array.from({ length: 600 }, () => "word").join(" ");

  expect(textStats(words).readingMinutes).toBe(3);
  expect(textStats("今天天氣很好".repeat(200)).readingMinutes).toBe(3);
});
