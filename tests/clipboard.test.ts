import { describe, expect, it } from 'vitest';
import { canCopyMarkdown, MARKDOWN_CLIPBOARD_LIMIT } from '../src/clipboard';

describe('Markdown clipboard size policy', () => {
  it('accepts a nonempty transcript up to the exact byte limit', () => {
    expect(canCopyMarkdown('')).toBe(false);
    expect(canCopyMarkdown('x'.repeat(MARKDOWN_CLIPBOARD_LIMIT))).toBe(true);
    expect(canCopyMarkdown('x'.repeat(MARKDOWN_CLIPBOARD_LIMIT + 1))).toBe(false);
  });
  it('counts UTF-8 bytes rather than characters for Unicode transcripts', () => {
    expect(canCopyMarkdown('💬'.repeat(MARKDOWN_CLIPBOARD_LIMIT / 4))).toBe(true);
    expect(canCopyMarkdown('💬'.repeat(MARKDOWN_CLIPBOARD_LIMIT / 4 + 1))).toBe(false);
  });
});
