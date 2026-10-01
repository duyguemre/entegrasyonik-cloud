/**
 * ADR-0024 P0-LIFE adim 1: kapanis sirasi, hata izolasyonu, zaman asimi, cift sinyal. Bilesenler sahte; process.exit mock'lu.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createShutdown, DEFAULT_SHUTDOWN_TIMEOUT_MS } from '@bootstrap/shutdown';

const log = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

describe('createShutdown', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('varsayilan zaman asimi 25 sn', () => { expect(DEFAULT_SHUTDOWN_TIMEOUT_MS).toBe(25000); });

  it('sira: onBegin -> adimlar (verilen sirada) -> exit(0); hatasiz kapanista kod 0', async () => {
    const order: string[] = [];
    const exit = jest.fn();
    const sd = createShutdown({
      onBegin: () => order.push('begin'),
      steps: ['http', 'schedules', 'bullmq', 'db', 'redis'].map((n) => ({ name: n, run: async () => { order.push(n); } })),
      exit, log: log(),
    });
    await sd('SIGTERM');
    expect(order).toEqual(['begin', 'http', 'schedules', 'bullmq', 'db', 'redis']);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('hata ile kapanista exit(1); basarisiz adim digerlerini ENGELLEMEZ ve loglanir', async () => {
    const order: string[] = [];
    const exit = jest.fn(); const l = log();
    const sd = createShutdown({
      steps: [
        { name: 'http', run: () => { throw new Error('close failed'); } },
        { name: 'db', run: async () => { order.push('db'); } },
      ],
      exit, log: l,
    });
    await sd('Initialization Failed', new Error('init'));
    expect(order).toEqual(['db']);
    expect(l.error).toHaveBeenCalledWith(expect.objectContaining({ step: 'http' }), expect.any(String));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('adim sureleri ve toplam sure yapilandirilmis alanlarla loglanir', async () => {
    const l = log(); let t = 0;
    const sd = createShutdown({ steps: [{ name: 'db', run: async () => { t += 40; } }], exit: jest.fn(), log: l, now: () => t });
    await sd('SIGINT');
    expect(l.info).toHaveBeenCalledWith({ step: 'db', durationMs: 40 }, expect.any(String));
    expect(l.info).toHaveBeenCalledWith({ reason: 'SIGINT', totalMs: 40 }, expect.any(String));
  });

  it('zaman asimi: takili adim 25 sn sonra exit(1) ile zorla sonlandirilir; kalan adimlar calismaz; sonradan cift exit YOK', async () => {
    const exit = jest.fn(); const later = jest.fn();
    const sd = createShutdown({
      steps: [{ name: 'hang', run: () => new Promise(() => undefined) }, { name: 'after', run: later }],
      exit, log: log(), timeoutMs: 25000,
    });
    void sd('SIGTERM');
    await jest.advanceTimersByTimeAsync(24999);
    expect(exit).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(later).not.toHaveBeenCalled();
  });

  it('hizli kapanista zaman asimi zamanlayicisi temizlenir (exit(1) tetiklenmez)', async () => {
    const exit = jest.fn();
    const sd = createShutdown({ steps: [{ name: 'a', run: async () => undefined }], exit, log: log() });
    await sd('SIGTERM');
    await jest.advanceTimersByTimeAsync(60000);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('cift sinyal: kapanis surerken ikinci cagri HEMEN exit(1) yapar; adimlar tekrar calismaz', async () => {
    const exit = jest.fn(); const step = jest.fn(() => new Promise(() => undefined));
    const sd = createShutdown({ steps: [{ name: 'hang', run: step }], exit, log: log() });
    void sd('SIGINT (Ctrl+C)');
    await Promise.resolve();
    await sd('SIGINT (Ctrl+C)');
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(step).toHaveBeenCalledTimes(1);
  });
});
