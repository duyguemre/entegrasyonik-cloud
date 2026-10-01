/**
 * ADR-0027 §C: SigV4 presign doğruluğu — ağ YOK. (1) AWS belge test vektörü (S3 "presigned URL" örneği),
 * (2) kurulu `@smithy/signature-v4` (client-s3'ün geçişli bağımlılığı; yalnız TESTTE kullanılır) ile çapraz karşılaştırma.
 * Kimlik bilgileri AWS'nin yayımladığı ÖRNEK değerlerdir (gerçek sır değil).
 */
import { describe, it, expect } from '@jest/globals';
import { presignUrl, canonicalPath, rfc3986, amzDate } from '../../../src/services/storage/presign';

const AWS_EXAMPLE = { accessKeyId: 'AKIA' + 'IOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' };

describe('presignUrl — AWS belge test vektörü', () => {
  it('GET examplebucket/test.txt, us-east-1, 20130524T000000Z, 86400 sn → belgelenen imza', () => {
    const r = presignUrl({
      method: 'GET', endpoint: 'https://examplebucket.s3.amazonaws.com', key: 'test.txt', region: 'us-east-1',
      ...AWS_EXAMPLE, expiresInSec: 86400, now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(r.url).toContain('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
    expect(r.url).toContain('X-Amz-Credential=AKIA' + 'IOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request');
    expect(r.url.startsWith('https://examplebucket.s3.amazonaws.com/test.txt?')).toBe(true);
    expect(r.expiresAt).toBe('2013-05-25T00:00:00.000Z');
  });
});

describe('presignUrl — @smithy/signature-v4 ile çapraz doğrulama (PUT + imzalı content-type/length)', () => {
  let SignatureV4: any; let Hash: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SignatureV4 = require('@smithy/signature-v4').SignatureV4;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Hash = require('@smithy/hash-node').Hash;
  } catch { /* geçişli paket yoksa bu blok atlanır */ }
  const maybe = SignatureV4 && Hash ? it : it.skip;

  maybe('R2 yol-stili PUT: imza ve imzalı başlık listesi SDK imzalayıcısıyla birebir aynı', async () => {
    const now = new Date('2026-09-30T12:34:56Z');
    const key = 'uploads/42/0123456789abcdef0123456789abcdef';
    const mine = presignUrl({
      method: 'PUT', endpoint: 'https://acct.r2.cloudflarestorage.com', bucket: 'img-bucket', key, region: 'auto',
      ...AWS_EXAMPLE, expiresInSec: 300, now, signedHeaders: { 'Content-Type': 'image/webp', 'Content-Length': 12345 },
    });
    const signer = new SignatureV4({ credentials: AWS_EXAMPLE, region: 'auto', service: 's3', sha256: Hash.bind(null, 'sha256'), uriEscapePath: false });
    const out = await signer.presign({
      method: 'PUT', protocol: 'https:', hostname: 'acct.r2.cloudflarestorage.com', path: `/img-bucket/${key}`, query: {},
      headers: { host: 'acct.r2.cloudflarestorage.com', 'content-type': 'image/webp', 'content-length': '12345', 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
    }, { signingDate: now, expiresIn: 300, unhoistableHeaders: new Set(['x-amz-content-sha256']), unsignableHeaders: new Set(['x-amz-content-sha256']) });
    const u = new URL(mine.url);
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(out.query['X-Amz-SignedHeaders']).toBe('content-length;content-type;host');
    expect(u.searchParams.get('X-Amz-Signature')).toBe(out.query['X-Amz-Signature']);
    expect(u.pathname).toBe(`/img-bucket/${key}`);
    // İstemciye dönen başlıklar: content-type evet, content-length HAYIR (tarayıcı gövdeden kendisi koyar).
    expect(mine.headers).toEqual({ 'Content-Type': 'image/webp' });
  });
});

describe('presign yardımcıları', () => {
  it('rfc3986 !\'()* karakterlerini de kodlar; canonicalPath / korur', () => {
    expect(rfc3986("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af');
    expect(canonicalPath('/b/k y/ü.jpg')).toBe('/b/k%20y/%C3%BC.jpg');
    expect(amzDate(new Date('2026-01-02T03:04:05.678Z'))).toBe('20260102T030405Z');
  });

  it('geçersiz TTL ve yollu endpoint reddedilir', () => {
    const base = { method: 'PUT' as const, endpoint: 'https://a.r2.cloudflarestorage.com', bucket: 'b', key: 'k', region: 'auto', ...AWS_EXAMPLE };
    expect(() => presignUrl({ ...base, expiresInSec: 0 })).toThrow();
    expect(() => presignUrl({ ...base, expiresInSec: 604801 })).toThrow();
    expect(() => presignUrl({ ...base, endpoint: 'https://a.r2.cloudflarestorage.com/x', expiresInSec: 60 })).toThrow();
  });
});
