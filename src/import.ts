import { Unzip, UnzipInflate, strFromU8 } from 'fflate';
import { isRecord, stamp, type Archive, type Conversation, type Message } from './model';

export const LIMITS = {
  file: 128 * 1024 ** 2,
  total: 256 * 1024 ** 2,
  entries: 10000,
  nodes: 500000,
};
function fail(message: string): never {
  throw new Error(message);
}
const string = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

function contentText(content: unknown): { text: string; attachments: string[] } {
  if (!isRecord(content)) return { text: '[Unsupported message content]', attachments: [] };
  const attachments: string[] = [];
  function part(v: unknown): string {
    if (typeof v === 'string') return v;
    if (!isRecord(v)) return '[Unsupported content part]';
    const type = string(v.content_type, 'unknown');
    const pointer = string(v.asset_pointer) || string(v.image_url);
    if (pointer) attachments.push(pointer);
    if (typeof v.text === 'string') return v.text;
    if (Array.isArray(v.parts)) return v.parts.map(part).join('\n');
    return `[${type}${pointer ? `: ${pointer}` : ': non-text content; see original export'}]`;
  }
  if (Array.isArray(content.parts))
    return { text: content.parts.map(part).join('\n\n'), attachments };
  if (typeof content.text === 'string') return { text: content.text, attachments };
  if (Array.isArray(content.thoughts)) {
    return {
      text:
        content.thoughts
          .map((t) => (isRecord(t) ? string(t.content) || string(t.summary) : part(t)))
          .join('\n\n') || '[Non-text reasoning content]',
      attachments,
    };
  }
  return {
    text: `[${string(content.content_type, 'unknown')}: non-text content; see original export]`,
    attachments,
  };
}

function normalize(raw: unknown, index: number, warnings: string[]): Conversation {
  if (!isRecord(raw)) fail(`Conversation ${index + 1} must be an object.`);
  if (!isRecord(raw.mapping) || !Object.keys(raw.mapping).length)
    fail(`Conversation ${index + 1} has no message mapping.`);
  const keys = Object.keys(raw.mapping);
  if (keys.length > LIMITS.nodes) fail('Conversation exceeds the 500,000 node limit.');
  const nodes: Record<string, Message> = Object.create(null) as Record<string, Message>;
  for (const [id, value] of Object.entries(raw.mapping)) {
    if (!isRecord(value)) fail(`Conversation ${index + 1} contains an invalid node.`);
    const m = value.message;
    if (m !== null && m !== undefined && !isRecord(m))
      fail(`Conversation ${index + 1} contains an invalid message.`);
    const msg = isRecord(m) ? m : {};
    const author = isRecord(msg.author) ? msg.author : {};
    const metadata = isRecord(msg.metadata) ? msg.metadata : {};
    const content = m ? contentText(msg.content) : { text: '', attachments: [] };
    if (Array.isArray(metadata.attachments)) {
      for (const a of metadata.attachments)
        if (isRecord(a)) content.attachments.push(string(a.name, 'Unnamed attachment'));
    }
    nodes[id] = {
      id,
      parent: typeof value.parent === 'string' ? value.parent : null,
      role: string(author.role, 'unknown'),
      text: content.text,
      attachments: [...new Set(content.attachments)],
      time: stamp(msg.create_time),
      hidden:
        metadata.is_visually_hidden_from_conversation === true ||
        (isRecord(msg.content) &&
          ['thoughts', 'reasoning_recap'].includes(string(msg.content.content_type))),
    };
  }
  // Validate each edge once. No recursive walk (long histories can exceed the JS stack).
  const done = new Set<string>();
  for (const id of keys) {
    const path = new Set<string>();
    let cursor: string | null = id;
    while (cursor && !done.has(cursor)) {
      if (path.has(cursor)) fail(`Conversation ${index + 1} has a cycle in its message tree.`);
      path.add(cursor);
      const node: Message = nodes[cursor];
      if (node.parent && !Object.hasOwn(nodes, node.parent)) {
        node.parent = null;
        warnings.push(
          `Conversation ${index + 1}: a missing parent was treated as the start of a partial history.`,
        );
      }
      cursor = node.parent;
    }
    for (const item of path) done.add(item);
  }
  const parents = new Set(Object.values(nodes).map((n) => n.parent));
  const leaves = keys.filter((id) => !parents.has(id));
  const current =
    typeof raw.current_node === 'string' && Object.hasOwn(nodes, raw.current_node)
      ? raw.current_node
      : (leaves.at(-1) ?? keys.at(-1) ?? null);
  if (current !== raw.current_node)
    warnings.push(`Conversation ${index + 1}: current branch was absent; the last leaf is shown.`);
  return {
    id: string(raw.id) || string(raw.conversation_id) || `conversation-${index + 1}`,
    title: string(raw.title, 'Untitled conversation'),
    note: string(raw.note),
    created: stamp(raw.create_time),
    updated: stamp(raw.update_time),
    current,
    nodes,
    leaves,
    archived: raw.is_archived === true,
    starred: raw.is_starred === true,
  };
}

function portable(data: Record<string, unknown>, warnings: string[]): Conversation[] {
  if (data.schemaVersion !== 1 || !Array.isArray(data.conversations))
    fail('Unsupported cgptim JSON schema. Expected schemaVersion 1.');
  return data.conversations.map((value, i) => {
    if (!isRecord(value) || !Array.isArray(value.messages) || !value.messages.length)
      fail('Portable conversation has no messages.');
    const mapping: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    let parent: string | null = null;
    for (const [j, msg] of value.messages.entries()) {
      if (!isRecord(msg) || typeof msg.text !== 'string' || typeof msg.role !== 'string')
        fail('Portable message must have text and role strings.');
      const id = `message-${j + 1}`;
      mapping[id] = {
        parent,
        message: {
          author: { role: msg.role },
          content: { parts: [msg.text] },
          create_time: msg.time,
          metadata: {
            is_visually_hidden_from_conversation: msg.hidden === true,
            attachments: Array.isArray(msg.attachments)
              ? msg.attachments
                  .filter((a): a is string => typeof a === 'string')
                  .map((name) => ({ name }))
              : [],
          },
        },
      };
      parent = id;
    }
    return normalize(
      {
        ...value,
        mapping,
        current_node: parent,
        create_time: value.created,
        update_time: value.updated,
      },
      i,
      warnings,
    );
  });
}

export function parseDocuments(
  documents: { name: string; text: string }[],
  inventory: Archive['inventory'] = [],
): Archive {
  const result: Archive = { conversations: [], related: [], inventory, warnings: [] };
  for (const doc of documents) {
    let data: unknown;
    try {
      data = JSON.parse(doc.text.replace(/^\uFEFF/, ''));
    } catch {
      fail('Invalid JSON. Choose an unmodified ChatGPT JSON export or cgptim JSON file.');
    }
    const name = doc.name.split('/').at(-1) ?? doc.name;
    if (isRecord(data) && data.format === 'cgptim') {
      result.conversations.push(...portable(data, result.warnings));
    } else if (/^conversations(?:[-_]\d+)?\.json$/i.test(name)) {
      const list = Array.isArray(data)
        ? data
        : isRecord(data) && Array.isArray(data.conversations)
          ? data.conversations
          : null;
      if (!list) fail('conversations.json must contain a conversation array.');
      if (list.length > 50000) fail('Export exceeds the 50,000 conversation limit.');
      for (const [i, item] of list.entries()) {
        try {
          result.conversations.push(normalize(item, i, result.warnings));
        } catch (error) {
          result.warnings.push(
            error instanceof Error ? error.message : 'Invalid conversation skipped.',
          );
        }
      }
    } else if (
      Array.isArray(data) &&
      data.length > 0 &&
      isRecord(data[0]) &&
      'mapping' in data[0]
    ) {
      for (const [i, item] of data.entries())
        result.conversations.push(normalize(item, i, result.warnings));
    } else if (isRecord(data) && isRecord(data.mapping)) {
      result.conversations.push(normalize(data, 0, result.warnings));
    } else {
      result.related.push({ name: doc.name, data });
    }
  }
  if (!result.conversations.length && !result.related.length)
    fail(
      'No supported JSON data found. Choose the ZIP export, conversations.json, or cgptim JSON. HTML-only exports are not supported.',
    );
  const count = result.conversations.reduce((n, c) => n + Object.keys(c.nodes).length, 0);
  if (count > LIMITS.nodes) fail('Export exceeds the 500,000 total node limit.');
  // Stable, unique UI identifiers, even when the same conversation is uploaded twice.
  const ids = new Set<string>();
  for (const c of result.conversations) {
    const original = c.id;
    let suffix = 2;
    while (ids.has(c.id)) c.id = `${original}-${suffix++}`;
    ids.add(c.id);
  }
  result.warnings = [...new Set(result.warnings)].slice(0, 100);
  if (result.conversations.some((c) => Object.values(c.nodes).some((n) => n.attachments.length)))
    result.warnings.push(
      'Media and attachment references are shown as text. Original attachment files are not embedded in downloads; attach them separately in ChatGPT.',
    );
  return result;
}

function safePath(name: string): boolean {
  return (
    !name.startsWith('/') &&
    !name.includes('\\') &&
    !name.split('/').some((p) => p === '..' || p === '.') &&
    !/^[A-Za-z]:/.test(name)
  );
}

export function readZip(bytes: Uint8Array): {
  documents: { name: string; text: string }[];
  inventory: Archive['inventory'];
} {
  const documents: { name: string; text: string }[] = [];
  const inventory: Archive['inventory'] = [];
  let expanded = 0;
  let count = 0;
  let pending = 0;
  const names = new Set<string>();
  const unzip = new Unzip((file) => {
    if (++count > LIMITS.entries) fail('ZIP exceeds the 10,000 entry limit.');
    if (!safePath(file.name)) fail('ZIP contains an unsafe file path.');
    if (names.has(file.name)) fail('ZIP contains duplicate file paths.');
    names.add(file.name);
    inventory.push({ name: file.name, bytes: file.originalSize ?? 0 });
    if (!/\.json$/i.test(file.name) || file.name.startsWith('__MACOSX/')) return;
    if ((file.originalSize ?? 0) > LIMITS.file) fail('A JSON file in the ZIP exceeds 128 MiB.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    let limitError: string | null = null;
    pending++;
    file.ondata = (err, chunk, final) => {
      if (err) fail(limitError ?? 'Cannot decompress ZIP. It may be damaged or encrypted.');
      size += chunk.length;
      expanded += chunk.length;
      if (size > LIMITS.file || expanded > LIMITS.total) {
        limitError =
          'Expanded JSON exceeds the safe memory limit (128 MiB per file / 256 MiB total).';
        fail(limitError);
      }
      chunks.push(chunk);
      if (final) {
        const data = new Uint8Array(size);
        let offset = 0;
        for (const piece of chunks) {
          data.set(piece, offset);
          offset += piece.length;
        }
        inventory[inventory.findIndex((item) => item.name === file.name)].bytes = size;
        documents.push({ name: file.name, text: strFromU8(data) });
        pending--;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    // Chunking also bounds the allocation made by an inflater for a malicious ZIP.
    for (let start = 0; start < bytes.length; start += 4096)
      unzip.push(bytes.subarray(start, start + 4096), start + 4096 >= bytes.length);
    if (pending) fail('ZIP is incomplete. Download a fresh export and try again.');
  } catch (error) {
    if (error instanceof Error && !('code' in error)) throw error;
    fail('Cannot read ZIP. Choose a complete, unencrypted ChatGPT export.');
  }
  return { documents, inventory };
}

export async function importFiles(
  files: File[],
  progress: (message: string) => void,
): Promise<Archive> {
  if (!files.length) fail('Choose at least one JSON or ZIP file.');
  if (files.length > LIMITS.entries) fail('Too many files. Choose the original ZIP instead.');
  if (files.some((f) => f.size > LIMITS.file))
    fail('A selected file exceeds 128 MiB. Extract the ZIP and choose smaller JSON files.');
  if (files.reduce((n, f) => n + f.size, 0) > LIMITS.total)
    fail('Selected files exceed the 256 MiB limit.');
  const docs: { name: string; text: string }[] = [];
  const inventory: Archive['inventory'] = [];
  let expanded = 0;
  for (const [i, file] of files.entries()) {
    progress(`Reading file ${i + 1} of ${files.length} locally…`);
    if (/\.zip$/i.test(file.name)) {
      const zip = readZip(new Uint8Array(await file.arrayBuffer()));
      for (const doc of zip.documents) expanded += new TextEncoder().encode(doc.text).length;
      docs.push(...zip.documents);
      inventory.push(...zip.inventory);
    } else {
      inventory.push({ name: file.name, bytes: file.size });
      if (/\.json$/i.test(file.name)) {
        expanded += file.size;
        docs.push({ name: file.name, text: await file.text() });
      }
    }
    if (expanded > LIMITS.total) fail('Combined expanded JSON exceeds 256 MiB.');
  }
  progress('Validating conversations and branches…');
  const archive = parseDocuments(docs, inventory);
  const skipped = inventory.filter((f) => !/\.json$/i.test(f.name) && !f.name.endsWith('/')).length;
  if (skipped)
    archive.warnings.push(
      `${skipped} non-JSON files are listed in Archive data. HTML, media, and other binaries are not executed or rendered.`,
    );
  return archive;
}
