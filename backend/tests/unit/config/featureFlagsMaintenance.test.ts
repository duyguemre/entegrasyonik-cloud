/**
 * BACKOFFICE_PLAN B11: özellik bayrakları (katalog + isFeatureEnabled + public-config) ve bakım modu ara katmanı.
 * DB/ağ YOK: gerçek express, ephemeral 127.0.0.1 portu; `_platform` değerleri bellek deposuna elle yazılır.
 */
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { SETTINGS_CATALOG } from '@integration/config/catalog';
import { buildFeatureSettings, FEATURE_FLAGS } from '@integration/config/catalog/features';
import { isFeatureEnabled } from '@integration/config/featureFlags';
import { validatePatch } from '@integration/config/validatePatch';
import { PLATFORM_TARGET } from '@integration/config/targets';
import { setTargetOverride, resetPlatformOverrideStoreForTests } from '@integration/config/platformOverrideStore';
import { buildPublicConfig } from '@api/http/publicConfig';
import { createMaintenanceMiddleware, isMaintenanceBlocked } from '@api/http/maintenanceGuard';
import { errorHandler } from '@api/http/errorEnvelope';
import { ERROR_CODES } from '@platform/core/errors';

const FLAGS = buildFeatureSettings([
  { name: 'betaReports', label: { tr: 'a', en: 'a' }, help: { tr: 'a', en: 'a' }, clientVisible: true },
  { name: 'pilotX', label: { tr: 'b', en: 'b' }, help: { tr: 'b', en: 'b' }, tenantScoped: true },
]);
const catalog = SETTINGS_CATALOG as unknown as any[];
const publish = (o: Record<string, unknown>) => setTargetOverride(PLATFORM_TARGET, 1, o);

beforeAll(() => { catalog.push(...FLAGS); });
afterAll(() => { for (const f of FLAGS) catalog.splice(catalog.indexOf(f), 1); });
afterEach(() => resetPlatformOverrideStoreForTests());

describe('özellik bayrağı kataloğu', () => {
  it('başlangıç kataloğu `agent` (ADR-0034 kill-switch) + `competition` (PRC-R1 buybox işi, tenant listeli pilot); üretilen bayraklar platform kapsamlı, varsayılan kapalı, şemayı geçer', () => {
    expect(FEATURE_FLAGS.map((f) => f.name)).toEqual(['agent', 'competition', 'pricingRules']);
    expect(FEATURE_FLAGS.find((f) => f.name === 'competition')?.tenantScoped).toBe(true);
    for (const d of FLAGS) {
      expect(d.scope).toBe('platform');
      expect(d.schema.safeParse(d.default).success).toBe(true);
    }
    expect(FLAGS.find((d) => d.key === 'features.betaReports')?.default).toBe(false);
  });

  it('geçersiz ad ve clientVisible+tenantScoped reddedilir', () => {
    const l = { tr: 'x', en: 'x' };
    expect(() => buildFeatureSettings([{ name: 'Bad-Name', label: l, help: l }])).toThrow();
    expect(() => buildFeatureSettings([{ name: 'okName', label: l, help: l, clientVisible: true, tenantScoped: true }])).toThrow();
  });

  it('katalogda olmayan bayrak yazılamaz; tanımlı olan yalnız _platform hedefinde ve bool olarak yazılır', () => {
    expect(validatePatch({ 'features.yok': true }, { target: PLATFORM_TARGET })).not.toHaveLength(0);
    expect(validatePatch({ 'features.betaReports': true }, { target: PLATFORM_TARGET })).toHaveLength(0);
    expect(validatePatch({ 'features.betaReports': 'evet' }, { target: PLATFORM_TARGET })).not.toHaveLength(0);
    expect(validatePatch({ 'features.betaReports': true }, { target: 'trendyol' })).not.toHaveLength(0);
  });
});

describe('isFeatureEnabled', () => {
  it('varsayılan kapalı, yayınlanınca açık, bilinmeyen ad kapalı', () => {
    expect(isFeatureEnabled('betaReports')).toBe(false);
    publish({ 'features.betaReports': true });
    expect(isFeatureEnabled('betaReports')).toBe(true);
    expect(isFeatureEnabled('hicYok')).toBe(false);
  });

  it('tenant listesi: boşsa herkes, doluysa yalnız listedekiler', () => {
    publish({ 'features.pilotX': true });
    expect(isFeatureEnabled('pilotX', { tenantId: 7 })).toBe(true);
    publish({ 'features.pilotX': true, 'features.pilotX.tenants': ['7', '9'] });
    expect(isFeatureEnabled('pilotX', { tenantId: 7 })).toBe(true);
    expect(isFeatureEnabled('pilotX', { tenantId: '9' })).toBe(true);
    expect(isFeatureEnabled('pilotX', { tenantId: 8 })).toBe(false);
    expect(isFeatureEnabled('pilotX')).toBe(false);
    publish({ 'features.pilotX': false, 'features.pilotX.tenants': ['7'] });
    expect(isFeatureEnabled('pilotX', { tenantId: 7 })).toBe(false);
  });

  it('public-config yalnız clientVisible bayrağı taşır (tenant listesi/yönetici bayrağı sızmaz)', () => {
    publish({ 'features.betaReports': true, 'features.pilotX': true, 'features.pilotX.tenants': ['7'] });
    const s = buildPublicConfig().settings;
    expect(s['features.betaReports']).toBe(true);
    expect(Object.keys(s).filter((k) => k.startsWith('features.'))).toEqual(['features.betaReports']);
  });
});

describe('isMaintenanceBlocked (saf)', () => {
  it('okuma yöntemleri, oturum akışı ve read/propose operasyonları serbest; yazma ve bilinmeyen bloklu', () => {
    expect(isMaintenanceBlocked('GET', 'OrderService')).toBe(false);
    expect(isMaintenanceBlocked('HEAD', 'x')).toBe(false);
    expect(isMaintenanceBlocked('POST', 'SecurityService/login')).toBe(false);
    expect(isMaintenanceBlocked('POST', 'SecurityService/logout')).toBe(false);
    expect(isMaintenanceBlocked('POST', 'client-log')).toBe(false);
    expect(isMaintenanceBlocked('POST', 'SecurityService/register')).toBe(true);
    expect(isMaintenanceBlocked('POST', 'IntegrationConfigService/list')).toBe(false); // read
    expect(isMaintenanceBlocked('POST', 'IntegrationConfigService/publish')).toBe(true); // write
    expect(isMaintenanceBlocked('POST', 'Olmayan/operasyon')).toBe(true);
    expect(isMaintenanceBlocked('DELETE', 'x/y')).toBe(true);
  });
});

describe('bakım modu ara katmanı (express)', () => {
  let server: http.Server;
  let base: string;
  let enabled = false;
  let message = '';
  let ga = false;
  beforeAll(async () => {
    const app = express();
    app.use((_req, res, next) => { res.locals.principal = ga ? { ga: true } : { tid: 1 }; next(); });
    app.use('/api', createMaintenanceMiddleware({ isEnabled: () => enabled, message: () => message }));
    app.all('/api/*', (_req, res) => { res.status(200).json({ ok: true }); });
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });
  afterEach(() => { enabled = false; message = ''; ga = false; });
  const post = (p: string) => fetch(base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

  it('kapalıyken her şey geçer', async () => {
    expect((await post('OrderService/updateStatus')).status).toBe(200);
  });

  it('açıkken yazma 503 MAINTENANCE + Retry-After + ayarlı mesaj; varsayılan mesaj', async () => {
    enabled = true;
    let res = await post('OrderService/updateStatus');
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('60');
    let body: any = await res.json();
    expect(body.code).toBe('MAINTENANCE');
    expect(body.error).toBe(ERROR_CODES.MAINTENANCE.message);
    message = 'Saat 03:00 kadar bakımdayız.';
    res = await post('OrderService/updateStatus');
    body = await res.json();
    expect(body.error).toBe(message);
  });

  it('açıkken okuma, giriş/çıkış ve küresel yönetici serbest', async () => {
    enabled = true;
    expect((await fetch(base + '/api/OrderService')).status).toBe(200);
    expect((await post('SecurityService/login')).status).toBe(200);
    expect((await post('SecurityService/logout')).status).toBe(200);
    expect((await post('IntegrationConfigService/list')).status).toBe(200);
    ga = true;
    expect((await post('IntegrationConfigService/publish')).status).toBe(200);
  });

  it('ayar okuması hata verirse fail-open', async () => {
    const mw = createMaintenanceMiddleware({ isEnabled: () => { throw new Error('x'); }, message: () => '' });
    let nexted = false;
    mw({ method: 'POST', path: '/A/b' } as any, { locals: {} } as any, () => { nexted = true; });
    expect(nexted).toBe(true);
  });
});
