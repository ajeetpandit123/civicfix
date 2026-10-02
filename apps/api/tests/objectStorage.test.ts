import { describe, expect, it } from 'vitest';
import {
  canonicalQuery,
  objectUrl,
  sha256Hex,
  signAwsV4,
  signingKey,
} from '../src/storage/s3.js';

describe('AWS SigV4', () => {
  // Vectors from AWS's published "Signature Version 4 signing process" example.
  const creds = {
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 'iam',
    now: new Date('2015-08-30T12:36:00Z'),
  };

  it('derives the documented signing key scope', () => {
    const key = signingKey(creds.secretAccessKey, '20150830', 'us-east-1', 'iam');
    expect(key).toBeInstanceOf(Buffer);
    expect(key).toHaveLength(32);
  });

  it('matches the AWS example signature exactly', () => {
    const headers = signAwsV4({
      method: 'GET',
      path: '/',
      query: 'Action=ListUsers&Version=2010-05-08',
      headers: {
        Host: 'iam.amazonaws.com',
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      payload: Buffer.from(''),
      ...creds,
    });

    expect(headers.Authorization).toContain('Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request');
    expect(headers.Authorization).toContain('SignedHeaders=content-type;host;x-amz-date');
    expect(headers.Authorization).toContain(
      'Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7',
    );
  });

  it('signs an empty payload with its own hash', () => {
    const headers = signAwsV4({
      method: 'GET',
      path: '/bucket/key.jpg',
      headers: { Host: 'bucket.s3.us-east-1.amazonaws.com' },
      payload: Buffer.from(''),
      contentHashHeader: true,
      ...creds,
    });

    expect(headers['x-amz-content-sha256']).toBe(sha256Hex(''));
  });

  it('omits the content hash header unless asked, as non-S3 services expect', () => {
    const headers = signAwsV4({
      method: 'GET',
      path: '/',
      query: 'Action=ListUsers&Version=2010-05-08',
      headers: {
        Host: 'iam.amazonaws.com',
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      payload: Buffer.from(''),
      ...creds,
    });

    expect(headers['x-amz-content-sha256']).toBeUndefined();
  });

  it('uses UNSIGNED-PAYLOAD for streaming puts', () => {
    const headers = signAwsV4({
      method: 'PUT',
      path: '/bucket/key.jpg',
      headers: { Host: 'bucket.s3.us-east-1.amazonaws.com' },
      contentHashHeader: true,
      ...creds,
    });

    expect(headers['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD');
  });

  it('produces a different signature when the payload differs', () => {
    const build = (payload: string) =>
      signAwsV4({
        method: 'PUT',
        path: '/bucket/key.jpg',
        headers: { Host: 'bucket.s3.us-east-1.amazonaws.com' },
        payload: Buffer.from(payload),
        ...creds,
      }).Authorization;

    expect(build('one')).not.toBe(build('two'));
  });

  it('sorts and encodes the query string canonically', () => {
    expect(canonicalQuery('b=2&a=1')).toBe('a=1&b=2');
    expect(canonicalQuery('k=a b')).toBe('k=a%20b');
    expect(canonicalQuery('')).toBe('');
    expect(canonicalQuery('flag')).toBe('flag=');
  });

  it('normalises header case and trims values', () => {
    const headers = signAwsV4({
      method: 'GET',
      path: '/bucket/key.jpg',
      headers: { HOST: '  bucket.example.com  ' },
      payload: Buffer.from(''),
      ...creds,
    });

    expect(headers.host).toBe('bucket.example.com');
    expect(headers.HOST).toBeUndefined();
  });
});

describe('object URL resolution', () => {
  const creds = {
    bucket: 'bkt',
    region: 'ap-south-1',
    accessKeyId: 'id',
    secretAccessKey: 'secret',
  };

  it('uses virtual-hosted style by default', () => {
    expect(objectUrl(creds, 'uploads/a.jpg')).toBe(
      'https://bkt.s3.ap-south-1.amazonaws.com/uploads/a.jpg',
    );
  });

  it('honours a custom endpoint for S3-compatible stores', () => {
    expect(objectUrl({ ...creds, endpoint: 'http://localhost:9000/' }, 'a.jpg')).toBe(
      'http://localhost:9000/bkt/a.jpg',
    );
  });

  it('percent-encodes each path segment but keeps the slash structure', () => {
    expect(objectUrl(creds, 'uploads/a b/c#d.jpg')).toBe(
      'https://bkt.s3.ap-south-1.amazonaws.com/uploads/a%20b/c%23d.jpg',
    );
  });
});
