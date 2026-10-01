/**
 * CHARACTERIZATION (tamamlayıcı): SmartService.get() — backend/src/api/rpc/handlers/smart-service.ts.
 * `unifiedSearch` VE dört özel arama metodu zaten `SmartService.characterization.test.ts`'te kapsamlıdır
 * (ADR-0021). Bu dosya YALNIZCA o dosyada test edilmeyen `get()` (IService arayüzü gereği var olan,
 * kullanılmayan) metodunu tamamlar (ADR-0016 B-R-T3). DB/Redis/ağ YOK. Kod DEĞİŞTİRİLMEDİ.
 */
import { describe, it, expect } from '@jest/globals';

import SmartService from '@api/rpc/handlers/smart-service';

describe('SmartService.get (IService arayüzü — kullanılmıyor)', () => {
  it('[MEVCUT DAVRANIŞ] her çağrıda "Method not implemented." hatası fırlatır; clientDB\'ye hiç dokunmaz', async () => {
    const svc: any = new SmartService(42, {}); // clientDB kasıtlı kurulmadı
    await expect(svc.get()).rejects.toThrow('Method not implemented.');
  });
});
