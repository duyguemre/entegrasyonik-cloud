/**
 * BİRİM: orderStatusMapping (backend/src/operations/stock/orderStatusMapping.ts)
 * ADR-0004 Karar 3 — her pazaryerinin KENDİ ham durum değerlerini (marketplace transformer'larından
 * doğrulanmış) ADR'nin 3 kovasına (RESERVED/COMMITTED/RELEASED) eşler. Ham değerler TAHMİN EDİLMEDİ:
 * kaynak `OrderTransformer.ts`/`OrderMapper.ts` dosyalarındaki `mapStatus`/`mapStringStatus`/
 * `mapNumericStatus` fonksiyonlarından birebir okundu (bkz. dosya başındaki JSDoc).
 */
import { describe, it, expect } from '@jest/globals';
import { deriveDesiredAllocationBucket } from '@operations/stock/orderStatusMapping';

describe('deriveDesiredAllocationBucket - trendyol (ham durum: Created/Picking/Invoiced/Shipped/Delivered/Returned/Cancelled/Unsupplied)', () => {
    it.each([
        ['Created', 'RESERVED'],
        ['Picking', 'RESERVED'],
        ['Invoiced', 'RESERVED'],
        ['Shipped', 'COMMITTED'],
        ['Delivered', 'COMMITTED'],
        ['Returned', 'COMMITTED'],
        ['Cancelled', 'RELEASED'],
        ['Unsupplied', 'RELEASED'],
    ])('%s -> %s', (raw, expected) => {
        expect(deriveDesiredAllocationBucket('trendyol', raw, 'UNAPPROVED')).toBe(expected);
    });
});

describe('deriveDesiredAllocationBucket - hepsiburada (ham durum küçük harfe çevrilir, mapStringStatus ile AYNI)', () => {
    it.each([
        ['open', 'RESERVED'],
        ['Open', 'RESERVED'], // büyük/küçük harf duyarsız (kaynak koddaki .toLowerCase() ile TUTARLI)
        ['awaitingApproval', 'RESERVED'],
        ['packaged', 'RESERVED'],
        ['unpacked', 'RESERVED'],
        ['shipped', 'COMMITTED'],
        ['delivered', 'COMMITTED'],
        ['returned', 'COMMITTED'],
        ['cancelledByMerchant', 'RELEASED'],
        ['cancelledByCustomer', 'RELEASED'],
        ['cancelled', 'RELEASED'],
    ])('%s -> %s', (raw, expected) => {
        expect(deriveDesiredAllocationBucket('hepsiburada', raw, 'AWAITING_APPROVAL')).toBe(expected);
    });
});

describe('deriveDesiredAllocationBucket - pazarama (ham durum sayısal kod, mapNumericStatus ile AYNI)', () => {
    it.each([
        ['3', 'RESERVED'], ['12', 'RESERVED'],
        ['5', 'COMMITTED'], ['16', 'COMMITTED'], ['19', 'COMMITTED'], ['11', 'COMMITTED'], ['9', 'COMMITTED'],
        ['7', 'COMMITTED'], ['8', 'COMMITTED'], ['10', 'COMMITTED'],
        ['6', 'RELEASED'], ['18', 'RELEASED'], ['13', 'RELEASED'], ['14', 'RELEASED'],
    ])('%s -> %s', (raw, expected) => {
        expect(deriveDesiredAllocationBucket('pazarama', raw, 'UNAPPROVED')).toBe(expected);
    });
});

describe('deriveDesiredAllocationBucket - n11 (ham durum: Created/Picking/Shipped/Delivered/Cancelled/UnSupplied, resolveStatus ile AYNI)', () => {
    // [ADR-0018 Karar 2a(iii) düzeltmesi, 2026-09-29] TERS ÇEVRİLDİ: ÖNCEKİ davranış (git geçmişi, commit
    // ca6f6b5) N11 için ham durum tablosunun HİÇ tanımlı OLMADIĞINI ve her ham değerin internalStatus
    // yedeğine (her zaman APPROVED->RESERVED) düştüğünü sabitliyordu. `OrderMapper.ts` artık ham SOAP
    // statüsünü işlediği için burada da AYNI kaynak (`n11APISoapREFERANSDOKUMANTASYONU_v9_0.docx` §3.7) ile
    // doğrulanmış bir tablo eklendi.
    it.each([
        ['Created', 'RESERVED'],
        ['Picking', 'RESERVED'],
        ['Shipped', 'COMMITTED'],
        ['Delivered', 'COMMITTED'],
        ['Cancelled', 'RELEASED'],
        ['UnSupplied', 'RELEASED'],
        ['created', 'RESERVED'], // büyük/küçük harf duyarsız (OrderMapper.ts resolveStatus .toLowerCase() ile TUTARLI)
    ])('%s -> %s', (raw, expected) => {
        expect(deriveDesiredAllocationBucket('n11', raw, 'APPROVED')).toBe(expected);
    });
    it('bilinmeyen ham değer (tabloda yok) -> internalStatus yedeğine düşer', () => {
        expect(deriveDesiredAllocationBucket('n11', 'her-hangi-bir-ham-deger', 'APPROVED')).toBe('RESERVED');
    });
    it('"unpacked" -> SKIP_RAW_STATUSES (anlamı doğrulanamadı, kovaya sokulmaz, null döner)', () => {
        expect(deriveDesiredAllocationBucket('n11', 'unpacked', 'APPROVED')).toBeNull();
        expect(deriveDesiredAllocationBucket('n11', 'UnPacked', 'APPROVED')).toBeNull();
    });
});

describe('deriveDesiredAllocationBucket - internalStatus yedeği (bilinmeyen ham değer veya tablo yok)', () => {
    it.each([
        ['UNAPPROVED', 'RESERVED'],
        ['AWAITING_APPROVAL', 'RESERVED'],
        ['APPROVED', 'RESERVED'],
        ['SHIPPED', 'COMMITTED'],
        ['DELIVERED', 'COMMITTED'],
        ['RETURNED', 'COMMITTED'],
        ['CANCELLED', 'RELEASED'],
    ])('internalStatus=%s -> %s (integrationCode tablo dışı)', (internalStatus, expected) => {
        expect(deriveDesiredAllocationBucket('bilinmeyen-pazaryeri', 'her-hangi-bir-deger', internalStatus)).toBe(expected);
    });

    it('trendyol için TANIMSIZ bir ham değer gelirse internalStatus yedeğine düşer', () => {
        expect(deriveDesiredAllocationBucket('trendyol', 'YeniBilinmeyenDurum', 'SHIPPED')).toBe('COMMITTED');
    });
});

describe('deriveDesiredAllocationBucket - hiçbir eşleşme yoksa null (çağıran satırı ATLAR)', () => {
    it('integrationCode/externalStatus/internalStatus hiçbiri eşleşmiyorsa null döner', () => {
        expect(deriveDesiredAllocationBucket('bilinmeyen', 'bilinmeyen', 'BILINMEYEN_DURUM')).toBeNull();
    });
    it('hepsi undefined ise null döner', () => {
        expect(deriveDesiredAllocationBucket(undefined, undefined, undefined)).toBeNull();
    });
});
