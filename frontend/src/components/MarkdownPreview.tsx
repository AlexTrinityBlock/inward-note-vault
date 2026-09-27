import { useMemo } from "react";

import { renderMarkdown } from "../lib/markdown";

/**
 * Rendered Markdown for the reading pane.
 *
 * Both the parsing and the sanitizing live in `lib/markdown.ts`, so this
 * component and the file-card snippets cannot disagree about how a note body is
 * treated.
 */
export function MarkdownPreview({ source }: { source: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);

  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
