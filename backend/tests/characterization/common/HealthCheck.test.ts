/**
 * YENİ DAVRANIŞ (ADR-0006 Karar 5): `/health` `/ready` paylaşımlı mantığı.
 * Kaynak: backend/src/health/HealthCheck.ts
 * `@database/DatabaseManager` jest.mock ile değiştirilir; gerçek Mongo/Redis YOK.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: jest.fn() },
}));

import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { checkReadiness } from '@health/HealthCheck';
import { beginShutdown, resetShutdownStateForTests } from '@health/readinessState';

const dbm = DatabaseManagerInstance as any;

beforeEach(() => {
  resetShutdownStateForTests();
  dbm.getApplicationDB.mockReset();
});

describe('checkReadiness', () => {
  it('[YENİ DAVRANIŞ] rol=web: mongo OK ise ready=true, redis="n/a" (HİÇ sorulmaz, getRedisClient çağrılmaz)', async () => {
    dbm.getApplicationDB.mockResolvedValue({ ping: jest.fn(async () => true) });
    const getRedisClient = jest.fn();
    const status = await checkReadiness('web', getRedisClient as any);
    expect(status).toEqual({ ready: true, mongo: 'ok', redis: 'n/a' });
    expect(getRedisClient).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] rol=all: mongo VE redis OK ise ready=true', async () => {
    dbm.getApplicationDB.mockResolvedValue({ ping: jest.fn(async () => true) });
    const client = { ping: jest.fn(async () => 'PONG') };
    const status = await checkReadiness('all', () => client);
    expect(status).toEqual({ ready: true, mongo: 'ok', redis: 'ok' });
  });

  it('[YENİ DAVRANIŞ] rol=worker: redis PONG dışında bir şey dönerse fail sayılır, ready=false', async () => {
    dbm.getApplicationDB.mockResolvedValue({ ping: jest.fn(async () => true) });
    const client = { ping: jest.fn(async () => 'PANG') };
    const status = await checkReadiness('worker', () => client);
    expect(status).toEqual({ ready: false, mongo: 'ok', redis: 'fail' });
  });

  it('[YENİ DAVRANIŞ] mongo ping false dönerse ready=false, mongo="fail"', async () => {
    dbm.getApplicationDB.mockResolvedValue({ ping: jest.fn(async () => false) });
    const status = await checkReadiness('web');
    expect(status).toEqual({ ready: false, mongo: 'fail', redis: 'n/a' });
  });

  it('[YENİ DAVRANIŞ] ApplicationDB erişimi hata fırlatırsa yakalanır, mongo="fail" (throw ETMEZ)', async () => {
    dbm.getApplicationDB.mockRejectedValue(new Error('conn refused'));
    const status = await checkReadiness('web');
    expect(status.mongo).toBe('fail');
    expect(status.ready).toBe(false);
  });

  it('[YENİ DAVRANIŞ] redis.ping() hata fırlatırsa yakalanır, redis="fail" (throw ETMEZ)', async () => {
    dbm.getApplicationDB.mockResolvedValue({ ping: jest.fn(async () => true) });
    const client = { ping: jest.fn(async () => { throw new Error('ECONNREFUSED'); }) };
    const status = await checkReadiness('all', () => client);
    expect(status.redis).toBe('fail');
  });

  it('[YENİ DAVRANIŞ] mongo ping 1sn içinde sonuçlanmazsa zaman aşımı ile fail sayılır (throw etmez)', async () => {
    jest.useFakeTimers();
    const neverResolves = new Promise<boolean>(() => {});
    dbm.getApplicationDB.mockResolvedValue({ ping: jest.fn(() => neverResolves) });
    const statusPromise = checkReadiness('web');
    await jest.advanceTimersByTimeAsync(1000);
    const status = await statusPromise;
    expect(status.mongo).toBe('fail');
    jest.useRealTimers();
  });

  it('[YENİ DAVRANIŞ] kapanış başladıysa (beginShutdown) DB/Redis\'e HİÇ sorulmadan ready=false döner', async () => {
    beginShutdown();
    const status = await checkReadiness('all', () => ({ ping: jest.fn(async () => 'PONG') }));
    expect(status).toEqual({ ready: false, mongo: 'fail', redis: 'fail' });
    expect(dbm.getApplicationDB).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] kapanış başladıysa ve rol=web ise redis="n/a" olarak kalır', async () => {
    beginShutdown();
    const status = await checkReadiness('web');
    expect(status).toEqual({ ready: false, mongo: 'fail', redis: 'n/a' });
  });
});
