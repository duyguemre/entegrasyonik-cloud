import { describe, it, expect, jest } from '@jest/globals';
import { createOriginCheckMiddleware, isOriginAllowed, parseCorsOrigins } from '../../../src/api/http/originCheck';

// [ADR-0001 adım 7] Origin/CSRF asgari koruması: durum değiştiren isteklerde Origin (yoksa Referer) CORS_ORIGINS'e karşı doğrulanır.
// Başlıkların ikisi de yoksa izin (tarayıcı dışı istemci). Preflight (OPTIONS) etkilenmez. DB/ağ YOK.

const ALLOWED = ['https://app.entegrasyonik.com', 'http://localhost:3000', 'app://.'];

function req(method: string, headers: Record<string, string> = {}): any {
  return { method, headers };
}

function run(r: any, allowed = ALLOWED) {
  const next = jest.fn();
  const res: any = { statusCode: undefined, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.send = (b: any) => { res.body = b; return res; };
  createOriginCheckMiddleware(allowed)(r, res, next);
  return { next, res };
}

describe('Origin kontrolü: durum değiştiren istekler', () => {
  it('izinli Origin ile POST/PUT/PATCH/DELETE geçer', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { next, res } = run(req(m, { origin: 'https://app.entegrasyonik.com' }));
      expect([m, next.mock.calls.length, res.statusCode]).toEqual([m, 1, undefined]);
    }
  });

  it('listede olmayan Origin 403 (next çağrılmaz)', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { next, res } = run(req(m, { origin: 'https://evil.example', host: 'api.entegrasyonik.com' }));
      expect([m, next.mock.calls.length, res.statusCode]).toEqual([m, 0, 403]);
      expect(res.body).toEqual({ error: 'Forbidden origin' });
    }
  });

  it('Electron Origin app://. CORS_ORIGINS\'te olduğu için izinli kalır', () => {
    expect(run(req('POST', { origin: 'app://.' })).next).toHaveBeenCalledTimes(1);
  });

  it('Origin "null" (sandbox/file) listede yoksa 403', () => {
    expect(run(req('POST', { origin: 'null' })).res.statusCode).toBe(403);
  });

  it('Origin ile listedeki değer büyük/küçük harf ve sondaki "/" farkını yok sayar', () => {
    expect(run(req('POST', { origin: 'HTTPS://APP.ENTEGRASYONIK.COM' })).next).toHaveBeenCalledTimes(1);
    expect(run(req('POST', { origin: 'https://app.entegrasyonik.com' }), ['https://app.entegrasyonik.com/']).next).toHaveBeenCalledTimes(1);
  });

  it('şema/port farkı eşleşmez (http != https, farklı port)', () => {
    expect(run(req('POST', { origin: 'http://app.entegrasyonik.com' })).res.statusCode).toBe(403);
    expect(run(req('POST', { origin: 'http://localhost:3001', host: 'api.x' })).res.statusCode).toBe(403);
  });

  it('alt alan adı / ek ekli host eşleşmez (app.entegrasyonik.com.evil.io)', () => {
    expect(run(req('POST', { origin: 'https://app.entegrasyonik.com.evil.io', host: 'api.x' })).res.statusCode).toBe(403);
  });
});

describe('Origin kontrolü: Origin yoksa Referer, ikisi de yoksa izin', () => {
  it('Origin yok, izinli Referer: geçer', () => {
    expect(run(req('POST', { referer: 'https://app.entegrasyonik.com/login?x=1' })).next).toHaveBeenCalledTimes(1);
  });
  it('Origin yok, izinsiz Referer: 403', () => {
    const { res, next } = run(req('POST', { referer: 'https://evil.example/page', host: 'api.x' }));
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
  it('Origin yok, ayrıştırılamayan Referer: 403 (fail-closed)', () => {
    expect(run(req('POST', { referer: 'not a url' })).res.statusCode).toBe(403);
  });
  it('Origin VARSA Referer yok sayılır (Origin belirleyici)', () => {
    expect(run(req('POST', { origin: 'https://evil.example', referer: 'https://app.entegrasyonik.com/', host: 'api.x' })).res.statusCode).toBe(403);
  });
  it('ikisi de yoksa izin verilir (tarayıcı dışı istemci: curl, sunucudan sunucuya, MCP vb.)', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(run(req(m)).next).toHaveBeenCalledTimes(1);
    }
  });
});

describe('Origin kontrolü: güvenli yöntemler ve preflight etkilenmez', () => {
  it('GET/HEAD/OPTIONS izinsiz Origin ile bile bu middleware\'de engellenmez (CORS başlıkları cors paketinin işi)', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      const { next, res } = run(req(m, { origin: 'https://evil.example' }));
      expect([m, next.mock.calls.length, res.statusCode]).toEqual([m, 1, undefined]);
    }
  });
});

describe('Origin kontrolü: aynı-origin (SPA aynı sunucudan sunuluyorsa)', () => {
  it('Origin host\'u isteğin Host başlığıyla aynıysa CORS_ORIGINS\'te olmasa da izinli', () => {
    expect(run(req('POST', { origin: 'https://panel.example.com', host: 'panel.example.com' }), []).next).toHaveBeenCalledTimes(1);
  });
  it('farklı host: 403', () => {
    expect(run(req('POST', { origin: 'https://evil.example', host: 'panel.example.com' }), []).res.statusCode).toBe(403);
  });
});

describe('isOriginAllowed / parseCorsOrigins', () => {
  it('isOriginAllowed doğrudan çağrılabilir', () => {
    expect(isOriginAllowed(req('POST', { origin: 'https://app.entegrasyonik.com' }), ALLOWED)).toBe(true);
    expect(isOriginAllowed(req('POST', { origin: 'https://x.y', host: 'z' }), ALLOWED)).toBe(false);
  });

  it('CORS_ORIGINS virgüllerle ayrılır, boşluklar kırpılır, boş elemanlar atılır', () => {
    expect(parseCorsOrigins(' http://a.com , ,app://. ,')).toEqual({ origins: ['http://a.com', 'app://.'], wildcardRejected: false });
    expect(parseCorsOrigins(undefined)).toEqual({ origins: [], wildcardRejected: false });
    expect(parseCorsOrigins('')).toEqual({ origins: [], wildcardRejected: false });
  });

  it('"*" KABUL EDİLMEZ: listeden çıkarılır ve wildcardRejected=true; tek başına "*" boş liste demektir', () => {
    expect(parseCorsOrigins('*')).toEqual({ origins: [], wildcardRejected: true });
    expect(parseCorsOrigins('http://a.com,*')).toEqual({ origins: ['http://a.com'], wildcardRejected: true });
  });

  it('"*" ile yapılandırılmış sunucuda hiçbir Origin joker olarak eşleşmez', () => {
    const { origins } = parseCorsOrigins('*');
    expect(run(req('POST', { origin: 'https://evil.example', host: 'api.x' }), origins).res.statusCode).toBe(403);
  });
});
