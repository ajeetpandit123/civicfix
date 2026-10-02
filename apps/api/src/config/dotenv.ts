import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'dotenv';

/**
 * Merges a .env file into `target` without overwriting values already present,
 * so real process environment always wins over the file.
 * A missing file is not an error: required variables may come from the real env.
 */
export function loadEnvFileInto(target: NodeJS.ProcessEnv, filePath: string): void {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(parse(raw))) {
    if (target[key] === undefined) target[key] = value;
  }
}

/** Candidate .env locations, most specific first. */
export function envFileCandidates(cwd = process.cwd()): string[] {
  return [path.resolve(cwd, '.env'), path.resolve(cwd, 'apps', 'api', '.env')];
}

export function loadDotEnv(target: NodeJS.ProcessEnv = process.env): void {
  for (const candidate of envFileCandidates()) {
    loadEnvFileInto(target, candidate);
  }
}
