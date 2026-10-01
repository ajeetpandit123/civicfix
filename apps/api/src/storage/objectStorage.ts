import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../config/env.js';

export interface ObjectStorage {
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private full(key: string): string {
    const safe = key.replace(/\\/g, '/').replace(/\.\./g, '');
    return path.join(this.root, safe);
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const dest = this.full(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.full(key));
  }
}

export function createStorage(env: Env): ObjectStorage {
  return new LocalStorage(env.STORAGE_LOCAL_DIR);
}

export function checksum(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
