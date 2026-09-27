/**
 * Counting words, characters and reading time.
 *
 * The obvious `body.split(/\s+/)` is wrong for Chinese: CJK text has no spaces,
 * so a 500-character paragraph counts as one "word" and the reading time comes
 * out at zero minutes. Counting CJK characters individually and everything else
 * by whitespace gives a number that means something in all three languages the
 * interface ships in.
 */

/** Ranges for Han, Hiragana, Katakana and Hangul, which are counted per glyph. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;

/** Latin-script words: a run of letters/digits, apostrophes allowed inside. */
const LATIN_WORD = /[A-Za-z0-9\u00c0-\u024f][A-Za-z0-9\u00c0-\u024f'’-]*/g;

export type TextStats = {
  /** Latin words plus individual CJK glyphs. */
  words: number;
  /** Unicode code points, whitespace excluded. */
  characters: number;
  /** Whole minutes, never less than 1 for non-empty text. */
  readingMinutes: number;
};

/** Reading speeds per minute: prose words versus CJK glyphs. */
const WORDS_PER_MINUTE = 200;
const CJK_GLYPHS_PER_MINUTE = 400;

export function textStats(source: string): TextStats {
  if (source.trim() === "") {
    return { words: 0, characters: 0, readingMinutes: 0 };
  }

  const cjkGlyphs = source.match(CJK)?.length ?? 0;
  const latinWords = source.replace(CJK, " ").match(LATIN_WORD)?.length ?? 0;
  const words = cjkGlyphs + latinWords;

  // Count code points rather than UTF-16 units so an emoji or a rare Han
  // character is one character, not two.
  const characters = [...source.replace(/\s/g, "")].length;

  const minutes = latinWords / WORDS_PER_MINUTE + cjkGlyphs / CJK_GLYPHS_PER_MINUTE;

  return {
    words,
    characters,
    readingMinutes: Math.max(1, Math.round(minutes)),
  };
}
