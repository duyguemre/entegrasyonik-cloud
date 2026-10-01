/**
 * YENİ DAVRANIŞ (ADR-0006 Karar 5): ApplicationDB.ping() alttaki Database.ping()'e delege eder.
 * Kaynak: backend/src/database/application/ApplicationDB.ts
 * `@database/Database` jest.mock ile değiştirilir; gerçek Mongo YOK.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const fakeDb = { ping: jest.fn(async () => true), getModel: jest.fn(), close: jest.fn(async () => undefined) };

jest.mock('@database/Database', () => ({
  __esModule: true,
  default: { getInstance: jest.fn(async () => fakeDb) },
}));

import ApplicationDB from '@database/application/ApplicationDB';

const config = { url: 'mongodb://{{DBNAME}}', user: '', password: '', dbname: 'appdb', poolsize: 5 };

beforeEach(() => {
  (ApplicationDB as any).instance = null;
  (ApplicationDB as any).initPromise = null;
  fakeDb.ping.mockClear();
  fakeDb.ping.mockResolvedValue(true);
});

describe('ApplicationDB.ping', () => {
  it('[YENİ DAVRANIŞ] alttaki Database.ping() sonucunu olduğu gibi döner', async () => {
    const appDb = await ApplicationDB.getInstance(config);
    await expect(appDb.ping()).resolves.toBe(true);
    expect(fakeDb.ping).toHaveBeenCalledTimes(1);

    fakeDb.ping.mockResolvedValueOnce(false);
    await expect(appDb.ping()).resolves.toBe(false);
  });
});
