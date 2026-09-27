/**
 * Markdown rendering, in one place.
 *
 * The preview pane and the file cards both need rendered Markdown, and both
 * need it sanitized: note bodies are user input, and a note can arrive from
 * anywhere the API is reachable. Centralizing it keeps the two call sites from
 * drifting apart — a card that forgot to sanitize would be an XSS hole.
 */
import createDOMPurify from "dompurify";
import { Marked } from "marked";
import { highlight } from "sugar-high";

/**
 * A sanitizer bound to the document, resolved on first use.
 *
 * `dompurify`'s default export binds to whatever `window` exists when the module
 * is evaluated, and in a browser that is always the right one. Under a test
 * runner it is a trap: the first module to import this one decides, and a module
 * imported before the DOM is installed leaves `sanitize` undefined for every
 * later caller. Resolving at call time removes the ordering dependency.
 */
let purifier: ReturnType<typeof createDOMPurify> | null = null;

function sanitizer(): ReturnType<typeof createDOMPurify> {
  purifier ??= createDOMPurify(window);
  return purifier;
}

/**
 * Custom Marked instance with Sugar-High syntax highlighting
 */
const markdownParser = new Marked({
  async: false,
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang?.trim() || "plaintext";

      // Sugar-high generates tokenized HTML with standard `.sh__*` classes
      const highlightedHtml = highlight(text);

      return `\n<pre class="sh__code" data-language="${language}"><code>${highlightedHtml}</code></pre>`;
    },
  },
});

/**
 * Parse Markdown to secure HTML with syntax highlighting
 */
export function renderMarkdown(source: string): string {
  const rawHtml = markdownParser.parse(source) as string;
  return sanitizer().sanitize(rawHtml, {
    ADD_ATTR: ["target", "data-language"],
  });
}

/**
 * Strip Markdown down to readable words.
 *
 * Shared by the card snippet and by search, which is why it does not truncate:
 * a query has to be able to match text anywhere in the note, not only in the
 * part a card happens to show.
 */
export function stripMarkdown(source: string): string {
  return (
    source
      // Fenced code blocks, then their backticks, then inline code ticks.
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/~~~[\s\S]*?~~~/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      // Images and links collapse to their alt text or label.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Headings, quotes, list bullets and task boxes.
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s{0,3}[-*+]\s+(?:\[[ xX]\]\s*)?/gm, "")
      .replace(/^\s{0,3}\d+[.)]\s+/gm, "")
      // Horizontal rules and emphasis markers.
      .replace(/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, " ")
      .replace(/(\*\*|__|\*|_|~~)/g, "")
      // HTML tags, then the table pipes that survive the passes above.
      .replace(/<[^>]+>/g, " ")
      .replace(/\|/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * A one-line plain-text preview of a note body, for list and card views.
 *
 * Markdown syntax is stripped rather than rendered: a card wants the words, not
 * the structure, and it must not inject HTML at all.
 */
export function markdownSnippet(source: string, limit = 120): string {
  const plain = stripMarkdown(source);
  return plain.length <= limit ? plain : `${plain.slice(0, limit).trimEnd()}…`;
}

/**
 * Does a note match a search query?
 *
 * Used for the encrypted notebook, whose search can only run in the browser:
 * the server holds ciphertext and cannot index it. Matching is case-insensitive
 * and covers the whole note, not just the part a card would show.
 */
export function matchesQuery(query: string, note: { title: string; body: string }): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  return (
    note.title.toLowerCase().includes(needle) ||
    stripMarkdown(note.body).toLowerCase().includes(needle)
  );
}
