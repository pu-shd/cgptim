import { describe, expect, it } from 'vitest';
import { Zip, ZipDeflate, strToU8, unzipSync, zipSync } from 'fflate';
import { LIMITS, importFiles, parseDocuments, readZip } from '../src/import';
import { branch, visibleMessages } from '../src/model';
import {
  combinedMarkdown,
  wholeConversation,
  exportZip,
  filename,
  markdown,
  portableJson,
} from '../src/export';

const message = (role: string, text: unknown, parent: string | null, hidden = false) => ({
  parent,
  message: {
    author: { role },
    content: { content_type: 'text', parts: [text] },
    metadata: { is_visually_hidden_from_conversation: hidden },
    create_time: 1700000000,
  },
});
export const fixture = () => ({
  id: 'test',
  title: 'Branching example',
  create_time: 1700000000,
  update_time: 1700001000,
  current_node: 'answer',
  mapping: {
    root: { parent: null, message: null },
    system: message('system', 'Internal system context', 'root', true),
    prompt: message('user', 'A question with **Markdown**', 'system'),
    answer: message('assistant', 'Chosen answer', 'prompt'),
    alternate: message('assistant', 'Alternate answer', 'prompt'),
  },
});
const parse = (value: unknown) =>
  parseDocuments([{ name: 'conversations.json', text: JSON.stringify(value) }]);

describe('ChatGPT export validation', () => {
  it('uses parent links even when children arrays are absent and mapping order differs', () => {
    const c = parse([fixture()]).conversations[0];
    expect(branch(c).map((m) => m.id)).toEqual(['system', 'prompt', 'answer']);
    expect(c.leaves).toEqual(['answer', 'alternate']);
    expect(visibleMessages(c, 'alternate', false).map((m) => m.text)).toEqual([
      'A question with **Markdown**',
      'Alternate answer',
    ]);
    expect(visibleMessages(c, c.current, true)).toHaveLength(3);
  });
  it('skips an invalid conversation and explains the cycle without losing valid data', () => {
    const broken = fixture();
    broken.mapping.prompt.parent = 'answer';
    const result = parse([broken, fixture()]);
    expect(result.conversations).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('cycle');
  });
  it('rejects an archive with only broken conversations', () => {
    expect(() => parse([{ title: 'missing mapping' }])).toThrow(/No supported JSON/);
  });
  it('handles partial histories and a missing current node with visible notes', () => {
    const partial = fixture();
    partial.mapping.prompt.parent = 'missing';
    partial.current_node = 'absent';
    const result = parse([partial]);
    expect(result.warnings.join(' ')).toMatch(/missing parent/);
    expect(result.warnings.join(' ')).toMatch(/current branch/);
    expect(result.conversations[0].current).toBe('alternate');
  });
  it('does not treat inherited properties as message nodes', () => {
    const f = fixture();
    f.mapping.prompt.parent = '__proto__';
    expect(parse([f]).warnings.join(' ')).toContain('missing parent');
  });
  it('labels multimodal parts and preserves attachment pointers', () => {
    const f = fixture();
    f.mapping.answer = message(
      'assistant',
      { content_type: 'image_asset_pointer', asset_pointer: 'file-service://image' },
      'prompt',
    );
    const c = parse([f]).conversations[0];
    expect(c.nodes.answer.text).toContain('image_asset_pointer');
    expect(c.nodes.answer.attachments).toContain('file-service://image');
  });
  it('supports renamed JSON, single conversations, duplicate IDs, and BOM', () => {
    const result = parseDocuments([
      { name: 'renamed.json', text: `\uFEFF${JSON.stringify([fixture()])}` },
      { name: 'single.json', text: JSON.stringify(fixture()) },
    ]);
    expect(result.conversations.map((c) => c.id)).toEqual(['test', 'test-2']);
  });
  it('reports malformed JSON and wrong schema instead of silently succeeding', () => {
    expect(() => parseDocuments([{ name: 'conversations.json', text: '{bad' }])).toThrow(
      /Invalid JSON/,
    );
    expect(() => parse({ nope: [] })).toThrow(/conversation array/);
    expect(() =>
      parseDocuments([{ name: 'a.json', text: '{"format":"cgptim","schemaVersion":42}' }]),
    ).toThrow(/schemaVersion/);
  });
  it('keeps unrelated JSON separate from conversations', () => {
    const result = parseDocuments([{ name: 'user_settings.json', text: '{"theme":"dark"}' }]);
    expect(result.related).toEqual([{ name: 'user_settings.json', data: { theme: 'dark' } }]);
    expect(result.conversations).toHaveLength(0);
  });
  it('rejects malformed portable message types', () => {
    expect(() =>
      parseDocuments([
        {
          name: 'slice.json',
          text: JSON.stringify({
            format: 'cgptim',
            schemaVersion: 1,
            conversations: [{ messages: [{ text: 42, role: 'user' }] }],
          }),
        },
      ]),
    ).toThrow(/text and role/);
  });
});

describe('bounded local file and ZIP reading', () => {
  it('reads nested JSON files but never reads or executes HTML/media', () => {
    const zip = zipSync({
      'export/conversations.json': strToU8(JSON.stringify([fixture()])),
      'export/index.html': strToU8('<script>throw 1</script>'),
      'export/image.png': new Uint8Array([1, 2, 3]),
    });
    const result = readZip(zip);
    expect(result.documents).toHaveLength(1);
    expect(result.inventory).toHaveLength(3);
    expect(parseDocuments(result.documents).conversations).toHaveLength(1);
  });
  it('rejects traversal and Windows paths', () => {
    for (const path of [
      '../conversations.json',
      '/conversations.json',
      'C:/conversations.json',
      'a\\conversations.json',
    ])
      expect(() => readZip(zipSync({ [path]: strToU8('[]') }))).toThrow(/unsafe/);
  });
  it('rejects damaged ZIP data', () => {
    const zip = zipSync({ 'conversations.json': strToU8(JSON.stringify([fixture()])) });
    expect(() => readZip(zip.subarray(0, 50))).toThrow();
  });
  it('enforces limits before loading files and reports progress on a successful import', async () => {
    const oversized = { size: LIMITS.file + 1, name: 'big.json' } as File;
    await expect(importFiles([oversized], () => {})).rejects.toThrow(/128 MiB/);
    const calls: string[] = [];
    const file = new File([JSON.stringify([fixture()])], 'conversations.json');
    const result = await importFiles([file], (p) => calls.push(p));
    expect(calls).toContain('Validating conversations and branches…');
    expect(result.conversations).toHaveLength(1);
    await expect(importFiles([new File(['<html>'], 'index.html')], () => {})).rejects.toThrow(
      /HTML-only/,
    );
  });
  it('limits actual decompressed bytes even if advertised size is too small', () => {
    const original = LIMITS.file;
    LIMITS.file = 100;
    try {
      const zip = zipSync({ 'data.json': strToU8('x'.repeat(1000)) });
      new DataView(zip.buffer).setUint32(22, 1, true);
      expect(() => readZip(zip)).toThrow(/memory limit|Cannot decompress/);
      const chunks: Uint8Array[] = [];
      const stream = new Zip((err, chunk) => {
        if (err) throw err;
        chunks.push(chunk);
      });
      const entry = new ZipDeflate('data.json');
      stream.add(entry);
      entry.push(strToU8('x'.repeat(1000)), true);
      stream.end();
      const streamed = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        streamed.set(chunk, offset);
        offset += chunk.length;
      }
      expect(() => readZip(streamed)).toThrow(/memory limit/);
    } finally {
      LIMITS.file = original;
    }
  });
});

describe('selective context exports', () => {
  function slice() {
    const conversation = parse([fixture()]).conversations[0];
    return {
      conversation,
      branchId: conversation.current,
      total: 2,
      note: 'Continue with implementation.',
      messages: [conversation.nodes.answer],
    };
  }
  it('exports only selected messages and explicitly labels omissions', () => {
    const md = markdown(slice());
    expect(md).toContain('Chosen answer');
    expect(md).not.toContain('A question with');
    expect(md).not.toContain('Alternate answer');
    expect(md).not.toContain('Internal system');
    expect(md).toContain('Selected 1 of 2');
    expect(md).toContain('Continue with implementation.');
  });
  it('round-trips a JSON slice without reintroducing omitted messages', () => {
    const result = parseDocuments([{ name: 'slice.json', text: portableJson([slice()]) }]);
    expect(branch(result.conversations[0]).map((m) => m.text)).toEqual(['Chosen answer']);
    expect(result.conversations[0].note).toBe('Continue with implementation.');
  });
  it('produces a ZIP with one Markdown/JSON pair per slice and safe unique names', () => {
    const item = slice();
    item.conversation.title = '../../a';
    const files = unzipSync(exportZip([item, item]));
    expect(Object.keys(files).sort()).toEqual([
      '001-a.json',
      '001-a.md',
      '002-a.json',
      '002-a.md',
      'README.txt',
    ]);
    expect(filename('💬')).toBe('conversation');
    expect(filename('x'.repeat(100))).toHaveLength(80);
  });
});

describe('whole-conversation packaging', () => {
  it('includes every visible message on the current path, regardless of preview pagination', () => {
    const conversation = parse([fixture()]).conversations[0];
    const packaged = wholeConversation(conversation);
    expect(packaged.messages.map((message) => message.id)).toEqual(['prompt', 'answer']);
    expect(packaged.total).toBe(2);
    expect(packaged.branchId).toBe('answer');
    expect(markdown(packaged)).toContain('Selected 2 of 2');
    expect(markdown(packaged)).not.toContain('Internal system context');
    expect(markdown(packaged)).not.toContain('Alternate answer');
  });
  it('combines exactly the selected conversations and preserves imported notes', () => {
    const conversation = parse([fixture()]).conversations[0];
    conversation.note = 'Keep this context.';
    const packaged = wholeConversation(conversation);
    expect(combinedMarkdown([packaged])).toBe(markdown(packaged));
    expect(combinedMarkdown([packaged])).toContain('Keep this context.');
    expect(combinedMarkdown([])).toBe('');
    expect(JSON.parse(portableJson([packaged])).conversations).toHaveLength(1);
  });
});
