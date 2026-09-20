import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

/** Render Markdown, sanitized, for the right-hand preview pane. */
export function MarkdownPreview({ source }: { source: string }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(source, { async: false }) as string),
    [source],
  );

  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
