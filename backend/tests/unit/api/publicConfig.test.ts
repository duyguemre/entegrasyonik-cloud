/**
 * ADR-0031 BE-CFG-3: GET /api/public-config. Gerçek express, ephemeral 127.0.0.1 portu (dış ağ YOK), DB YOK:
 * (a) yanıt anahtarları ⊆ izin listesi, (b) sır sızmaz, (c) DB çağrısı yok, (d) Cache-Control + ETag + 304, (e) < 4 KB,
 * kimliksiz erişim (OPEN_ROUTES) ve hata zarfı.
 */
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { configurePublicConfigRoute, buildPublicConfig, PUBLIC_CONFIG_CACHE_CONTROL } from '@api/http/publicConfig';
import { setTargetOverride, resetPlatformOverrideStoreForTests } from '@integration/config/platformOverrideStore';
import { listSettings } from '@integration/config/catalog';
import { envKeys, resetConfigForTests } from '@config';
import { isOpenRoute } from '@api/http/authenticate';
import { errorHandler } from '@api/http/errorEnvelope';
import { DatabaseManagerInstance } from '@database/DatabaseManager';

let server: http.Server;
let base: string;
const savedEnv = { ...process.env };

beforeAll(async () => {
  const app = express();
  configurePublicConfigRoute(app, '/api');
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });
afterEach(() => {
  resetPlatformOverrideStoreForTests();
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  Object.assign(process.env, savedEnv);
  resetConfigForTests();
  jest.restoreAllMocks();
});

const get = (headers: Record<string, string> = {}) => fetch(base + '/api/public-config', { headers });

describe('GET /api/public-config', () => {
  it('kimliksiz erişilebilir: authenticate OPEN_ROUTES kamu istisnası', () => {
    expect(isOpenRoute('GET', 'public-config')).toBe(true);
    expect(isOpenRoute('POST', 'public-config')).toBe(false);
  });

  it('(a) varsayılanlar: gövde tam olarak izin listesi (version, env.images{2}, settings = exposure:public anahtarlar)', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body: any = await res.json();
    expect(Object.keys(body).sort()).toEqual(['env', 'settings', 'version']);
    expect(Object.keys(body.env)).toEqual(['images']);
    expect(Object.keys(body.env.images).sort()).toEqual(['productBaseUrl', 'uploadMaxBytes']);
    expect(body.version).toBe(0);
    const publicKeys = listSettings().filter((s) => s.exposure === 'public').map((s) => s.key).sort();
    expect(Object.keys(body.settings).sort()).toEqual(publicKeys);
    expect(publicKeys).toHaveLength(9);
    expect(body.settings).toEqual({
      'support.email': 'bilgi@entegrasyonik.com.tr', 'support.phone': '', 'announcement.enabled': false, 'announcement.level': 'info',
      'announcement.text': '', 'maintenance.enabled': false, 'maintenance.message': '', 'ui.listPageSize': 25, 'ui.reportPollMs': 5000,
    });
    expect(typeof body.env.images.productBaseUrl).toBe('string');
    expect(body.env.images.uploadMaxBytes).toBeGreaterThan(0);
  });

  it('exposure taşımayan bir katalog anahtarı yanıta girmez; katalogdaki her scope=platform anahtar exposure taşımalı (yeni anahtar eklenince bilinçli karar)', () => {
    // `features.*` (B11 ozellik bayraklari) varsayilan yoneticiye ozeldir; `clientVisible` ile bilincli acilir (catalog/features.ts).
    // `alerts.*` (ADR-0029 NB8 alarm esikleri) de yoneticiye ozeldir (catalog/alerts.ts); public-config'e girmez.
    const platformKeys = listSettings().filter((s) => s.scope === 'platform' && !s.key.startsWith('features.') && !s.key.startsWith('alerts.'));
    expect(platformKeys.filter((s) => s.exposure !== 'public').map((s) => s.key)).toEqual([]);
    const body = buildPublicConfig();
    const nonPublic = listSettings().filter((s) => s.exposure !== 'public').map((s) => s.key);
    for (const k of nonPublic) expect(Object.keys(body.settings)).not.toContain(k);
  });

  it('yayınlanmış _platform değerleri (bellek deposu) yansır; version = yayın sürümü', async () => {
    setTargetOverride('_platform', 7, { 'announcement.enabled': true, 'announcement.text': 'Bakım var', 'ui.listPageSize': 50 });
    const body: any = await (await get()).json();
    expect(body.version).toBe(7);
    expect(body.settings['announcement.enabled']).toBe(true);
    expect(body.settings['announcement.text']).toBe('Bakım var');
    expect(body.settings['ui.listPageSize']).toBe(50);
  });

  it('env.images.productBaseUrl R2_PUBLIC_URL_IMAGE + IMAGE_FILES_PATH kaynaklıdır', async () => {
    process.env.R2_PUBLIC_URL_IMAGE = 'https://cdn.example.test/';
    process.env.IMAGE_UPLOAD_MAX_BYTES = '2097152';
    const body: any = await (await get()).json();
    expect(body.env.images).toEqual({ productBaseUrl: 'https://cdn.example.test/products/', uploadMaxBytes: 2097152 });
  });

  it('(b) sır sızmaz: sır desenli her env adı/değeri gövdede yoktur', async () => {
    const secretNames = envKeys().filter((k) => /SECRET|PASSWORD|PASS$|TOKEN|KEY|HMAC|DB_URL|ENDPOINT|CORS|ALLOWLIST/i.test(k));
    expect(secretNames.length).toBeGreaterThan(5);
    const values: string[] = [];
    secretNames.forEach((k, i) => { const v = `LEAKCANARY-${i}-${k.toLowerCase()}-Z9x`; process.env[k] = v; values.push(v); });
    resetConfigForTests();
    const res = await get();
    const text = await res.text();
    for (const k of secretNames) expect(text).not.toContain(k);
    for (const v of values) expect(text).not.toContain(v);
    expect(res.status).toBe(200);
  });

  it('(c) istek başına DB çağrısı yok', async () => {
    const spy = jest.spyOn(DatabaseManagerInstance, 'getApplicationDB');
    const spyClient = jest.spyOn(DatabaseManagerInstance as any, 'getClientDB').mockImplementation(() => { throw new Error('DB çağrılmamalı'); });
    for (let i = 0; i < 3; i++) expect((await get()).status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
    expect(spyClient).not.toHaveBeenCalled();
  });

  it('(d) Cache-Control public,max-age=30 + ETag; aynı sürümde If-None-Match 304, sürüm değişince 200', async () => {
    const r1 = await get();
    expect(r1.headers.get('cache-control')).toBe(PUBLIC_CONFIG_CACHE_CONTROL);
    expect(PUBLIC_CONFIG_CACHE_CONTROL).toBe('public, max-age=30');
    const etag = r1.headers.get('etag')!;
    expect(etag).toMatch(/^W\/"0-[0-9a-f]{12}"$/);
    await r1.text();
    const r2 = await get({ 'If-None-Match': etag });
    expect(r2.status).toBe(304);
    expect(await r2.text()).toBe('');
    setTargetOverride('_platform', 1, { 'support.phone': '+90 850 111 22 33' });
    const r3 = await get({ 'If-None-Match': etag });
    expect(r3.status).toBe(200);
    expect(r3.headers.get('etag')).not.toBe(etag);
    expect(r3.headers.get('etag')).toMatch(/^W\/"1-/);
    await r3.text();
  });

  it('(e) gövde 4 KB altında (en uzun metinlerle bile)', () => {
    setTargetOverride('_platform', 9, {
      'announcement.text': 'a'.repeat(280), 'maintenance.message': 'b'.repeat(280), 'support.email': `${'e'.repeat(100)}@ornek.com`, 'support.phone': '+90 850 111 22 33',
    });
    expect(Buffer.byteLength(JSON.stringify(buildPublicConfig()))).toBeLessThan(4096);
  });

  it('yalnız GET: POST/PUT bu rotada yanıt vermez (404)', async () => {
    const r = await fetch(base + '/api/public-config', { method: 'POST' });
    expect(r.status).toBe(404);
  });
});
