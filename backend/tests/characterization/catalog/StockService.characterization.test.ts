/**
 * CHARACTERIZATION: StockService (backend/src/api/rpc/handlers/stock-service.ts)
 *
 * `getStockOverview` (ana metot) VE tenant izolasyonu ZATEN kapsamlı biçimde
 * `tests/unit/tenant-surface/stock-overview.test.ts`'te sabitlenmiştir (mutlu yol, limit doğrulaması,
 * boş tenant, sızıntı/PII testi, iki-tenant izolasyonu — bkz. o dosya). Bu dosya YALNIZCA o testte
 * kapsanmayan `get()` (IService arayüzü gereği var olan, kullanılmayan no-op) metodunu ve
 * `getStockOverview`'in tenant yokluğundaki (`clientDB` hiç kurulmamış) davranışını tamamlayıcı
 * olarak sabitler (ADR-0016 B-R-T1). DB/Redis/ağ YOK. Kod DEĞİŞTİRİLMEDİ.
 */
import { describe, it, expect, jest } from '@jest/globals';

import StockService from '@api/rpc/handlers/stock-service';

describe('StockService.get (IService no-op)', () => {
  it('[MEVCUT DAVRANIŞ] IService arayüzü gereği tanımlı ama gövdesi boş: her zaman undefined döner, hiçbir DB çağrısı yapmaz', async () => {
    const svc: any = new StockService(42, {});
    // clientDB kasıtlı olarak KURULMADI: get() DB'ye hiç dokunmadığını kanıtlamak için
    await expect(svc.get()).resolves.toBeUndefined();
  });
});

describe('StockService.getStockOverview: clientDB kurulmamışsa (init edilmemiş servis)', () => {
  it('[MEVCUT DAVRANIŞ] this.clientDB undefined ise 400 "Tenant bulunamadı." (ApplicationError); hiçbir sorgu çalışmaz', async () => {
    const svc: any = new StockService(0 as any, {});
    await expect(svc.getStockOverview()).rejects.toMatchObject({ statusCode: 400, message: 'Tenant bulunamadı.' });
  });
});

describe('StockService: tenant izolasyonu — clientDB seçimi dışında hiçbir tenant sinyali yok', () => {
  it('[MEVCUT DAVRANIŞ] clientId constructor\'a verilir ama getStockOverview sorgularının HİÇBİRİNDE kullanılmaz (izolasyon tamamen this.clientDB seçimine dayanır)', async () => {
    const orderModel = { aggregate: jest.fn(async () => []) };
    const variantModel = { aggregate: jest.fn(async () => []), countDocuments: jest.fn(async () => 0) };
    const svc: any = new StockService(999, {});
    svc.clientDB = { getOrderModel: () => orderModel, getVariantModel: () => variantModel };
    await svc.getStockOverview();
    const allCalls = JSON.stringify([...orderModel.aggregate.mock.calls, ...variantModel.aggregate.mock.calls, ...variantModel.countDocuments.mock.calls]);
    expect(allCalls).not.toMatch(/999/);
    expect(allCalls).not.toMatch(/clientId/i);
  });
});
