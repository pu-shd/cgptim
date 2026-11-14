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

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('sample, branches, search, related data, and clear work', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample archive' }).click();
  await expect(page.locator('#conversation-title')).toHaveText('A small garden, a fresh start');
  await expect(page.locator('#messages article')).toHaveCount(4);
  await page.locator('#branch').selectOption('alternate');
  await expect(page.locator('#messages')).toContainText('An alternate plan');
  await page.getByRole('searchbox').fill('local-first');
  await expect(page.locator('[data-open]')).toHaveCount(1);
  await expect(page.locator('[data-open]')).toContainText('weekend project');
  await page.getByRole('tab', { name: 'Archive data' }).click();
  await expect(page.locator('#related-data')).toContainText('Fictional sample data');
  await page.getByRole('button', { name: 'Clear archive' }).click();
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

test('validates uploads inline and keeps the previous archive on failure', async ({ page }) => {
  await upload(page);
  await page.locator('#files').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.getByRole('alert')).toContainText('Invalid JSON');
  await expect(page.locator('#conversation-title')).toHaveText('Synthetic conversation');
  await page.getByText('Select a message range', { exact: true }).click();
  await page.locator('#range-start').fill('2');
  await page.locator('#range-end').fill('1');
  await page.getByRole('button', { name: 'Select range', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a message range');
});

test('downloads exactly selected messages as Markdown, then round-trips JSON', async ({ page }) => {
  await upload(page);
  await page.getByRole('checkbox', { name: 'Include message 1', exact: true }).uncheck();
  await page.locator('#note').fill('Continue from here.');
  await page.getByRole('button', { name: 'Review & download' }).click();
  await expect(page.locator('#review-text')).toHaveValue(/Selected 1 of 2/);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download file', exact: true }).click();
  const file = await downloaded;
  const contents = await readFile((await file.path())!, 'utf8');
  expect(contents).toContain('A **useful** answer');
  expect(contents).toContain('Continue from here.');
  expect(contents).not.toContain('A private question');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#export-format').selectOption('json');
  await page.getByRole('button', { name: 'Review & download' }).click();
  const json = await page.locator('#review-text').inputValue();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .locator('#files')
    .setInputFiles({ name: 'slice.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.locator('#messages article')).toHaveCount(1);
  await expect(page.locator('#messages')).not.toContainText('A private question');
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

test('batch exports only marked conversations and mobile layout stays inside viewport', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Try a sample archive' }).click();
  await page
    .getByRole('checkbox', { name: 'Mark A small garden, a fresh start for batch export' })
    .check();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download marked (ZIP)' }).click();
  const file = await event;
  expect(file.suggestedFilename()).toBe('cgptim-conversations.zip');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('tab navigation and empty selection provide usable feedback', async ({ page }) => {
  await upload(page);
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review & download' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Conversations', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Archive data' })).toBeFocused();
  await expect(page.locator('#data-view')).toBeVisible();
});

test('preserves message slices and notes when switching conversations and batching', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Try a sample archive' }).click();
  await page.getByRole('checkbox', { name: 'Include message 1', exact: true }).uncheck();
  await page.locator('#note').fill('Remember my garden note.');
  await page.locator('[data-open="sample-code"]').click();
  await expect(page.locator('#note')).toHaveValue('');
  await page.locator('[data-open="sample-garden"]').click();
  await expect(
    page.getByRole('checkbox', { name: 'Include message 1', exact: true }),
  ).not.toBeChecked();
  await expect(page.locator('#note')).toHaveValue('Remember my garden note.');
  await page
    .getByRole('checkbox', { name: 'Mark A small garden, a fresh start for batch export' })
    .check();
  await page.locator('[data-open="sample-code"]').click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download marked (ZIP)' }).click();
  const file = await event;
  const entries = unzipSync(await readFile((await file.path())!));
  const md = Object.entries(entries).find(([name]) => name.endsWith('.md'))!;
  const text = strFromU8(md[1]);
  expect(text).toContain('Remember my garden note.');
  expect(text).toContain('Selected 3 of 4');
  expect(text).not.toContain('I have a small balcony with morning sun. Can we plan a herb garden?');
});

test('ships production CSP and distributable license notices', async ({ page, request }) => {
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
  const response = await request.get('/licenses.txt');
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('Copyright (c) 2025 PrincetonUniversity');
});

test('last-ten selection keeps long histories bounded while exporting the actual tail', async ({
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
  await page.getByRole('button', { name: 'Last 10', exact: true }).click();
  await expect(page.locator('#messages article')).toHaveCount(100);
  await expect(page.locator('#selection-count')).toHaveText('10 of 250 messages selected');
  await page.getByRole('button', { name: 'Review & download' }).click();
  await expect(page.locator('#review-text')).toHaveValue(/Message 250/);
  await expect(page.locator('#review-text')).not.toHaveValue(/Message 240\n/);
});
