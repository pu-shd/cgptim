import { describe, expect, it } from 'vitest';
import { parseDocuments } from '../src/import';
import { combinedMarkdown, portableJson, wholeConversation } from '../src/export';

const marker = (ref: string) => `\uE200genui\uE202${JSON.stringify({ citation: { ref } })}\uE201`;
const legacy = '\uE200cite\uE202turn2view0\uE202turn2view1\uE201';
const text = `First claim ${marker('turn2view0')}\n\nSecond claim ${marker('turn2view1')}. Again ${marker('turn2view0')}`;
const references = [0, 1].map((index) => ({
  type: 'grouped_webpages',
  items: [
    {
      title: `Source ${index + 1}`,
      url: `https://example.invalid/source-${index + 1}`,
      refs: [{ turn_index: 2, ref_type: 'view', ref_index: index }],
    },
  ],
}));
export const citedConversation = (body = text, contentReferences: unknown = references) => ({
  id: 'citations',
  title: 'Fictional citation example',
  current_node: 'a',
  mapping: {
    a: {
      parent: null,
      message: {
        author: { role: 'assistant' },
        content: { content_type: 'text', parts: [body] },
        metadata: { content_references: contentReferences },
      },
    },
  },
});
const parse = (body = text, contentReferences: unknown = references) =>
  parseDocuments([
    {
      name: 'conversations.json',
      text: JSON.stringify([citedConversation(body, contentReferences)]),
    },
  ]).conversations[0];

describe('ChatGPT citation metadata and readable exports', () => {
  it('resolves genui citation markers into numbered links with source titles', () => {
    const c = parse();
    const output = combinedMarkdown([wholeConversation(c)]);
    expect(output).toContain('First claim [1](<https://example.invalid/source-1>)');
    expect(output).toContain('Second claim [2](<https://example.invalid/source-2>)');
    expect(output).toContain('Again [1](<https://example.invalid/source-1>)');
    expect(output).toContain('[1. Source 1](<https://example.invalid/source-1>)');
    expect(output.match(/1\. Source 1/g)).toHaveLength(1);
    expect(output).not.toContain('\uE200');
    expect(c.nodes.a.text).toBe(text);
  });
  it('supports legacy citations with multiple references', () => {
    const output = combinedMarkdown([wholeConversation(parse(`A claim ${legacy}`))]);
    expect(output).toContain(
      '[1](<https://example.invalid/source-1>) [2](<https://example.invalid/source-2>)',
    );
    expect(output).not.toContain('\uE200');
  });
  it('labels missing, malformed, and unsafe sources without inventing links', () => {
    const output = combinedMarkdown([
      wholeConversation(
        parse(`${marker('turn2view0')} ${marker('turn9view9')} \uE200genui\uE202{broken\uE201`, [
          {
            type: 'grouped_webpages',
            items: [
              {
                title: 'Unsafe',
                url: 'javascript:alert(1)',
                refs: [{ turn_index: 2, ref_type: 'view', ref_index: 0 }],
              },
            ],
          },
        ]),
      ),
    ]);
    expect(output).toContain('[source unavailable]');
    expect(output).toContain('[unsupported embedded content]');
    expect(output).not.toContain('javascript:');
    expect(output).not.toContain('\uE200');
  });
  it('leaves markers inside code fences, inline code, and indented code unchanged', () => {
    const body = `A claim ${marker('turn2view0')}\n\n\`\`\`python\nprint(${JSON.stringify(marker('turn2view1'))})\n\`\`\`\n\n\`${marker('turn2view1')}\`\n\n    ${marker('turn2view1')}\n`;
    const output = combinedMarkdown([wholeConversation(parse(body))]);
    expect(output).toContain(`print(${JSON.stringify(marker('turn2view1'))})`);
    expect(output).toContain(`\`${marker('turn2view1')}\``);
    expect(output).toContain(`    ${marker('turn2view1')}`);
    expect(output).toContain('A claim [1](<https://example.invalid/source-1>)');
    expect(output).not.toContain('[2. Source 2]');
  });
  it('preserves citation metadata and original message text through portable JSON', () => {
    const c = parse();
    const original = combinedMarkdown([wholeConversation(c)]);
    const json = portableJson([wholeConversation(c)]);
    const reopened = parseDocuments([{ name: 'portable.json', text: json }]).conversations[0];
    expect(reopened.nodes['message-1'].text).toBe(text);
    expect(combinedMarkdown([wholeConversation(reopened)])).toContain(
      'First claim [1](<https://example.invalid/source-1>)',
    );
    expect(combinedMarkdown([wholeConversation(reopened)])).toContain('Source 2');
    expect(original).toContain('Source 2');
  });
  it('handles older direct webpage metadata and escapes source labels', () => {
    const c = parse(marker('turn2view0'), [
      {
        type: 'webpage',
        title: '[Injected](javascript:alert(1))',
        url: 'https://example.invalid/reference',
        matched_text: '\uE200cite\uE202turn2view0\uE201',
      },
    ]);
    const output = combinedMarkdown([wholeConversation(c)]);
    expect(output).toContain('[1](<https://example.invalid/reference>)');
    expect(output).toContain('\\[Injected\\]');
  });
});
