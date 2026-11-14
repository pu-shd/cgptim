export interface Citation {
  ref: string;
  title: string;
  url: string;
}
export interface Message {
  id: string;
  parent: string | null;
  role: string;
  text: string;
  time: number | null;
  hidden: boolean;
  attachments: string[];
  citations?: Citation[];
}
export interface Conversation {
  id: string;
  title: string;
  note: string;
  created: number | null;
  updated: number | null;
  current: string | null;
  nodes: Record<string, Message>;
  leaves: string[];
  archived: boolean;
  starred: boolean;
}
export interface RelatedFile {
  name: string;
  data: unknown;
}
export interface Archive {
  conversations: Conversation[];
  related: RelatedFile[];
  inventory: { name: string; bytes: number }[];
  warnings: string[];
}
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const stamp = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 8.64e12 ? v : null;

export function branch(c: Conversation, leaf = c.current): Message[] {
  const messages: Message[] = [];
  const seen = new Set<string>();
  let id = leaf;
  while (id && c.nodes[id] && !seen.has(id)) {
    seen.add(id);
    const node = c.nodes[id];
    if (node.text || node.attachments.length) messages.push(node);
    id = node.parent;
  }
  return messages.reverse();
}

export function visibleMessages(c: Conversation, leaf: string | null, extras: boolean): Message[] {
  return branch(c, leaf).filter(
    (m) => extras || (!m.hidden && ['user', 'assistant'].includes(m.role)),
  );
}
