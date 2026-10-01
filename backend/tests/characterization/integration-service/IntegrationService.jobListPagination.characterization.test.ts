/**
 * CHARACTERIZATION: IntegrationService import/export log listeleri -- page/limit sayfalama sınırları
 * (BACKLOG C22 / GV-01 ertelenmiş kalem). Kaynak: backend/src/api/rpc/handlers/integration-service.ts
 * `advancedSearchExportJobs`, `getExportJobs`, `getImportJobs`.
 *
 * GV-01'de bu dosyanın yalnızca `$regex` satırları düzeltilmişti; `limit`/`page` sınırları K7 çakışması
 * nedeniyle ERTELENMİŞTİ (BACKLOG.md). Bu dosya önce MEVCUT (sınırsız) davranışı sabitler, sonra
 * `@utils/search.normalizePagination` ile düzeltme sonrası davranışı sınar.
 *
 * DatabaseManager/IntegrationFactory/EventBus/NotificationService jest.mock; clientDB/applicationDB sahte
 * model nesneleridir. DB/Redis/ağ YOK.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/IntegrationEventBus', () => ({
  EVENTS: {},
  integrationEventBus: { emit: jest.fn(), on: jest.fn() },
}));
jest.mock('@services/notification/NotificationService', () => ({ NotificationService: {} }));

import IntegrationService from '@api/rpc/handlers/integration-service';

let aggregate: any;
let countDocuments: any;
let find: any;
let findChain: any;

function makeService(request: any, clientId: any = 42): any {
  const svc: any = new IntegrationService(clientId, request);
  svc.clientDB = { getExportStagedProductModel: () => ({ aggregate, countDocuments }) };
  svc.applicationDB = { getImportJobModel: () => ({ find, countDocuments }) };
  return svc;
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  aggregate = jest.fn(async () => []);
  countDocuments = jest.fn(async () => 0);
  findChain = {};
  findChain.sort = jest.fn(() => findChain);
  findChain.skip = jest.fn(() => findChain);
  findChain.limit = jest.fn(() => findChain);
  findChain.lean = jest.fn(async () => []);
  find = jest.fn(() => findChain);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('advancedSearchExportJobs - page/limit sınırlaması', () => {
  it('[DÜZELTME 2026-09-29, BACKLOG C22/GV-01, KASITLI TERS ÇEVRİLDİ] aşırı büyük limit artık 200\'e SIKIŞTIRILIR (eskiden ham değer $limit\'e doğrudan gidiyordu)', async () => {
    await makeService({ limit: 999999, page: 1 }).advancedSearchExportJobs();
    const pipeline = aggregate.mock.calls[0][0] as any[];
    const limitStage = pipeline.find((s: any) => '$limit' in s);
    expect(limitStage.$limit).toBe(200);
  });

  it('[DÜZELTME 2026-09-29, BACKLOG C22/GV-01, KASITLI TERS ÇEVRİLDİ] page<1 (0/negatif) artık 1\'e SIKIŞTIRILIR -> $skip 0 (eskiden negatif $skip üretiyordu)', async () => {
    await makeService({ limit: 10, page: -3 }).advancedSearchExportJobs();
    const pipeline = aggregate.mock.calls[0][0] as any[];
    const skipStage = pipeline.find((s: any) => '$skip' in s);
    expect(skipStage.$skip).toBe(0);
  });

  it('[MEVCUT DAVRANIŞ] page/limit verilmezse varsayılan sayfa 1 / limit 13', async () => {
    await makeService({}).advancedSearchExportJobs();
    const pipeline = aggregate.mock.calls[0][0] as any[];
    expect(pipeline.find((s: any) => '$skip' in s).$skip).toBe(0);
    expect(pipeline.find((s: any) => '$limit' in s).$limit).toBe(13);
  });
});

describe('getExportJobs - page/limit sınırlaması', () => {
  it('[DÜZELTME 2026-09-29, BACKLOG C22/GV-01, KASITLI TERS ÇEVRİLDİ] aşırı büyük limit artık 200\'e SIKIŞTIRILIR (eskiden ham değer $limit\'e doğrudan gidiyordu)', async () => {
    await makeService({ limit: 500000, page: 1 }).getExportJobs();
    const pipeline = aggregate.mock.calls[0][0] as any[];
    expect(pipeline.find((s: any) => '$limit' in s).$limit).toBe(200);
  });

  it('[MEVCUT DAVRANIŞ] page/limit verilmezse varsayılan sayfa 1 / limit 13', async () => {
    const res = await makeService({}).getExportJobs();
    expect(res.pagination).toMatchObject({ page: 1, limit: 13 });
  });
});

describe('getImportJobs - page/limit sınırlaması', () => {
  it('[DÜZELTME 2026-09-29, BACKLOG C22/GV-01, KASITLI TERS ÇEVRİLDİ] aşırı büyük limit artık 200\'e SIKIŞTIRILIR (eskiden ham değer .limit()\'e doğrudan gidiyordu)', async () => {
    await makeService({ limit: 1000000, page: 1 }).getImportJobs();
    expect(findChain.limit).toHaveBeenCalledWith(200);
  });

  it('[DÜZELTME 2026-09-29, BACKLOG C22/GV-01, KASITLI TERS ÇEVRİLDİ] page=0 artık 1\'e SIKIŞTIRILIR -> .skip(0) (eskiden negatif .skip() çağrılıyordu)', async () => {
    await makeService({ limit: 10, page: 0 }).getImportJobs();
    expect(findChain.skip).toHaveBeenCalledWith(0);
  });

  it('[MEVCUT DAVRANIŞ] page/limit verilmezse varsayılan sayfa 1 / limit 10', async () => {
    const res = await makeService({}).getImportJobs();
    expect(res.pagination).toMatchObject({ page: 1, limit: 10 });
    expect(findChain.limit).toHaveBeenCalledWith(10);
    expect(findChain.skip).toHaveBeenCalledWith(0);
  });
});
