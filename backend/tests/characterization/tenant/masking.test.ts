import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ClientSchema } from '../../../src/database/application/models/Client';
import { UserSchema } from '../../../src/database/application/models/User';
import { isSecretField, maskSettings, maskIntegrationItem, maskClientIntegrationsDoc, resolveSecretsForWrite, SENSITIVE_MASK } from '../../../src/api/integrationSecrets';
import { sanitizeResponse } from '../../../src/api/responseSanitizer';
import { toClientDto, CLIENT_SORT_FIELDS } from '../../../src/api/clientDto';
import { toProfileDto } from '../../../src/api/profileDto';
import { captureLogs, LogCapture } from '../../helpers/logCapture';
import { makeFakeApp, makeReq, makeRes } from '../auth/_helpers';

// ADR-0003 adım 3-4: sır alanı kaydı, maskeleme/yazma sözleşmesi ('sensitive'), DTO'lar, son savunma temizleyici ve şema indeks TANIMLARI.
// Tüm değerler sentetiktir; DB/Redis/ağ YOK.

describe('sır alanı kaydı (ADR-0003 C.10)', () => {
  it.each(['apiKey', 'APIKEY', 'apikey', 'apiSecret', 'APISECRET', 'appKey', 'AppSecret', 'password', 'PASSWORD', 'token', 'access_token', 'refresh_token', 'clientSecret', 'client_secret', 'secret', 'key', 'privateKey'])(
    '%s sırdır', (name) => { expect(isSecretField(name)).toBe(true); });

  it.each(['SELLERID', 'MERCHANTID', 'username', 'storeName', 'taxPercentage', 'barcode', 'shippingId', 'token_type', 'expires_in', 'createdAt', 'auth', 'status'])(
    '%s sır DEĞİLDİR', (name) => { expect(isSecretField(name)).toBe(false); });

  it('ideasoft için `key` (OAuth client_id; FE yetkilendirme URL\'i ister) sır sayılmaz, `secret` sayılır; diğer entegrasyonlarda `key` sırdır', () => {
    expect(isSecretField('key', 'ideasoft')).toBe(false);
    expect(isSecretField('secret', 'ideasoft')).toBe(true);
    expect(isSecretField('key', 'bizimhesap')).toBe(true);
    expect(isSecretField('key')).toBe(true);
  });
});

describe('maskSettings / yanıt maskeleme', () => {
  it('değer varsa "sensitive", yoksa "" ; iç içe nesne/dizi dahil; giriş DEĞİŞMEZ', () => {
    const src = { APIKEY: 'k', APISECRET: '', token: null, SELLERID: '1', auth: { access_token: 'a', refresh_token: 'r', createdAt: 5 }, list: [{ password: 'p' }, { x: 1 }] };
    const snapshot = JSON.parse(JSON.stringify(src));
    expect(maskSettings(src, 'trendyol')).toEqual({
      APIKEY: 'sensitive', APISECRET: '', token: '', SELLERID: '1',
      auth: { access_token: 'sensitive', refresh_token: 'sensitive', createdAt: 5 },
      list: [{ password: 'sensitive' }, { x: 1 }],
    });
    expect(src).toEqual(snapshot);
  });

  it('sayı 0 ve false dışında her dolu değer maskelenir; nesne değerli sır alanı tek "sensitive" olur', () => {
    expect(maskSettings({ secret: 0, token: { a: 1 }, key: false, password: 'x' })).toEqual({ secret: 'sensitive', token: 'sensitive', key: '', password: 'sensitive' });
  });

  it('maskClientIntegrationsDoc: 5 tipin tüm öğelerini maskeler; sırasız alanları korur; Mongoose benzeri toObject() desteklenir', () => {
    const doc: any = { _id: 'x', marketplace: [{ code: 'n11', order: 3, settings: { APIKEY: 'k' } }], einvoice: [{ code: 'gib', settings: { password: 'p', username: 'u' } }], other: 1 };
    const wrapped: any = { toObject: () => doc };
    const out = maskClientIntegrationsDoc(wrapped);
    expect(out.marketplace[0]).toEqual({ code: 'n11', order: 3, settings: { APIKEY: 'sensitive' } });
    expect(out.einvoice[0].settings).toEqual({ password: 'sensitive', username: 'u' });
    expect(out.other).toBe(1);
    expect(maskClientIntegrationsDoc(null)).toBeNull();
  });

  it('maskIntegrationItem: settings yoksa dokunmaz; null/undefined güvenli', () => {
    expect(maskIntegrationItem({ code: 'x' })).toEqual({ code: 'x' });
    expect(maskIntegrationItem(undefined)).toBeUndefined();
  });
});

describe('resolveSecretsForWrite (ADR-0003 D.16: yazılabilir-yalnız sözleşme)', () => {
  const existing = { APIKEY: 'eski-key', APISECRET: 'eski-secret', SELLERID: '1', auth: { refresh_token: 'rt', createdAt: 1 } };

  it('"sensitive" -> mevcut korunur; "" -> temizlenir; yeni değer -> yeni sır; sır olmayan alan gelen değerle yazılır', () => {
    expect(resolveSecretsForWrite({ APIKEY: SENSITIVE_MASK, APISECRET: '', SELLERID: '2', auth: existing.auth }, existing, 'trendyol'))
      .toEqual({ APIKEY: 'eski-key', APISECRET: '', SELLERID: '2', auth: { refresh_token: 'rt', createdAt: 1 } });
    expect(resolveSecretsForWrite({ APIKEY: 'yeni' }, existing, 'trendyol').APIKEY).toBe('yeni');
  });

  it('"sensitive" gelir ama mevcut değer yoksa alan yazılmaz (sentinel asla DB\'ye sır olarak yazılmaz)', () => {
    expect(resolveSecretsForWrite({ APIKEY: SENSITIVE_MASK, SELLERID: '2' }, {}, 'trendyol')).toEqual({ SELLERID: '2' });
    expect(resolveSecretsForWrite({ APIKEY: SENSITIVE_MASK }, undefined, 'trendyol')).toEqual({});
  });

  it('gövdede olmayan mevcut sır alanları ve sır içeren iç içe nesneler (OAuth auth) KORUNUR; sırsız mevcut alanlar whole-replace ile düşer (eski semantik)', () => {
    expect(resolveSecretsForWrite({ SELLERID: '9' }, { ...existing, taxPercentage: 20 }, 'trendyol'))
      .toEqual({ SELLERID: '9', APIKEY: 'eski-key', APISECRET: 'eski-secret', auth: { refresh_token: 'rt', createdAt: 1 } });
  });

  it('iç içe sır: auth.refresh_token "sensitive" gelirse mevcut korunur', () => {
    expect(resolveSecretsForWrite({ auth: { refresh_token: SENSITIVE_MASK, createdAt: 2 } }, existing, 'x'))
      .toEqual({ auth: { refresh_token: 'rt', createdAt: 2 }, APIKEY: 'eski-key', APISECRET: 'eski-secret' });
  });

  it('settings nesne değilse aynen döner (eski davranış)', () => {
    expect(resolveSecretsForWrite(undefined, existing)).toBeUndefined();
    expect(resolveSecretsForWrite('x' as any, existing)).toBe('x');
  });
});

describe('DTO\'lar', () => {
  it('toClientDto: dbConfig/provisioning/depolama anahtarları ve bilinmeyen alanlar YOK; bucket/endpoint gibi anahtar olmayan alanlar var', () => {
    const dto = toClientDto({
      _id: 'c', order: 1, clientId: 1, title: 'T', name: 'N', status: 'ACTIVE', integrations: [{ integrationCode: 'n11' }],
      dbConfig: { password: 'p' }, provisioning: { ownerEmail: 'a@b.c' }, __v: 0, secretExtra: 'x',
      archive: { code: 'A', accessKeyId: 'ak', secretAccessKey: 'sk', bucketName: 'b', endpoint: 'e', publicUrl: 'u', region: 'auto', isActive: true },
      image: { accessKeyId: 'ak2', bucketName: 'b2' },
    });
    expect(dto).toEqual({
      _id: 'c', order: 1, clientId: 1, title: 'T', name: 'N', status: 'ACTIVE', integrations: [{ integrationCode: 'n11' }],
      archive: { code: 'A', bucketName: 'b', endpoint: 'e', publicUrl: 'u', region: 'auto', isActive: true },
      image: { bucketName: 'b2' },
    });
    expect(toClientDto(null)).toBeNull();
    expect((CLIENT_SORT_FIELDS as readonly string[]).some(f => f.startsWith('dbConfig'))).toBe(false);
  });

  it('toProfileDto (ADR-0001) hâlâ parola özeti/tokenVersion içermez', () => {
    expect(Object.keys(toProfileDto({ _id: 'u', email: 'a@b.c', password: 'h', tokenVersion: 2, failedLoginAttempts: 1, lockUntil: 1 }))).toEqual(['_id', 'email', 'emailVerified', 'permissions']);
    // permissions: ADR-0028 WP-A1 ile KASITLI eklenen alan; yalnız etkili izin ADLARINI taşır (hassas değil). Sır/parola alanları yine dışarıda.
  });
});

describe('sanitizeResponse: son savunma hattı (ADR-0003 D.17)', () => {
  // F-06: sanitizer uyarısı console.warn yerine eventLog (RESPONSE_FORBIDDEN_FIELD_STRIPPED) ile stdout'a JSON satırı yazar.
  let cap: LogCapture;
  const warns = () => cap.filter((l) => l.code === 'RESPONSE_FORBIDDEN_FIELD_STRIPPED' && l.level === 'warn');
  beforeEach(() => { cap = captureLogs(); });
  afterEach(() => { cap.restore(); jest.restoreAllMocks(); });

  it('sızıntı yoksa AYNI referansı döner (kopya/log yok)', () => {
    const body = { a: 1, list: [{ password: 'sensitive', APIKEY: 'sensitive' }, { b: '' }], token_type: 'x' };
    expect(sanitizeResponse(body)).toBe(body);
    expect(warns()).toHaveLength(0);
  });

  it('yasak anahtarları (iç içe/dizi içinde, büyük-küçük harf farksız) siler; kalan alanlar aynen; olay warn ile loglanır', () => {
    const body = { users: [{ _id: 1, email: 'a@b.c', password: '$2b$hash', tokenVersion: 3 }], client: { dbConfig: { password: 'p' }, title: 'T', archive: { SecretAccessKey: 's', accessKeyId: 'a', bucketName: 'b' } }, failedLoginAttempts: 2, lockUntil: 1, oauth: { access_token: 'AT', refresh_token: 'RT' } };
    const out: any = sanitizeResponse(body, { service: 'Svc', operation: 'op' });
    expect(out).toEqual({ users: [{ _id: 1, email: 'a@b.c' }], client: { title: 'T', archive: { bucketName: 'b' } }, oauth: {} });
    expect(warns()).toHaveLength(1);
  });

  it('log: anahtar ADLARI ve yollar var; DEĞERLER ASLA loglanmaz', () => {
    sanitizeResponse({ nested: { password: 'GIZLI-DEGER-123', dbConfig: { x: 'GIZLI-DEGER-456' } } }, { service: 'S', operation: 'O' });
    const logged = JSON.stringify(cap.lines);
    expect(logged).toContain('password');
    expect(logged).toContain('dbConfig');
    expect(logged).toContain('nested.password');
    expect(logged).not.toContain('GIZLI-DEGER');
    expect(logged).toContain('"S"');
  });

  it('maskelenmiş değerler (sensitive / boş) sızıntı sayılmaz; gerçek değer olan aynı adlı alan sayılır', () => {
    const masked = { settings: { password: 'sensitive', APISECRET: '', access_token: 'sensitive' } };
    expect(sanitizeResponse(masked)).toBe(masked);
    expect((sanitizeResponse({ settings: { password: 'gercek' } }) as any).settings).toEqual({});
  });

  it('Mongoose benzeri toJSON() belge, Date, Buffer ve döngüsel referansla çökmez', () => {
    const cyc: any = { a: 1 }; cyc.self = cyc;
    const doc = { toJSON: () => ({ _id: 'x', password: 'h' }) };
    const out: any = sanitizeResponse({ doc, when: new Date(0), buf: Buffer.from('abc'), cyc });
    expect(out.doc).toEqual({ _id: 'x' });
    expect(out.buf).toBeDefined();
    expect(sanitizeResponse(cyc)).toBe(cyc);
  });

  it('ilkel/boş gövde aynen döner; captcha alanı (mevcut sahte captcha akışı) silinMEZ', () => {
    expect(sanitizeResponse('x')).toBe('x');
    expect(sanitizeResponse(null)).toBeNull();
    const cap = { captcha: 'ABCD' };
    expect(sanitizeResponse(cap)).toBe(cap);
  });
});

describe('ApiManager çıkışı: yanıt temizleyici bağlı (jenerik POST/GET)', () => {
  function loadApp(runImpl: (...a: any[]) => any) {
    let app: ReturnType<typeof makeFakeApp>;
    jest.isolateModules(() => {
      jest.doMock('../../../src/api/RunOperation', () => ({ __esModule: true, default: jest.fn(runImpl as any) }));
      jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
      const { configureApis } = require('../../../src/api/ApiManager');
      app = makeFakeApp();
      configureApis(app, '/api');
    });
    return app!;
  }
  const authed = () => makeRes({ userContext: { _id: 'u', order: 3 }, principal: { sub: 'u', tid: 3, ga: false, tv: 0 } });
  let cap: LogCapture;
  beforeEach(() => { cap = captureLogs(); });
  afterEach(() => { cap.restore(); jest.restoreAllMocks(); });

  it('POST /:service/:operation gövdesinde kaçan parola özeti/dbConfig silinir ve warn loglanır', async () => {
    const app = loadApp(async () => ({ users: [{ email: 'a@b.c', password: '$2b$sizinti' }], client: { dbConfig: { password: 'p' }, title: 'T' } }));
    const res = authed();
    await app.routes['POST /api/:service/:operation'](makeReq({ body: {}, params: { service: 'UserService', operation: 'getUsers' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ users: [{ email: 'a@b.c' }], client: { title: 'T' } });
    expect(cap.filter((l) => l.code === 'RESPONSE_FORBIDDEN_FIELD_STRIPPED').length).toBe(1);
  });

  it('GET /:service için de aynı temizleme', async () => {
    const app = loadApp(async () => [{ tokenVersion: 2, name: 'x' }]);
    const res = authed();
    await app.routes['GET /api/:service'](makeReq({ params: { service: 'Svc' } }), res);
    expect(res.body).toEqual([{ name: 'x' }]);
  });

  it('temiz gövde AYNEN (aynı referans) gönderilir', async () => {
    const payload = { ok: true, items: [{ a: 1 }] };
    const app = loadApp(async () => payload);
    const res = authed();
    await app.routes['POST /api/:service/:operation'](makeReq({ body: {}, params: { service: 'Svc', operation: 'ok' } }), res);
    expect(res.body).toBe(payload);
  });
});

describe('şema indeks tanımları (ADR-0003 A.2; canlıda kurulum insan onayı + ön kontrol)', () => {
  const keys = (schema: any) => schema.indexes().map(([f, o]: any[]) => ({ f, unique: !!o.unique, partial: o.partialFilterExpression }));

  it('Clients: order, clientId tekil; dbConfig.dbname tekil + kısmi (yalnızca string dbname; PURGED mezar taşları çakışmaz)', () => {
    const idx = keys(ClientSchema);
    expect(idx).toContainEqual({ f: { order: 1 }, unique: true, partial: undefined });
    expect(idx).toContainEqual({ f: { clientId: 1 }, unique: true, partial: undefined });
    expect(idx).toContainEqual({ f: { 'dbConfig.dbname': 1 }, unique: true, partial: { 'dbConfig.dbname': { $type: 'string' } } });
  });

  it('merkezi Users: e-posta tekil (kısmi: yalnızca string e-posta); e-posta alanı lowercase+trim', () => {
    expect(keys(UserSchema)).toContainEqual({ f: { email: 1 }, unique: true, partial: { email: { $type: 'string' } } });
    const path: any = (UserSchema as any).path('email');
    expect(path.options.lowercase).toBe(true);
    expect(path.options.trim).toBe(true);
  });

  it('e-posta sorgu filtresi şema setter\'ı ile normalize edilir (giriş: büyük/küçük harf farkı kalmaz)', () => {
    const mongoose = require('mongoose');
    const M = mongoose.models.__t_users || mongoose.model('__t_users', UserSchema);
    const q = M.findOne({ email: '  Ali@X.Y ' });
    q._castConditions();
    expect(q.getFilter()).toEqual({ email: 'ali@x.y' });
  });
});
