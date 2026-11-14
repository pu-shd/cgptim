import './style.css';
import { type Archive, type Conversation, type Message, isRecord, visibleMessages } from './model';
import {
  CONTINUE_PROMPT,
  type Slice,
  exportZip,
  filename,
  combinedMarkdown,
  wholeConversation,
  portableJson,
} from './export';
import { canCopyMarkdown } from './clipboard';
import { escape, renderMarkdown } from './render';
import { parseDocuments } from './import';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const select = (id: string) => el<HTMLSelectElement>(id);
const button = (id: string) => el<HTMLButtonElement>(id);
let archive: Archive | null = null;
let active: Conversation | null = null;
let messages: Message[] = [];
const markedConversations = new Set<string>();
let listLimit = 100;
let messageLimit = 100;
let worker: Worker | null = null;
let importTimer: ReturnType<typeof setTimeout> | null = null;
interface PreparedExport {
  text: string;
  name: string;
  type: string;
  format: string;
}
let review: PreparedExport | null = null;
let searchIndex = new Map<string, string>();

const date = (value: number | null) =>
  value === null
    ? 'Unknown date'
    : new Date(value * 1000).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
const bytes = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1024 ** 2
      ? `${(size / 1024).toFixed(1)} KiB`
      : `${(size / 1024 ** 2).toFixed(1)} MiB`;
function status(message: string) {
  el('status').textContent = message;
}
function error(message = '') {
  el('error').textContent = message;
  el('error').hidden = !message;
}
function download(data: string | Uint8Array, name: string, type: string) {
  const blob = new Blob([typeof data === 'string' ? data : new Uint8Array(data).buffer], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status(
    'Download prepared. Attach the file to a new ChatGPT conversation and use the continuation prompt.',
  );
}
function syncImportControls() {
  const loaded = archive !== null;
  const unavailable = loaded || worker !== null;
  input('files').disabled = unavailable;
  button('demo').disabled = unavailable;
  el('choose-files').setAttribute('aria-disabled', String(unavailable));
  el('dropzone').setAttribute('aria-disabled', String(unavailable));
  if (unavailable) el('dropzone').classList.remove('dragging');
  el('import-hint').textContent = loaded
    ? 'An export is open. Clear it to open another file or try the sample.'
    : worker !== null
      ? 'Reading your export…'
      : 'Drop an export ZIP, or choose one or more JSON files.';
}
function stopImport() {
  worker?.terminate();
  worker = null;
  if (importTimer) clearTimeout(importTimer);
  importTimer = null;
  button('cancel').hidden = true;
  el('dropzone').removeAttribute('aria-busy');
  syncImportControls();
}
function openFiles(files: File[]) {
  if (archive !== null || worker !== null) return;
  stopImport();
  error();
  if (!files.length) return;
  status('Opening your files locally…');
  button('cancel').hidden = false;
  el('dropzone').setAttribute('aria-busy', 'true');
  try {
    worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
    syncImportControls();
    worker.onmessage = (
      event: MessageEvent<{ type: string; message: string; archive: Archive }>,
    ) => {
      if (event.data.type === 'progress') status(event.data.message);
      else if (event.data.type === 'success') {
        stopImport();
        loadArchive(event.data.archive);
      } else {
        stopImport();
        error(event.data.message);
        status('Import failed. Choose another file or try the sample.');
      }
    };
    worker.onerror = () => {
      stopImport();
      error('The file reader stopped. Try a smaller JSON file or reload the page.');
      status('Import did not complete.');
    };
    worker.postMessage(files);
    importTimer = setTimeout(() => {
      stopImport();
      error('Import exceeded two minutes. Extract the ZIP and choose smaller JSON files.');
      status('Import timed out.');
    }, 120000);
  } catch {
    stopImport();
    error('Cannot start the local file reader. Serve the app over HTTP or HTTPS and try again.');
  }
  input('files').value = '';
}
function loadArchive(data: Archive) {
  archive = data;
  syncImportControls();
  review = null;
  el<HTMLTextAreaElement>('review-text').value = '';
  el<HTMLDialogElement>('review').close();
  active = null;
  messages = [];
  markedConversations.clear();
  listLimit = 100;
  searchIndex = new Map(
    data.conversations.map((c) => [
      c.id,
      `${c.title}\n${visibleMessages(c, c.current, false)
        .map((n) => n.text)
        .join('\n')}`.toLowerCase(),
    ]),
  );
  input('search').value = '';
  el<HTMLDetailsElement>('workspace').open = true;
  el<HTMLDetailsElement>('export-panel').open = true;
  select('export-format').value = 'md';
  el('export-status').textContent = '';
  el('review-status').textContent = '';
  button('chat-tab').click();
  el('archive-count').textContent =
    `${data.conversations.length} conversations · ${data.related.length} related data files`;
  button('clear').hidden = false;
  el('warnings').replaceChildren(
    ...data.warnings.map((w) => {
      const li = document.createElement('li');
      li.textContent = w;
      return li;
    }),
  );
  el('warning-count').textContent = `(${data.warnings.length})`;
  el('validation').hidden = !data.warnings.length;
  renderLibrary();
  renderRelatedOptions();
  const first = sortedConversations()[0];
  if (first) openConversation(first.id);
  else {
    el('empty').hidden = false;
    el('conversation-content').hidden = true;
    updateSelection();
  }
  status(
    `Opened ${data.conversations.length} conversations locally. ${data.warnings.length ? 'Review the import notes below.' : 'Your archive is ready to explore.'}`,
  );
}
function sortedConversations() {
  const query = input('search').value.toLowerCase().trim();
  return (archive?.conversations ?? [])
    .filter((c) => !query || searchIndex.get(c.id)?.includes(query))
    .sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0));
}
function renderLibrary() {
  const list = sortedConversations();
  el('results').textContent =
    `${list.length} conversations${input('search').value ? ' matching your search' : ''}`;
  el('conversation-list').innerHTML = list
    .slice(0, listLimit)
    .map(
      (c) =>
        `<div class="conversation-item ${c.id === active?.id ? 'active' : ''}"><input type="checkbox" aria-label="Select ${escape(c.title)}" data-mark="${escape(c.id)}" ${markedConversations.has(c.id) ? 'checked' : ''}><button data-open="${escape(c.id)}" ${c.id === active?.id ? 'aria-current="true"' : ''}><strong>${escape(c.title)}</strong><span>${escape(date(c.updated))}${c.starred ? ' · Starred' : ''}${c.archived ? ' · Archived' : ''}</span></button></div>`,
    )
    .join('');
  if (!list.length)
    el('conversation-list').textContent = archive
      ? 'No conversations match your search.'
      : 'Open your export to get started.';
  el('more-conversations').hidden = list.length <= listLimit;
  button('select-all').disabled = !list.length;
  button('select-none').disabled = !markedConversations.size;
  updateSelection();
}
function openConversation(id: string) {
  const c = archive?.conversations.find((c) => c.id === id);
  if (!c) return;
  active = c;
  messages = visibleMessages(c, c.current, false);
  messageLimit = 100;
  el('empty').hidden = true;
  el('conversation-content').hidden = false;
  el('conversation-title').textContent = c.title;
  el('conversation-meta').textContent =
    `Created ${date(c.created)} · Updated ${date(c.updated)} · ${messages.length} visible messages on the current path${c.leaves.length > 1 ? ` · ${c.leaves.length - 1} alternate branches omitted` : ''}`;
  renderMessages();
  renderLibrary();
}
function renderMessages() {
  el('messages').innerHTML = messages
    .slice(0, messageLimit)
    .map(
      (m, i) =>
        `<article class="message ${m.role === 'user' ? 'user' : 'assistant'}"><div class="message-author"><strong>${i + 1}. ${escape(m.role === 'user' ? 'You' : 'ChatGPT')}</strong><span class="hint">${escape(date(m.time))}</span></div><div class="prose">${renderMarkdown(m.text)}</div>${m.attachments.length ? `<p class="attachment">Attachment references · ${m.attachments.map(escape).join(', ')}<br>Original files must be attached separately.</p>` : ''}</article>`,
    )
    .join('');
  if (!messages.length)
    el('messages').textContent = 'No visible user or assistant messages on the current path.';
  for (const link of el('messages').querySelectorAll('a')) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  el('more-messages').hidden = messageLimit >= messages.length;
}
function selectedConversations(): Slice[] {
  return (archive?.conversations ?? [])
    .filter((c) => markedConversations.has(c.id))
    .map(wholeConversation);
}
function prepareExport(format = select('export-format').value): PreparedExport | null {
  const conversations = selectedConversations();
  if (!conversations.length) return null;
  const json = format === 'json';
  return {
    text: json ? portableJson(conversations) : combinedMarkdown(conversations),
    name: `${conversations.length === 1 ? filename(conversations[0].conversation.title) : 'selected-conversations'}.${json ? 'json' : 'md'}`,
    type: json ? 'application/json' : 'text/markdown;charset=utf-8',
    format,
  };
}
function updateSelection() {
  const count = markedConversations.size;
  el('selection-count').textContent = `${count} conversation${count === 1 ? '' : 's'} selected`;
  button('select-none').disabled = !count;
  button('preview').disabled = button('batch-export').disabled = !count;
  const text = combinedMarkdown(selectedConversations());
  const size = new TextEncoder().encode(text).length;
  el('export-size').textContent = count
    ? `${count} whole conversation${count === 1 ? '' : 's'} · ${bytes(size)} as Markdown. Review before sharing.`
    : 'Select at least one conversation to prepare an export.';
  button('copy-markdown').hidden = select('export-format').value !== 'md' || !canCopyMarkdown(text);
  el('clipboard-hint').hidden =
    !count || select('export-format').value !== 'md' || canCopyMarkdown(text);
  el('clipboard-hint').textContent =
    'Markdown exceeds the 32 KiB clipboard limit. Download the file instead.';
  el('export-status').textContent = '';
}
function showReview(prepared: PreparedExport) {
  review = prepared;
  el<HTMLTextAreaElement>('review-text').value = prepared.text;
  el('review-info').textContent =
    `${markedConversations.size} whole conversations · ${bytes(new TextEncoder().encode(prepared.text).length)} · ${prepared.name}`;
  button('copy-review').hidden = prepared.format !== 'md' || !canCopyMarkdown(prepared.text);
  el('review-status').textContent = '';
  if (!el<HTMLDialogElement>('review').open) el<HTMLDialogElement>('review').showModal();
}
async function copyMarkdown(prepared: PreparedExport, fromReview: boolean) {
  if (prepared.format !== 'md' || !canCopyMarkdown(prepared.text)) return;
  try {
    await navigator.clipboard.writeText(prepared.text);
    el(fromReview ? 'review-status' : 'export-status').textContent =
      'Copied Markdown to clipboard. Paste it into your new conversation.';
  } catch {
    showReview(prepared);
    el<HTMLTextAreaElement>('review-text').focus();
    el<HTMLTextAreaElement>('review-text').select();
    el('review-status').textContent =
      'Clipboard access is unavailable. The Markdown is selected; use your browser’s Copy command or download the file.';
  }
}
function renderRelatedOptions() {
  select('related-select').replaceChildren(
    ...(archive?.related ?? []).map((r, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = r.name;
      return o;
    }),
  );
  button('download-related').disabled = !archive?.related.length;
  renderRelated();
  const items = archive?.inventory ?? [];
  el('inventory').innerHTML =
    `<p class="hint">${items.length} entries. Showing up to 1,000 names; binary content is not loaded.</p><ul>${items
      .slice(0, 1000)
      .map((item) => `<li>${escape(item.name)} <span class="hint">${bytes(item.bytes)}</span></li>`)
      .join('')}</ul>`;
}
function renderRelated() {
  const item = archive?.related[Number(select('related-select').value)];
  const target = el('related-data');
  target.replaceChildren();
  if (!item) {
    target.textContent =
      'No related JSON loaded. Choose settings, user, shared conversations, library, or manifest JSON files along with your conversations.';
    return;
  }
  let remaining = 1000;
  const tree = (value: unknown, depth = 0): HTMLElement => {
    const block = document.createElement('div');
    if (--remaining < 0 || depth > 12) {
      block.textContent = 'Preview limit reached. Download this JSON to inspect the complete data.';
      return block;
    }
    if (Array.isArray(value) || isRecord(value)) {
      const entries = Object.entries(value);
      if (!entries.length) {
        block.textContent = Array.isArray(value) ? 'Empty list' : 'Empty object';
        return block;
      }
      const dl = document.createElement('dl');
      dl.className = 'data-tree';
      for (const [key, v] of entries.slice(0, 200)) {
        if (remaining < 0) break;
        const dt = document.createElement('dt');
        dt.textContent = key.replace(/_/g, ' ');
        const dd = document.createElement('dd');
        if (v !== null && typeof v === 'object') {
          const details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = `${Array.isArray(v) ? 'List' : 'Object'} · ${Object.keys(v).length} entries`;
          details.append(summary, tree(v, depth + 1));
          dd.append(details);
        } else dd.append(tree(v, depth + 1));
        dl.append(dt, dd);
      }
      block.append(dl);
      if (entries.length > 200)
        block.append(
          'Preview limited to the first 200 entries. Download the JSON for all entries.',
        );
    } else {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      block.textContent = text.length > 4000 ? `${text.slice(0, 4000)}… [preview truncated]` : text;
    }
    return block;
  };
  target.append(tree(item.data));
}

input('files').addEventListener('change', () => openFiles(Array.from(input('files').files ?? [])));
for (const event of ['dragover', 'dragenter'] as const)
  el('dropzone').addEventListener(event, (e) => {
    e.preventDefault();
    if (archive !== null || worker !== null) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      return;
    }
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    el('dropzone').classList.add('dragging');
  });
el('dropzone').addEventListener('dragleave', () => el('dropzone').classList.remove('dragging'));
el('dropzone').addEventListener('drop', (e) => {
  e.preventDefault();
  el('dropzone').classList.remove('dragging');
  openFiles(Array.from(e.dataTransfer?.files ?? []));
});
button('cancel').onclick = () => {
  stopImport();
  status('Import canceled. Choose files or try the sample.');
};
button('clear').onclick = () => {
  stopImport();
  archive = null;
  input('files').value = '';
  syncImportControls();
  active = null;
  messages = [];
  markedConversations.clear();
  searchIndex.clear();
  review = null;
  el<HTMLTextAreaElement>('review-text').value = '';
  el<HTMLDialogElement>('review').close();
  el('archive-count').textContent = 'No archive loaded';
  el('conversation-content').hidden = true;
  el('messages').replaceChildren();
  el('empty').hidden = false;
  el('conversation-title').textContent = '';
  el('conversation-meta').textContent = '';
  el('warnings').replaceChildren();
  el('validation').hidden = true;
  button('clear').hidden = true;
  el('review-status').textContent = '';
  input('search').value = '';
  select('export-format').value = 'md';
  el<HTMLDetailsElement>('workspace').open = false;
  el<HTMLDetailsElement>('export-panel').open = false;
  error();
  renderLibrary();
  renderRelatedOptions();
  status('Archive cleared from this app. Downloaded files and copied text remain on your device.');
  input('files').focus();
};
let searchTimer: ReturnType<typeof setTimeout>;
input('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    listLimit = 100;
    renderLibrary();
  }, 150);
});
el('conversation-list').addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-open]');
  if (target?.dataset.open) openConversation(target.dataset.open);
});
el('conversation-list').addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (!target.dataset.mark) return;
  if (target.checked) markedConversations.add(target.dataset.mark);
  else markedConversations.delete(target.dataset.mark);
  updateSelection();
});
button('more-conversations').onclick = () => {
  listLimit += 100;
  renderLibrary();
};
button('more-messages').onclick = () => {
  messageLimit += 100;
  renderMessages();
};
button('select-all').onclick = () => {
  for (const c of sortedConversations()) markedConversations.add(c.id);
  renderLibrary();
};
button('select-none').onclick = () => {
  markedConversations.clear();
  renderLibrary();
};
select('export-format').onchange = updateSelection;
button('preview').onclick = () => {
  const prepared = prepareExport();
  if (prepared) showReview(prepared);
};
button('close-review').onclick = () => {
  el<HTMLDialogElement>('review').close();
  review = null;
  el<HTMLTextAreaElement>('review-text').value = '';
  el('review-status').textContent = '';
};
button('download').onclick = () => {
  if (review) download(review.text, review.name, review.type);
};
button('copy-markdown').onclick = () => {
  const prepared = prepareExport('md');
  if (prepared) void copyMarkdown(prepared, false);
};
button('copy-review').onclick = () => {
  if (review) void copyMarkdown(review, true);
};
button('batch-export').onclick = () => {
  const conversations = selectedConversations();
  if (conversations.length)
    download(exportZip(conversations), 'cgptim-conversations.zip', 'application/zip');
};
select('related-select').onchange = renderRelated;
button('download-related').onclick = () => {
  const item = archive?.related[Number(select('related-select').value)];
  if (item) {
    download(
      JSON.stringify(item.data, null, 2),
      `${filename(item.name.replace(/\.json$/i, ''))}.json`,
      'application/json',
    );
    status(
      'Related JSON downloaded. Review it before sharing; it may contain account information.',
    );
  }
};
for (const id of ['chat-tab', 'data-tab']) {
  button(id).onclick = () => {
    const chat = id === 'chat-tab';
    for (const tab of ['chat-tab', 'data-tab']) {
      button(tab).setAttribute('aria-selected', String(tab === id));
      button(tab).tabIndex = tab === id ? 0 : -1;
    }
    el('chat-view').hidden = !chat;
    el('data-view').hidden = chat;
  };
  button(id).onkeydown = (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const target =
        e.key === 'Home'
          ? 'chat-tab'
          : e.key === 'End'
            ? 'data-tab'
            : id === 'chat-tab'
              ? 'data-tab'
              : 'chat-tab';
      button(target).click();
      button(target).focus();
    }
  };
}
el('continuation-prompt').textContent = CONTINUE_PROMPT;
button('copy-prompt').onclick = async () => {
  try {
    await navigator.clipboard.writeText(CONTINUE_PROMPT);
    status('Continuation prompt copied. Paste it after attaching your conversation file.');
  } catch {
    const range = document.createRange();
    range.selectNodeContents(el('continuation-prompt'));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    status(
      'Clipboard access is unavailable. The prompt is selected; use your browser’s Copy command.',
    );
  }
};
button('demo').onclick = () => {
  if (archive !== null || worker !== null) return;
  error();
  const message = (role: string, text: string, parent: string | null) => ({
    parent,
    message: {
      author: { role },
      create_time: 1781000000,
      content: { content_type: 'text', parts: [text] },
    },
  });
  loadArchive(
    parseDocuments([
      {
        name: 'conversations.json',
        text: JSON.stringify([
          {
            id: 'sample-garden',
            title: 'A small garden, a fresh start',
            create_time: 1781000000,
            update_time: 1781003600,
            current_node: 'a2',
            is_starred: true,
            mapping: {
              u1: message(
                'user',
                'I have a small balcony with morning sun. Can we plan a herb garden?',
                null,
              ),
              a1: message(
                'assistant',
                'Absolutely. Let’s start with three herbs that like morning sun:\n\n| Herb | Container | Water |\n|---|---|---|\n| Basil | 20 cm pot | Keep moist |\n| Mint | Its own pot | Water regularly |\n| Chives | 15 cm pot | When topsoil is dry |\n\nHow much room do you have?',
                'u1',
              ),
              u2: message(
                'user',
                'About a meter wide. I’d like a simple shopping list and a weekly care plan.',
                'a1',
              ),
              a2: message(
                'assistant',
                '## Your shopping list\n\n- Three pots with drainage holes and saucers\n- Potting mix\n- Basil, mint, and chive seedlings\n\n## This week\n\n1. Pot the seedlings and water well.\n2. Check the soil each morning.\n3. Rotate pots halfway through the week.\n\n**Next:** choose a layout for your one-meter space.',
                'u2',
              ),
              alternate: message(
                'assistant',
                'An alternate plan: start with basil alone and add more herbs next month.',
                'u2',
              ),
            },
          },
          {
            id: 'sample-code',
            title: 'Notes for a weekend project',
            create_time: 1780000000,
            update_time: 1780003600,
            current_node: 'a',
            mapping: {
              u: message(
                'user',
                'Help me sketch a tiny reading-list app. Keep data on my device.',
                null,
              ),
              a: message(
                'assistant',
                'We decided on a local-first app with three fields: **title**, **author**, and **status**.\n\n```ts\ntype Book = {\n  title: string;\n  author: string;\n  status: "to-read" | "reading" | "finished";\n};\n```\n\nNext step: build a form and a filterable list.',
                'u',
              ),
            },
          },
        ]),
      },
      {
        name: 'sample_settings.json',
        text: JSON.stringify({
          description: 'Fictional sample data. Your real export stays on your device.',
          theme: 'light',
          interests: ['gardening', 'weekend projects'],
        }),
      },
    ]),
  );
  status(
    'Sample archive opened. These are fictional conversations. Clear the sample before opening your own files.',
  );
};
syncImportControls();
renderLibrary();
updateSelection();
