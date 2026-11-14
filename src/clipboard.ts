// A conservative UX limit, independent of any model's context window.
export const MARKDOWN_CLIPBOARD_LIMIT = 32 * 1024;

export function canCopyMarkdown(text: string): boolean {
  return text.length > 0 && new TextEncoder().encode(text).length <= MARKDOWN_CLIPBOARD_LIMIT;
}
