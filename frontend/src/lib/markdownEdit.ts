/**
 * Markdown insertions for the editor toolbar.
 *
 * Kept apart from the React component so the transformations can be reasoned
 * about (and tested) as plain string operations over a selection — which is all
 * they are.
 */

export type MarkdownAction =
  | "bold"
  | "italic"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "code"
  | "list"
  | "task"
  | "link"
  | "table";

export type Edit = {
  /**
   * The range of the buffer this edit replaces. Usually the selection, but a
   * line-prefix action replaces nothing: it inserts at the start of the line,
   * which is not where the caret necessarily is, so `from` and `to` both point
   * at the insertion.
   */
  from: number;
  to: number;
  /** Text that takes the place of `[from, to)`. */
  text: string;
  /** Where to leave the selection afterwards. */
  selection: { start: number; end: number };
};

/** An edit that replaces the selection outright. */
function replace(start: number, end: number, text: string, selection: Edit["selection"]): Edit {
  return { from: start, to: end, text, selection };
}

/** Wrap the selection in `marker` on both sides, or insert it and select the gap. */
function wrap(value: string, start: number, end: number, marker: string, placeholder: string): Edit {
  const body = value.slice(start, end);
  if (body === "") {
    return replace(start, end, `${marker}${placeholder}${marker}`, {
      start: start + marker.length,
      end: start + marker.length + placeholder.length,
    });
  }
  return replace(start, end, `${marker}${body}${marker}`, {
    start: start + marker.length,
    end: start + marker.length + body.length,
  });
}

/**
 * Put `prefix` at the start of every line the selection touches.
 *
 * This is one contiguous replacement of the affected lines, from the start of
 * the caret's line to the end of the selection. It never extends past the
 * selection, so whatever follows the caret on the last line stays put.
 */
function prefixLines(value: string, start: number, end: number, prefix: string): Edit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const span = value.slice(lineStart, end);

  const prefixed = span
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");

  // The span always starts at a line start, so it covers exactly one more line
  // than it has line breaks, and every one of them gained a prefix.
  const lineCount = span.split("\n").length;
  const added = prefix.length * lineCount;
  return {
    from: lineStart,
    to: end,
    text: prefixed,
    selection: { start: start + prefix.length, end: end + added },
  };
}

/**
 * A block-level edit inserts a multi-line construct at the start of the caret's
 * line, preceded by a blank line so Markdown treats it as a block.
 */
function block(value: string, start: number, inner: string): Edit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const before = value.slice(0, lineStart);
  const leading = before === "" || before.endsWith("\n\n") ? "" : "\n";
  const text = `${leading}${inner}\n`;
  return {
    from: lineStart,
    to: lineStart,
    text,
    selection: { start: lineStart + text.length, end: lineStart + text.length },
  };
}

/** Apply a toolbar action to `value` over `[start, end)`. */
export function applyMarkdownAction(
  action: MarkdownAction,
  value: string,
  start: number,
  end: number,
): Edit {
  switch (action) {
    case "bold":
      return wrap(value, start, end, "**", "bold text");
    case "italic":
      return wrap(value, start, end, "*", "italic text");
    case "h1":
      return prefixLines(value, start, end, "# ");
    case "h2":
      return prefixLines(value, start, end, "## ");
    case "h3":
      return prefixLines(value, start, end, "### ");
    case "quote":
      return prefixLines(value, start, end, "> ");
    case "list":
      return prefixLines(value, start, end, "- ");
    case "task":
      return prefixLines(value, start, end, "- [ ] ");
    case "code": {
      const body = value.slice(start, end);
      if (body.includes("\n") || body === "") {
        return block(value, start, `\`\`\`\n${body || "code"}\n\`\`\``);
      }
      return wrap(value, start, end, "`", "code");
    }
    case "link": {
      const body = value.slice(start, end);
      const label = body === "" ? "link text" : body;
      const text = `[${label}](https://)`;
      // Select the URL so it can be typed over straight away.
      return replace(start, end, text, {
        start: start + label.length + 3,
        end: start + text.length - 1,
      });
    }
    case "table":
      return block(
        value,
        start,
        ["| Column | Column |", "| --- | --- |", "| Cell | Cell |"].join("\n"),
      );
  }
}
