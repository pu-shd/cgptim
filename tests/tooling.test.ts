import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

let directory: string;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'cgptim-compose-test-'));
  writeFileSync(
    join(directory, 'docker'),
    '#!/bin/bash\nset -euo pipefail\nprintf "%s\\n" "$@"\nexit "${MOCK_EXIT:-0}"\n',
    { mode: 0o755 },
  );
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('Docker Compose compatibility command', () => {
  it('preserves literal arguments and invokes the Compose plugin', () => {
    const result = spawnSync(
      resolve('.github/bin/docker-compose'),
      ['run', '--rm', 'a service', 'literal;$(never-execute)'],
      { encoding: 'utf8', env: { ...process.env, PATH: `${directory}:${process.env.PATH}` } },
    );
    expect(result.status).toBe(0);
    expect(result.stdout.split('\n')).toEqual([
      'compose',
      'run',
      '--rm',
      'a service',
      'literal;$(never-execute)',
      '',
    ]);
  });
  it('propagates a failed Docker command as a failed test command', () => {
    const result = spawnSync(resolve('.github/bin/docker-compose'), ['run', 'tests'], {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, MOCK_EXIT: '19' },
    });
    expect(result.status).toBe(19);
  });
});
