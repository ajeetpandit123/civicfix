import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { envFileCandidates, loadEnvFileInto } from '../src/config/dotenv.js';

const dirs: string[] = [];

function scratchEnvFile(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'civicfix-env-'));
  dirs.push(dir);
  const file = path.join(dir, '.env');
  writeFileSync(file, contents, 'utf8');
  return file;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('.env bootstrap', () => {
  it('populates a target from a .env file', () => {
    const file = scratchEnvFile('SOME_KEY=hello\nOTHER=world\n');
    const target: NodeJS.ProcessEnv = {};

    loadEnvFileInto(target, file);

    expect(target.SOME_KEY).toBe('hello');
    expect(target.OTHER).toBe('world');
  });

  it('never overwrites a value already in the environment', () => {
    const file = scratchEnvFile('SOME_KEY=fromfile\n');
    const target: NodeJS.ProcessEnv = { SOME_KEY: 'fromrealenv' };

    loadEnvFileInto(target, file);

    expect(target.SOME_KEY).toBe('fromrealenv');
  });

  it('survives a corrupt comment line and CRLF endings', () => {
    const file = scratchEnvFile('so # Application\r\nGOOD=yes\r\n');
    const target: NodeJS.ProcessEnv = {};

    loadEnvFileInto(target, file);

    expect(target.GOOD).toBe('yes');
  });

  it('strips the quote wrapper dotenv style values carry', () => {
    const file = scratchEnvFile('QUOTED="with spaces"\n');
    const target: NodeJS.ProcessEnv = {};

    loadEnvFileInto(target, file);

    expect(target.QUOTED).toBe('with spaces');
  });

  it('treats a missing file as no-op rather than throwing', () => {
    const target: NodeJS.ProcessEnv = {};

    expect(() => loadEnvFileInto(target, path.join(tmpdir(), 'definitely-missing.env'))).not.toThrow();
    expect(Object.keys(target)).toHaveLength(0);
  });

  it('looks for both the repo root and the api package .env', () => {
    const candidates = envFileCandidates('/repo');

    expect(candidates[0]).toBe(path.resolve('/repo', '.env'));
    expect(candidates[1]).toBe(path.resolve('/repo', 'apps', 'api', '.env'));
  });
});
