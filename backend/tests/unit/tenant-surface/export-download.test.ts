import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Readable, Writable } from 'stream';
import fs from 'fs';
import path from 'path';

// N4 / API_TENANT_SURFACE §5: KVKK dışa aktarma indirme rotası. DB/Redis/ağ/R2 YOK: depolama sahte, sunucu BAŞLATILMAZ
// (route handler'ı sahte Express app/res ile çağrılır).

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(), PutObjectCommand: jest.fn(), DeleteObjectCommand: jest.fn(), CopyObjectCommand: jest.fn(), ListObjectsV2Command: jest.fn(), GetObjectCommand: jest.fn(),
}));
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));

import { signExportDownloadToken } from '../../../src/operations/tenant/exportDownloadToken';
import { parseExportArchiveKey } from '../../../src/operations/tenant/exportKey';
import { prepareExportDownload, ConsumedTokenStore } from '../../../src/operations/tenant/exportDownload';
import { configureExportDownloadRoutes, EXPORT_DOWNLOAD_ROUTE } from '../../../src/api/ExportDownloadApiManager';
import { storageService } from '../../../src/services/storage/StorageService';
import S3Manager from '../../../src/services/storage/S3Manager';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const TS = 1790000000000;
const keyFor = (tenant: number) => `exports/${tenant}/export_${tenant}_${TS}.zip`;
const tokenFor = (tenant: number, over: Partial<{ key: string; expiresAt: number }> = {}) =>
  signExportDownloadToken({ key: over.key ?? keyFor(tenant), expiresAt: over.expiresAt ?? NOW.getTime() + 3600_000 });

let audits: any[];
let opened: string[];
let removed: string[];
let openImpl: (cid: string, key: string) => Promise<any>;
let removeImpl: (cid: string, key: string) => Promise<boolean>;
let consumed: ConsumedTokenStore;

const deps = () => ({
  storage: { open: async (c: string, k: string) => { opened.push(`${c}|${k}`); return openImpl(c, k); }, remove: async (c: string, k: string) => { removed.push(`${c}|${k}`); return removeImpl(c, k); } },
  audit: (e: any) => { audits.push(e); },
  consumed, now: () => NOW,
});
const stream = (chunks: string[] = ['PK-zip-bytes']) => Readable.from(chunks.map((c) => Buffer.from(c)));

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  audits = []; opened = []; removed = [];
  consumed = new ConsumedTokenStore();
  openImpl = async () => ({ body: stream(), contentLength: 12 });
  removeImpl = async () => true;
});
afterEach(() => { jest.restoreAllMocks(); });

const input = (over: any = {}) => ({ token: tokenFor(4), order: 4, sub: 'owner-1', ip: '203.0.113.5', isOwner: true, ...over });

describe('parseExportArchiveKey', () => {
  it('yalnızca exports/<N>/export_<N>_<ts>.zip (N aynı) kabul edilir', () => {
    expect(parseExportArchiveKey(keyFor(4))).toEqual({ clientId: '4', directory: 'exports/4', fileName: `export_4_${TS}` });
    for (const bad of ['exports/4/export_5_1790000000000.zip', 'exports/4/../5/export_5_1790000000000.zip', '../exports/4/export_4_1790000000000.zip', 'exports/4/export_4_1790000000000.zip/../x',
      'exports/4/export_4_1790000000000.json', 'exports//export__1.zip', 'products/4/x.zip', 'exports/4/export_4_1.zip', '', 'exports/4/export_4_1790000000000.zip\n', 5, null, undefined, {}, 'exports/44/export_4_1790000000000.zip']) {
      expect([String(bad), parseExportArchiveKey(bad as any)]).toEqual([String(bad), null]);
    }
  });
});

describe('prepareExportDownload', () => {
  it('geçerli token + owner + kendi tenant\'ı: akış açılır; tam aktarımdan sonra denetim ok + arşiv SİLİNİR', async () => {
    const r = await prepareExportDownload(input(), deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(opened).toEqual([`4|${keyFor(4)}`]);
    expect(r.contentLength).toBe(12);
    expect(r.filename).toBe('entegrasyonik-veri-disa-aktarma-4-20260928.zip');
    expect(audits).toEqual([]); // henüz aktarım bitmedi
    await r.complete();
    expect(audits).toEqual([{ event: 'tenant.export.download', result: 'ok', sub: 'owner-1', tid: 4, ip: '203.0.113.5', meta: undefined }]);
    expect(removed).toEqual([`4|${keyFor(4)}`]);
  });

  it('TEK KULLANIM: aynı token ikinci kez 410 (arşiv tekrar açılmaz); tamamlanmadan da (kullanımda) reddedilir', async () => {
    const t = tokenFor(4);
    const first = await prepareExportDownload(input({ token: t }), deps());
    expect(first.ok).toBe(true);
    const second = await prepareExportDownload(input({ token: t }), deps());
    expect(second).toMatchObject({ ok: false, status: 410 });
    expect(opened).toHaveLength(1);
    expect(audits[audits.length - 1]).toMatchObject({ result: 'fail', meta: { reason: 'already_used' } });
  });

  it('eşzamanlı iki istek: yalnızca biri kazanır', async () => {
    const t = tokenFor(4);
    const [a, b] = await Promise.all([prepareExportDownload(input({ token: t }), deps()), prepareExportDownload(input({ token: t }), deps())]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(opened).toHaveLength(1);
  });

  it('aktarım yarıda kesilirse (abort) talep serbest kalır: yeniden denenebilir; dosya silinmez', async () => {
    const t = tokenFor(4);
    const first = await prepareExportDownload(input({ token: t }), deps());
    if (!first.ok) throw new Error('beklenmedik');
    first.abort();
    expect(removed).toEqual([]);
    expect(audits[audits.length - 1]).toMatchObject({ result: 'error', meta: { reason: 'aborted' } });
    expect((await prepareExportDownload(input({ token: t }), deps())).ok).toBe(true);
    // abort sonrası complete no-op (çifte kayıt yok)
    await first.complete();
    expect(removed).toEqual([]);
  });

  it('TENANT BAĞI: tenant 7\'nin (geçerli imzalı) token\'ı tenant 4 oturumuyla 403; depolamaya HİÇ dokunulmaz; denetim fail', async () => {
    const r = await prepareExportDownload(input({ token: tokenFor(7) }), deps());
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(opened).toEqual([]);
    expect(audits).toEqual([{ event: 'tenant.export.download', result: 'fail', sub: 'owner-1', tid: 4, ip: '203.0.113.5', meta: { reason: 'tenant_mismatch' } }]);
    expect(JSON.stringify(audits)).not.toContain(keyFor(7)); // token/anahtar denetime yazılmaz
  });

  it('imzalı ama biçimi bozuk/yol gezinmeli anahtar 403 (imza tek başına yetmez)', async () => {
    for (const key of ['exports/4/../7/export_7_1790000000000.zip', 'exports/4/export_4_1790000000000.zip/../../x', 'other/4/export_4_1790000000000.zip']) {
      expect(await prepareExportDownload(input({ token: tokenFor(4, { key }) }), deps())).toMatchObject({ ok: false, status: 403 });
    }
    expect(opened).toEqual([]);
  });

  it('owner değilse 403 (token bile doğrulanmadan); süresi dolmuş/kurcalanmış/eksik/aşırı uzun token 400', async () => {
    expect(await prepareExportDownload(input({ isOwner: false }), deps())).toMatchObject({ ok: false, status: 403 });
    expect(audits[0].meta).toEqual({ reason: 'not_owner' });
    for (const token of [tokenFor(4, { expiresAt: NOW.getTime() - 1 }), tokenFor(4) + 'x', 'a.b.c', '', undefined, null, 5, {}, 'x'.repeat(3000)]) {
      expect([String(token).slice(0, 12), (await prepareExportDownload(input({ token }), deps())).ok]).toEqual([String(token).slice(0, 12), false]);
    }
    expect((await prepareExportDownload(input({ token: tokenFor(4, { expiresAt: NOW.getTime() - 1 }) }), deps()))).toMatchObject({ status: 400 });
    expect(opened).toEqual([]);
  });

  it('tenant kimliği yoksa 400; süper yönetici (owner değil) 403', async () => {
    expect(await prepareExportDownload(input({ order: undefined }), deps())).toMatchObject({ ok: false, status: 400 });
    expect(await prepareExportDownload(input({ order: 'abc' }), deps())).toMatchObject({ ok: false, status: 400 });
  });

  it('arşiv yoksa (silinmiş/süresi dolmuş) 410; depolama hatasında 500 ve talep serbest bırakılır', async () => {
    openImpl = async () => null;
    expect(await prepareExportDownload(input(), deps())).toMatchObject({ ok: false, status: 410 });
    openImpl = async () => { throw Object.assign(new Error('boom SECRET-DETAIL'), { name: 'InternalError' }); };
    const t = tokenFor(4, { expiresAt: NOW.getTime() + 7200_000 });
    const r = await prepareExportDownload(input({ token: t }), deps());
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(JSON.stringify(r)).not.toContain('SECRET-DETAIL');
    openImpl = async () => ({ body: stream(), contentLength: 1 });
    expect((await prepareExportDownload(input({ token: t }), deps())).ok).toBe(true); // 500 sonrası yeniden denenebilir
  });
});

describe('ConsumedTokenStore', () => {
  it('süresi dolan kayıtlar temizlenir; üst sınır aşılmaz', () => {
    const s = new ConsumedTokenStore(3);
    expect(s.claim('a', 100, 0)).toBe(true);
    expect(s.claim('a', 100, 50)).toBe(false);
    expect(s.claim('a', 300, 150)).toBe(true); // 100 < 150: süresi dolmuş kayıt yeniden alınabilir
    for (const t of ['b', 'c', 'd', 'e']) s.claim(t, 10_000, 200);
    expect(s.size).toBeLessThanOrEqual(3);
  });
});

// ---- route katmanı (sahte app/res) -------------------------------------------------------------------------------
class FakeRes extends Writable {
  locals: any; statusCode = 200; headers: Record<string, string> = {}; body: any; headersSent = false; chunks: Buffer[] = [];
  constructor(locals: any) { super(); this.locals = locals; }
  status(c: number) { this.statusCode = c; return this; }
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }
  send(b: any) { this.body = b; this.headersSent = true; this.emit('finish'); return this; }
  _write(chunk: any, _e: any, cb: () => void) { this.headersSent = true; this.chunks.push(Buffer.from(chunk)); cb(); }
}
const OWNER = { userContext: { order: 4, roleCode: 'ROLE_OWNER', owner: true }, principal: { sub: 'owner-1', tid: 4, ga: false } };
const ADMIN = { userContext: { order: 4, roleCode: 'ROLE_ADMIN', owner: false }, principal: { sub: 'admin-1', tid: 4, ga: false } };
const GA = { userContext: { order: 4, roleCode: 'ROLE_ADMIN', isGlobalAdmin: true }, principal: { sub: 'ga', tid: 4, ga: true } };

async function call(locals: any, query: any, d = deps()) {
  const routes: Record<string, (...a: any[]) => any> = {};
  const app: any = { get: (p: string, ...h: any[]) => { routes[p] = h[h.length - 1]; routes[p + '#limiter'] = h[0]; } };
  configureExportDownloadRoutes(app, '/api', d as any);
  const handler = routes['/api' + EXPORT_DOWNLOAD_ROUTE];
  const res = new FakeRes(locals);
  const req: any = { query, headers: {}, socket: { remoteAddress: '198.51.100.7' } };
  await handler(req, res);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return { res, routes };
}

describe('GET /api/tenant-data/export/download (route)', () => {
  it('owner: 200, zip başlıkları (no-store, nosniff, attachment), içerik AKIŞLA gelir, sonra arşiv silinir + audit ok', async () => {
    const { res } = await call(OWNER, { token: tokenFor(4) });
    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject({ 'content-type': 'application/zip', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-length': '12' });
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="entegrasyonik-veri-disa-aktarma-4-\d{8}\.zip"$/);
    expect(Buffer.concat(res.chunks).toString()).toBe('PK-zip-bytes');
    await new Promise((r) => setImmediate(r));
    expect(removed).toEqual([`4|${keyFor(4)}`]);
    expect(audits.map((a) => a.result)).toEqual(['ok']);
  });

  it('kimliksiz (principal yok) 401; admin/süper yönetici 403 (owner değil); tenant\'sız 400', async () => {
    expect((await call({}, { token: tokenFor(4) })).res.statusCode).toBe(401);
    expect((await call(ADMIN, { token: tokenFor(4) })).res.statusCode).toBe(403);
    expect((await call(GA, { token: tokenFor(4) })).res.statusCode).toBe(403);
    expect((await call({ ...OWNER, userContext: { ...OWNER.userContext, order: undefined } }, { token: tokenFor(4) })).res.statusCode).toBe(400);
    expect(opened).toEqual([]);
  });

  it('başka tenant\'ın token\'ı 403; token yok/dizi (query polluting) 400; hata gövdesi token/anahtar içermez', async () => {
    const t7 = tokenFor(7);
    const r1 = await call(OWNER, { token: t7 });
    expect(r1.res.statusCode).toBe(403);
    expect(JSON.stringify(r1.res.body)).not.toContain(t7);
    expect((await call(OWNER, {})).res.statusCode).toBe(400);
    expect((await call(OWNER, { token: [tokenFor(4), tokenFor(4)] })).res.statusCode).toBe(400);
    expect((await call(OWNER, { token: { a: 1 } })).res.statusCode).toBe(400);
  });

  it('ikinci indirme 410; kaynak akış hatasında istemci yarım dosya ile bırakılmaz (abort) ve token yeniden denenebilir', async () => {
    const t = tokenFor(4);
    const d = deps();
    expect((await call(OWNER, { token: t }, d)).res.statusCode).toBe(200);
    expect((await call(OWNER, { token: t }, d)).res.statusCode).toBe(410);

    const t2 = tokenFor(4, { expiresAt: NOW.getTime() + 5000_000 });
    openImpl = async () => ({ body: new Readable({ read() { this.destroy(new Error('r2 koptu')); } }), contentLength: 5 });
    const bad = await call(OWNER, { token: t2 }, d);
    expect(bad.res.statusCode).toBe(500);
    expect(removed).toHaveLength(1); // yalnızca ilk başarılı indirme sildi
    openImpl = async () => ({ body: stream(), contentLength: 12 });
    expect((await call(OWNER, { token: t2 }, d)).res.statusCode).toBe(200);
  });

  it('rota IP başına oran sınırlıdır ve jenerik RPC/açık rota listesinde DEĞİLDİR', async () => {
    const { routes } = await call(OWNER, { token: tokenFor(4) });
    expect(typeof routes['/api' + EXPORT_DOWNLOAD_ROUTE + '#limiter']).toBe('function');
    const auth = fs.readFileSync(path.join(__dirname, '../../../src/api/authenticate.ts'), 'utf8');
    expect(auth).not.toContain('tenant-data');
  });

  it('Webserver: indirme rotası authenticate middleware\'inden SONRA bağlanır (oturum zorunlu)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../src/Webserver.ts'), 'utf8');
    const iAuth = src.indexOf('createAuthenticateMiddleware(config.context)');
    const iRoute = src.indexOf('configureExportDownloadRoutes(this.app, config.context)');
    expect(iAuth).toBeGreaterThan(-1);
    expect(iRoute).toBeGreaterThan(iAuth);
  });
});

// ---- depolama katmanı ---------------------------------------------------------------------------------------------
describe('StorageService.openExportArchive / deleteExportArchive: anahtar+tenant doğrulaması, S3 mock', () => {
  const ARCHIVE = { accessKeyId: 'k', secretAccessKey: 's', bucketName: 'arc-bucket', endpoint: 'https://arc.invalid' };
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    storageService.initialize({ getStorageConfig: jest.fn(async () => ARCHIVE), saveNotification: jest.fn() } as any);
  });

  it('geçerli anahtar/tenant: S3Manager.getObject archive config ile çağrılır', async () => {
    const spy = jest.spyOn(S3Manager, 'getObject').mockResolvedValue({ body: 'B', contentLength: 3 });
    expect(await storageService.openExportArchive('4', keyFor(4))).toEqual({ body: 'B', contentLength: 3 });
    expect(spy).toHaveBeenCalledWith(ARCHIVE, keyFor(4));
  });

  it('başka tenant\'ın anahtarı / biçim dışı anahtar: R2\'ye HİÇ dokunulmaz', async () => {
    const get = jest.spyOn(S3Manager, 'getObject').mockResolvedValue({ body: 'B' });
    const del = jest.spyOn(S3Manager, 'delete').mockResolvedValue({});
    expect(await storageService.openExportArchive('4', keyFor(7))).toBeNull();
    expect(await storageService.openExportArchive('4', 'exports/4/../7/x.zip')).toBeNull();
    expect(await storageService.deleteExportArchive('4', keyFor(7))).toBe(false);
    expect(await storageService.deleteExportArchive('4', 'products/4/a.zip')).toBe(false);
    expect(get).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('deleteExportArchive: dizin/dosya adı ayrıştırılıp S3Manager.delete ile silinir; hata => false', async () => {
    const del = jest.spyOn(S3Manager, 'delete').mockResolvedValue({});
    expect(await storageService.deleteExportArchive('4', keyFor(4))).toBe(true);
    expect(del).toHaveBeenCalledWith(ARCHIVE, { directory: 'exports/4', fileName: `export_4_${TS}`, fileExtension: 'zip' });
    del.mockResolvedValue({ result: false, error: 'x' });
    expect(await storageService.deleteExportArchive('4', keyFor(4))).toBe(false);
  });
});

describe('S3Manager.getObject', () => {
  const { S3Client } = require('@aws-sdk/client-s3');
  const cfg: any = { accessKeyId: 'k', secretAccessKey: 's', bucketName: 'b', endpoint: 'https://e.invalid' };
  it('gövde + uzunluk döner; NoSuchKey/404 => null; diğer hatalar fırlatılır', async () => {
    const send = jest.fn<any>();
    (S3Client as jest.Mock).mockImplementation(() => ({ send }));
    send.mockResolvedValueOnce({ Body: 'STREAM', ContentLength: 9 });
    expect(await S3Manager.getObject(cfg, 'k')).toEqual({ body: 'STREAM', contentLength: 9 });
    send.mockRejectedValueOnce(Object.assign(new Error('nk'), { name: 'NoSuchKey' }));
    expect(await S3Manager.getObject(cfg, 'k')).toBeNull();
    send.mockRejectedValueOnce(Object.assign(new Error('x'), { $metadata: { httpStatusCode: 404 } }));
    expect(await S3Manager.getObject(cfg, 'k')).toBeNull();
    send.mockResolvedValueOnce({});
    expect(await S3Manager.getObject(cfg, 'k')).toBeNull();
    send.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'AccessDenied' }));
    await expect(S3Manager.getObject(cfg, 'k')).rejects.toThrow('denied');
  });
});
