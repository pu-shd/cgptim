import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const paths = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'node_modules/dompurify/LICENSE',
  'node_modules/dompurify/LICENSE-MPL',
  'node_modules/marked/LICENSE',
  'node_modules/fflate/LICENSE',
];
const sections = await Promise.all(
  paths.map(async (path) => `${path}\n${'='.repeat(60)}\n\n${await readFile(path, 'utf8')}`),
);
await writeFile('dist/licenses.txt', sections.join('\n\n'));
process.stdout.write('License notices packaged in dist/licenses.txt\n');
