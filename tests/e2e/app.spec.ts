import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';

const conversation = (text = 'A **useful** answer') => [
  {
    id: 'synthetic',
    title: 'Synthetic conversation',
    current_node: 'a',
    create_time: 1700000000,
    mapping: {
      u: {
        parent: null,
        message: { author: { role: 'user' }, content: { parts: ['A private question'] } },
      },
      a: { parent: 'u', message: { author: { role: 'assistant' }, content: { parts: [text] } } },
    },
  },
];
async function upload(page: Page, data: unknown = conversation()) {
  await page.locator('#files').setInputFiles({
    name: 'conversations.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.locator('#status')).toContainText('Opened 1 conversations');
}
async function selectSynthetic(page: Page) {
  await page.getByRole('checkbox', { name: 'Select Synthetic conversation', exact: true }).check();
}
async function fakeClipboard(page: Page, fail = false) {
  await page.evaluate((fail) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if (fail) throw new Error('Clipboard denied');
          document.documentElement.dataset.copied = text;
        },
      },
    });
  }, fail);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('page title and collapsed sections reflect the simplified initial state', async ({ page }) => {
  await expect(page).toHaveTitle('Chat Export Viewer');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chat Export Viewer');
  for (const text of [
    'CGPTIM / CHATGPT EXPORT VIEWER',
    'Your conversations, continued.',
    'Explore your archive. Take the context you need into your next chat.',
    'Bring your history with you',
  ])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  await expect(page.locator('#workspace')).not.toHaveAttribute('open');
  await expect(page.locator('#export-panel')).not.toHaveAttribute('open');
  await page.locator('#workspace > summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace')).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Try a sample archive' }).click();
  await expect(page.locator('#workspace')).toHaveAttribute('open', '');
  await expect(page.locator('#export-panel')).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('#workspace')).not.toHaveAttribute('open');
  await expect(page.locator('#export-panel')).not.toHaveAttribute('open');
});

test('sample viewer has whole-conversation selection, search, related data, and Clear', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Try a sample archive' }).click();
  await expect(page.locator('#conversation-title')).toHaveText('A small garden, a fresh start');
  await expect(page.locator('#messages article')).toHaveCount(4);
  await expect(
    page.locator('#messages input, #range-start, #range-end, #branch, #extras'),
  ).toHaveCount(0);
  await page.getByRole('searchbox').fill('local-first');
  await expect(page.locator('[data-open]')).toHaveCount(1);
  await expect(page.locator('[data-open]')).toContainText('weekend project');
  await page.getByRole('tab', { name: 'Archive data' }).click();
  await expect(page.locator('#related-data')).toContainText('Fictional sample data');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Archive cleared');
  await expect(page.locator('#related-data')).not.toContainText('Fictional sample data');
});

test('uploads ZIP in a worker and shows related settings and binary inventory', async ({
  page,
}) => {
  const zip = zipSync({
    'export/conversations.json': strToU8(JSON.stringify(conversation())),
    'export/user_settings.json': strToU8('{"theme":"light"}'),
    'export/index.html': strToU8('<script>alert(1)</script>'),
  });
  await page
    .locator('#files')
    .setInputFiles({ name: 'archive.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await expect(page.locator('#status')).toContainText('Opened 1 conversations');
  await page.getByRole('tab', { name: 'Archive data' }).click();
  await expect(page.locator('#related-data')).toContainText('light');
  await page.getByText('Files in this archive').click();
  await expect(page.locator('#inventory')).toContainText('export/index.html');
});

test('invalid imports leave all import controls available for retry', async ({ page }) => {
  await page.locator('#files').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.getByRole('alert')).toContainText('Invalid JSON');
  await expect(page.locator('#files')).toBeEnabled();
  await expect(page.locator('#demo')).toBeEnabled();
  await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
  await upload(page);
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.locator('#files')).toBeDisabled();
});

async function dropArchive(page: Page, data: unknown) {
  return page.evaluate((data) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([JSON.stringify(data)], 'conversations.json', { type: 'application/json' }),
    );
    const zone = document.getElementById('dropzone')!;
    for (const type of ['dragenter', 'dragover'])
      zone.dispatchEvent(
        new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }),
      );
    const state = { effect: transfer.dropEffect, dragging: zone.classList.contains('dragging') };
    zone.dispatchEvent(
      new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
    return state;
  }, data);
}

for (const source of ['file', 'sample']) {
  test(`a loaded ${source} locks every import route until Clear`, async ({ page }) => {
    await expect(page.locator('#files')).toBeEnabled();
    await expect(page.locator('#demo')).toBeEnabled();
    if (source === 'file') await upload(page);
    else await page.locator('#demo').click();
    const title = await page.locator('#conversation-title').textContent();
    const importStatus = await page.locator('#status').textContent();
    await expect(page.locator('#files')).toBeDisabled();
    await expect(page.locator('#demo')).toBeDisabled();
    await expect(page.locator('#choose-files')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#import-hint')).toContainText('Clear');
    await page.evaluate(() => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          document.documentElement.dataset.unexpectedWorker = 'started';
        }
      };
    });
    const replacement = conversation('Replacement answer').map((c) => ({
      ...c,
      title: 'Replacement conversation',
    }));
    // Native controls are disabled, and handlers must also reject synthetic events.
    await page.locator('#files').setInputFiles({
      name: 'conversations.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(replacement)),
    });
    await page.locator('#demo').dispatchEvent('click');
    expect(await dropArchive(page, replacement)).toEqual({ effect: 'none', dragging: false });
    await expect(page.locator('html')).not.toHaveAttribute('data-unexpected-worker');
    await expect(page.locator('#conversation-title')).toHaveText(title!);
    await expect(page.locator('#status')).toHaveText(importStatus!);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.locator('#files')).toBeEnabled();
    await expect(page.locator('#demo')).toBeEnabled();
    await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
    await dropArchive(page, replacement);
    await expect(page.locator('#conversation-title')).toHaveText('Replacement conversation');
    await expect(page.locator('#files')).toBeDisabled();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.locator('#demo').click();
    await expect(page.locator('#conversation-title')).toHaveText('A small garden, a fresh start');
  });
}

test('an import in progress blocks replacement and cancellation re-enables imports', async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(window, 'Worker', {
      value: class {
        constructor() {
          document.documentElement.dataset.workerStarts = String(
            Number(document.documentElement.dataset.workerStarts ?? 0) + 1,
          );
        }
        postMessage() {}
        terminate() {
          document.documentElement.dataset.workerStopped = 'true';
        }
      },
    });
  });
  await page.locator('#files').setInputFiles({
    name: 'conversations.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(conversation())),
  });
  await expect(page.locator('#files')).toBeDisabled();
  await expect(page.locator('#demo')).toBeDisabled();
  expect(await dropArchive(page, conversation())).toEqual({ effect: 'none', dragging: false });
  await page.locator('#demo').dispatchEvent('click');
  await expect(page.locator('html')).toHaveAttribute('data-worker-starts', '1');
  await expect(page.locator('#archive-count')).toHaveText('No archive loaded');
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-worker-stopped', 'true');
  await expect(page.locator('#files')).toBeEnabled();
  await expect(page.locator('#demo')).toBeEnabled();
  await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
});

test('exports a complete selected conversation as Markdown and round-trips JSON', async ({
  page,
}) => {
  await upload(page);
  await selectSynthetic(page);
  await page.getByRole('button', { name: 'Review & download' }).click();
  await expect(page.locator('#review-text')).toHaveValue(/Selected 2 of 2/);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download file', exact: true }).click();
  const file = await downloaded;
  const contents = await readFile((await file.path())!, 'utf8');
  expect(contents).toContain('A **useful** answer');
  expect(contents).toContain('A private question');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#export-format').selectOption('json');
  await page.getByRole('button', { name: 'Review & download' }).click();
  const json = await page.locator('#review-text').inputValue();
  await expect(page.locator('#copy-review')).toBeHidden();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.locator('#files').setInputFiles({
    name: 'conversation.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  await expect(page.locator('#messages article')).toHaveCount(2);
  await expect(page.locator('#messages')).toContainText('A private question');
});

test('blocks script execution and remote media with no archive network traffic', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== 'http://127.0.0.1:4173')
      external.push(r.url());
  });
  await upload(
    page,
    conversation(
      '<img src="https://example.com/track" onerror="window.pwned=1"><script>window.pwned=1</script>\n\n![remote](https://example.com/image.png)\n\n[bad](javascript:alert(1))\n\n<iframe src="https://example.com"></iframe>',
    ),
  );
  await expect(page.locator('#messages img, #messages script, #messages iframe')).toHaveCount(0);
  expect(await page.evaluate(() => Object.hasOwn(window, 'pwned'))).toBe(false);
  expect(external).toEqual([]);
  expect(
    await page
      .locator('#messages a')
      .evaluateAll((links) => links.some((a) => a.getAttribute('href')?.startsWith('javascript:'))),
  ).toBe(false);
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });
});

test('whole-conversation selection persists across browsing and excludes unchecked conversations', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Try a sample archive' }).click();
  await page
    .getByRole('checkbox', { name: 'Select A small garden, a fresh start', exact: true })
    .check();
  await page.locator('[data-open="sample-code"]').click();
  await expect(page.locator('#selection-count')).toHaveText('1 conversation selected');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download selected (ZIP)' }).click();
  const file = await event;
  const entries = unzipSync(await readFile((await file.path())!));
  const documents = Object.entries(entries).filter(([name]) => name.endsWith('.md'));
  expect(documents).toHaveLength(1);
  expect(strFromU8(documents[0][1])).toContain('Selected 4 of 4');
  expect(strFromU8(documents[0][1])).toContain('I have a small balcony');
  expect(strFromU8(documents[0][1])).not.toContain('An alternate plan');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('multiple selected conversations are included in a combined Markdown and portable JSON', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Try a sample archive' }).click();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(page.locator('#selection-count')).toHaveText('2 conversations selected');
  await page.getByRole('button', { name: 'Review & download' }).click();
  await expect(page.locator('#review-text')).toHaveValue(/# A small garden, a fresh start/);
  await expect(page.locator('#review-text')).toHaveValue(/# Notes for a weekend project/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#export-format').selectOption('json');
  await page.getByRole('button', { name: 'Review & download' }).click();
  const data = JSON.parse(await page.locator('#review-text').inputValue());
  expect(data.conversations).toHaveLength(2);
  expect(data.conversations.map((c: { messages: unknown[] }) => c.messages.length)).toEqual([4, 2]);
});

test('tab navigation and empty conversation selection provide usable feedback', async ({
  page,
}) => {
  await upload(page);
  await expect(page.getByRole('button', { name: 'Review & download' })).toBeDisabled();
  await expect(page.locator('#copy-markdown')).toBeHidden();
  await selectSynthetic(page);
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review & download' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Conversations', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Archive data' })).toBeFocused();
  await expect(page.locator('#data-view')).toBeVisible();
});

test('short Markdown can be copied directly and from its exact review', async ({ page }) => {
  await upload(page);
  await selectSynthetic(page);
  await fakeClipboard(page);
  await page.locator('#copy-markdown').click();
  await expect(page.locator('#export-status')).toContainText('Copied');
  const direct = await page.locator('html').getAttribute('data-copied');
  expect(direct).toContain('A private question');
  expect(direct).toContain('A **useful** answer');
  await page.getByRole('button', { name: 'Review & download' }).click();
  await page.locator('#copy-review').click();
  await expect(page.locator('#review-status')).toContainText('Copied');
  expect(await page.locator('html').getAttribute('data-copied')).toBe(
    await page.locator('#review-text').inputValue(),
  );
});

test('denied clipboard falls back to selected text and a download remains available', async ({
  page,
}) => {
  await upload(page);
  await selectSynthetic(page);
  await fakeClipboard(page, true);
  await page.locator('#copy-markdown').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#review-status')).toContainText('Clipboard access is unavailable');
  expect(
    await page
      .locator('#review-text')
      .evaluate(
        (e: HTMLTextAreaElement) => e.selectionStart === 0 && e.selectionEnd === e.value.length,
      ),
  ).toBe(true);
  await expect(page.getByRole('button', { name: 'Download file', exact: true })).toBeEnabled();
});

test('large Markdown is downloadable without offering clipboard copying', async ({ page }) => {
  await upload(page, conversation('x'.repeat(32769)));
  await selectSynthetic(page);
  await expect(page.locator('#copy-markdown')).toBeHidden();
  await expect(page.locator('#clipboard-hint')).toContainText('32 KiB');
  await page.getByRole('button', { name: 'Review & download' }).click();
  await expect(page.locator('#copy-review')).toBeHidden();
  await expect(page.locator('#download')).toBeEnabled();
});

test('whole-conversation export includes messages beyond the paginated preview', async ({
  page,
}) => {
  const mapping: Record<string, unknown> = {};
  for (let i = 0; i < 250; i++)
    mapping[`n${i}`] = {
      parent: i ? `n${i - 1}` : null,
      message: {
        author: { role: i % 2 ? 'assistant' : 'user' },
        content: { parts: [`Message ${i + 1}`] },
      },
    };
  await upload(page, [{ id: 'long', title: 'Long history', current_node: 'n249', mapping }]);
  await page.getByRole('checkbox', { name: 'Select Long history', exact: true }).check();
  await expect(page.locator('#messages article')).toHaveCount(100);
  await page.getByRole('button', { name: 'Review & download' }).click();
  await expect(page.locator('#review-text')).toHaveValue(/Selected 250 of 250/);
  await expect(page.locator('#review-text')).toHaveValue(/Message 1\n/);
  await expect(page.locator('#review-text')).toHaveValue(/Message 250/);
});

test('ships production CSP and distributable license notices', async ({ page, request }) => {
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
  await expect(page.locator('footer')).not.toContainText('Design adapted from');
  await expect(page.locator('footer').getByRole('link', { name: 'StackImages' })).toHaveCount(0);
  await expect(
    page.locator('footer').getByRole('link', { name: 'Licenses', exact: true }),
  ).toBeVisible();
  const response = await request.get('/licenses.txt');
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('Copyright (c) 2025 PrincetonUniversity');
});
