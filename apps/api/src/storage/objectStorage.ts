import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../config/env.js';
import { objectUrl, signAwsV4, type S3Credentials } from './s3.js';

export interface ObjectStorage {
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

/** Strips traversal segments so a key can never escape its root or bucket. */
export function sanitizeKey(key: string): string {
  return key.replace(/\\/g, '/').replace(/\.\./g, '');
}

class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private full(key: string): string {
    return path.join(this.root, sanitizeKey(key));
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

/** S3-compatible object storage (AWS S3, MinIO, R2) over signed REST calls. */
class S3Storage implements ObjectStorage {
  constructor(private readonly creds: S3Credentials) {}

  private requestParts(key: string): URL {
    return new URL(objectUrl(this.creds, sanitizeKey(key)));
  }

  async put(key: string, bytes: Buffer, mimeType: string): Promise<void> {
    const url = this.requestParts(key);
    const headers = signAwsV4({
      method: 'PUT',
      path: url.pathname,
      query: url.search.slice(1),
      headers: { host: url.host, 'content-type': mimeType },
      payload: bytes,
      contentHashHeader: true,
      region: this.creds.region,
      service: 's3',
      accessKeyId: this.creds.accessKeyId,
      secretAccessKey: this.creds.secretAccessKey,
    });
    const res = await fetch(url, { method: 'PUT', headers, body: new Uint8Array(bytes) });
    if (!res.ok) throw new Error(`s3_put_failed: ${res.status}`);
  }

  async get(key: string): Promise<Buffer> {
    const url = this.requestParts(key);
    const headers = signAwsV4({
      method: 'GET',
      path: url.pathname,
      query: url.search.slice(1),
      headers: { host: url.host },
      payload: Buffer.from(''),
      contentHashHeader: true,
      region: this.creds.region,
      service: 's3',
      accessKeyId: this.creds.accessKeyId,
      secretAccessKey: this.creds.secretAccessKey,
    });
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(`s3_get_failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Resolves the HTTP endpoint for a key, honouring a custom endpoint for MinIO/R2. */
export function objectUrlFor(creds: S3Credentials, key: string): string {
  return objectUrl(creds, key);
}

export function createStorage(env: Env): ObjectStorage {
  if (env.STORAGE_DRIVER === 's3') {
    const { S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
    if (!S3_BUCKET || !S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
      throw new Error(
        'STORAGE_DRIVER=s3 requires S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
      );
    }
    return new S3Storage({
      bucket: S3_BUCKET,
      region: S3_REGION,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      endpoint: env.S3_ENDPOINT,
    });
  }
  return new LocalStorage(env.STORAGE_LOCAL_DIR);
}

export function checksum(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
