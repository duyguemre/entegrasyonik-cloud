/**
 * exportDownloadToken (ADR-0003 adım 8, Karar F.22: "24 saat geçerli imzalı URL"). GERÇEK R2 presigned URL YOK
 * (bulgu: StorageService/S3Manager'da bu yetenek yok) — basit HMAC imzalı token; JWT_SECRET yeniden kullanılır
 * (yeni sır YOK). DB/ağ YOK.
 */
import { describe, it, expect } from '@jest/globals';
import { signExportDownloadToken, verifyExportDownloadToken } from '../../../src/operations/tenant/exportDownloadToken';

describe('signExportDownloadToken / verifyExportDownloadToken', () => {
  it('üretilen token doğrulanınca aynı key/expiresAt döner', () => {
    const payload = { key: 'exports/7/export_7_123.zip', expiresAt: Date.now() + 60000 };
    const token = signExportDownloadToken(payload);
    const verified = verifyExportDownloadToken(token);
    expect(verified).toEqual(payload);
  });

  it('süresi dolmuş token null döner (fırlatmaz)', () => {
    const payload = { key: 'exports/7/x.zip', expiresAt: Date.now() - 1000 };
    const token = signExportDownloadToken(payload);
    expect(verifyExportDownloadToken(token)).toBeNull();
  });

  it('imza kurcalanmışsa (signature değiştirilmiş) null döner', () => {
    const token = signExportDownloadToken({ key: 'a', expiresAt: Date.now() + 60000 });
    const [a, b] = token.split('.');
    expect(verifyExportDownloadToken(`${a}.${b}.deadbeef`)).toBeNull();
  });

  it('key kurcalanmışsa (encodedKey değiştirilmiş, imza artık uyuşmaz) null döner', () => {
    const token = signExportDownloadToken({ key: 'a', expiresAt: Date.now() + 60000 });
    const [, expStr, sig] = token.split('.');
    const otherKeyEncoded = Buffer.from('b', 'utf8').toString('base64url');
    expect(verifyExportDownloadToken(`${otherKeyEncoded}.${expStr}.${sig}`)).toBeNull();
  });

  it('biçimsiz/eksik token null döner, fırlatmaz', () => {
    expect(verifyExportDownloadToken('')).toBeNull();
    expect(verifyExportDownloadToken('a.b')).toBeNull();
    expect(verifyExportDownloadToken('a.b.c.d')).toBeNull();
    expect(verifyExportDownloadToken(undefined as any)).toBeNull();
  });

  it('key içinde "." karakteri olsa da (base64url kodlama sayesinde) doğru çözülür', () => {
    const payload = { key: 'exports/7/export_7_123.zip', expiresAt: Date.now() + 60000 };
    const token = signExportDownloadToken(payload);
    expect(token.split('.')).toHaveLength(3);
    expect(verifyExportDownloadToken(token)?.key).toBe(payload.key);
  });
});
