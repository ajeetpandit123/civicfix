import { createHash, createHmac } from 'node:crypto';

export interface S3Credentials {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional override for S3-compatible stores (MinIO, R2, …). */
  endpoint?: string;
}

export interface SignableRequest {
  method: 'GET' | 'PUT' | 'HEAD';
  /** Path including the bucket, e.g. `/my-bucket/uploads/a.jpg`. */
  path: string;
  /** Already-encoded query string without the leading `?`. */
  query?: string;
  headers: Record<string, string>;
  /** Payload bytes for `x-amz-content-sha256`; undefined means UNSIGNED-PAYLOAD. */
  payload?: Uint8Array;
  /**
   * Send `x-amz-content-sha256` as a signed header. S3 requires it; most other
   * AWS services do not, and adding it changes the canonical request.
   */
  contentHashHeader?: boolean;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Fixed clock, so tests can pin the AWS published example. */
  now?: Date;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256')
    .update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data)
    .digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** Derives the SigV4 signing key: date → region → service → `aws4_request`. */
export function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/** Sorts and re-encodes a query string the way the canonical request requires. */
export function canonicalQuery(query = ''): string {
  if (!query) return '';
  return query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const v = eq === -1 ? '' : pair.slice(eq + 1);
      return [decodeURIComponent(k), decodeURIComponent(v)] as const;
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Signs a request with AWS Signature Version 4 and returns the headers to send.
 * Header names must be lower-cased; all of them are signed, which is legal and
 * simpler than picking a subset.
 */
export function signAwsV4(req: SignableRequest): Record<string, string> {
  const service = req.service ?? 's3';
  const now = req.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = req.payload
    ? sha256Hex(req.payload)
    : req.method === 'GET'
      ? sha256Hex('')
      : 'UNSIGNED-PAYLOAD';

  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
    'x-amz-date': amzDate,
  };
  if (req.contentHashHeader) headers['x-amz-content-sha256'] = payloadHash;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    req.method,
    req.path,
    canonicalQuery(req.query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${req.region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const key = signingKey(req.secretAccessKey, dateStamp, req.region, service);
  const signature = createHmac('sha256', key).update(stringToSign, 'utf8').digest('hex');

  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${req.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** Resolves the HTTP endpoint for a key, honouring a custom endpoint for MinIO/R2. */
export function objectUrl(creds: S3Credentials, key: string): string {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  if (creds.endpoint) {
    const base = creds.endpoint.replace(/\/$/, '');
    return `${base}/${creds.bucket}/${encodedKey}`;
  }
  return `https://${creds.bucket}.s3.${creds.region}.amazonaws.com/${encodedKey}`;
}
