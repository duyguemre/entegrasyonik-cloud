/**
 * CHARACTERIZATION: RedisService (öncesi, `quit()` eklenmeden)
 * Kaynak: backend/src/services/redis/RedisService.ts
 * `ioredis` jest.mock ile değiştirilir; gerçek Redis YOK.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const instances: any[] = [];
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(function (this: any, opts: any) {
    this.opts = opts;
    this.status = 'connecting';
    const handlers: Record<string, ((...a: any[]) => void)[]> = {};
    this.on = jest.fn((event: string, cb: (...a: any[]) => void) => {
      (handlers[event] ||= []).push(cb);
    });
    this.emit = (event: string, ...args: any[]) => (handlers[event] || []).forEach((cb) => cb(...args));
    this.quit = jest.fn(async () => 'OK');
    instances.push(this);
  }),
}));

import { RedisService } from '@services/redis';

beforeEach(() => {
  (RedisService as any).instance = undefined;
  instances.length = 0;
});

describe('RedisService.getConnectionConfig', () => {
  it('[MEVCUT DAVRANIŞ] varsayılan host 127.0.0.1, port 6379, maxRetriesPerRequest null, tls tanımsız (REDIS_TLS != "true")', () => {
    const saved = { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT, tls: process.env.REDIS_TLS };
    delete process.env.REDIS_HOST; delete process.env.REDIS_PORT; delete process.env.REDIS_TLS;
    const cfg = RedisService.getConnectionConfig();
    expect(cfg).toMatchObject({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null, tls: undefined });
    process.env.REDIS_HOST = saved.host; process.env.REDIS_PORT = saved.port; process.env.REDIS_TLS = saved.tls;
  });

  it('[YENİ DAVRANIŞ, ADR-0005 Karar 2] retryStrategy tanımlı: üstel, üst sınır 30000ms', () => {
    const cfg = RedisService.getConnectionConfig() as any;
    expect(typeof cfg.retryStrategy).toBe('function');
    expect(cfg.retryStrategy(1)).toBe(2000);
    expect(cfg.retryStrategy(3)).toBe(8000);
    expect(cfg.retryStrategy(10)).toBe(30000); // üst sınır aşılmaz
  });

  it('[DÜZELTİLDİ, 2026-09-27 — BACKLOG C12 kapandı] REDIS_PASSWORD tanımlıysa gönderilir (compose --requirepass ile artık tutarlı)', () => {
    const saved = process.env.REDIS_PASSWORD;
    process.env.REDIS_PASSWORD = 'gizli-sir';
    const cfg = RedisService.getConnectionConfig() as any;
    expect(cfg.password).toBe('gizli-sir');
    process.env.REDIS_PASSWORD = saved;
  });

  it('[MEVCUT DAVRANIŞ — korunuyor] REDIS_PASSWORD boş string veya tanımsızsa password gönderilmez (parolasız local Redis ile uyumlu)', () => {
    const saved = process.env.REDIS_PASSWORD;
    process.env.REDIS_PASSWORD = '';
    expect((RedisService.getConnectionConfig() as any).password).toBeUndefined();
    delete process.env.REDIS_PASSWORD;
    expect((RedisService.getConnectionConfig() as any).password).toBeUndefined();
    process.env.REDIS_PASSWORD = saved;
  });
});

describe('RedisService.getInstance', () => {
  it('[MEVCUT DAVRANIŞ] tekil (singleton): ikinci çağrı aynı örneği döner, yeni ioredis örneği YARATILMAZ', () => {
    const a = RedisService.getInstance();
    const b = RedisService.getInstance();
    expect(a).toBe(b);
    expect(instances).toHaveLength(1);
  });
});

describe('RedisService.quit (ADR-0006 Karar 6 — YENİ)', () => {
  it('[YENİ DAVRANIŞ] örnek hiç oluşturulmadıysa no-op (yeni bağlantı AÇMAZ)', async () => {
    await RedisService.quit();
    expect(instances).toHaveLength(0);
  });

  it('[YENİ DAVRANIŞ] örnek varsa ioredis.quit() çağrılır (uçuştaki komutlar bitene kadar bekler)', async () => {
    const client = RedisService.getInstance();
    await RedisService.quit();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});

describe('RedisService.isReady (ADR-0005 Karar 2 — YENİ)', () => {
  it('[YENİ DAVRANIŞ] örnek hiç oluşturulmadıysa false (yan etkisiz — yeni bağlantı AÇMAZ)', () => {
    expect(RedisService.isReady()).toBe(false);
    expect(instances).toHaveLength(0);
  });

  it('[YENİ DAVRANIŞ] örnek var ama status "ready" değilse false', () => {
    const client = RedisService.getInstance();
    client.status = 'connecting';
    expect(RedisService.isReady()).toBe(false);
  });

  it('[YENİ DAVRANIŞ] örnek var ve status "ready" ise true', () => {
    const client = RedisService.getInstance();
    client.status = 'ready';
    expect(RedisService.isReady()).toBe(true);
  });
});

describe('RedisService.init (ADR-0005 Karar 2 — TERS ÇEVRİLDİ)', () => {
  it('[ADR-0005 adım 1] ÖNCEKİ DAVRANIŞ TERS ÇEVRİLDİ: bağlantı hatasında artık REJECT ETMEZ (resolve olur) — eskiden bu Promise reddedilir, entegrasyonik.ts süreci kapatırdı', async () => {
    const initPromise = RedisService.init();
    const client = instances[0];
    client.emit('error', new Error('ECONNREFUSED'));
    await expect(initPromise).resolves.toBeUndefined();
  });

  it('[MEVCUT DAVRANIŞ, korunuyor] "connect" olayında resolve olur', async () => {
    const initPromise = RedisService.init();
    const client = instances[0];
    client.emit('connect');
    await expect(initPromise).resolves.toBeUndefined();
  });

  it('[YENİ DAVRANIŞ] hem error hem connect art arda gelse de yalnızca BİR KEZ settle olur (ek olaylar hata fırlatmaz)', async () => {
    const initPromise = RedisService.init();
    const client = instances[0];
    client.emit('error', new Error('ilk hata'));
    client.emit('connect');
    client.emit('error', new Error('ikinci hata'));
    await expect(initPromise).resolves.toBeUndefined();
  });
});
