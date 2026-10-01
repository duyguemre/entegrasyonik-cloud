// Protokol 13 karakterizasyon: Pazarama `FinancialMapper` (finansal işlem + kargo faturası dönüşümü).
// ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect } from '@jest/globals';
import { FinancialMapper } from '@integration/modules/marketplace/pazarama/transformers/FinancialMapper';
import { UniversalTransactionType, CargoShipmentType } from '@interfaces/platforms';

describe('Pazarama FinancialMapper.toInternalTransactions — karakterizasyon', () => {
    const m = new FinancialMapper();

    it('rawData.transactionList sarmalayıcısını okur; satış (iade değil) ise amount credit\'e, commission debt\'e yazılır', () => {
        const [tx] = m.toInternalTransactions({ transactionList: [{ trxId: 'T1', orderId: 'O1', amount: 100, commissionAmount: 10, allowanceAmount: 90, status: 'Satış', transactionDate: '2026-01-01T00:00:00.000Z', transferredDate: '2026-01-05T00:00:00.000Z', trxCode: 'CODE1', commissionRate: 5 }] });
        expect(tx).toMatchObject({ integrationCode: 'pazarama', externalId: 'T1', orderNumber: 'O1', credit: 100, debt: 10, netAmount: 90, commissionAmount: 10, commissionRate: 5, description: 'CODE1', platformType: 'Satış' });
        expect(tx.transactionType).toBe(UniversalTransactionType.SALE);
        expect(tx.transactionDate).toEqual(new Date('2026-01-01T00:00:00.000Z'));
        expect(tx.payoutDate).toEqual(new Date('2026-01-05T00:00:00.000Z'));
    });

    it('status metninde küçük harf "iade"/"return" geçiyorsa isReturn=true: amount debt\'e yazılır, credit 0 olur', () => {
        const [tx] = m.toInternalTransactions({ transactionList: [{ trxId: 'T2', amount: 50, status: 'iade işlemi' }] });
        expect(tx.debt).toBe(50);
        expect(tx.credit).toBe(0);
    });

    // ŞÜPHELİ DAVRANIŞ (BACKLOG'a eklendi — potansiyel gerçek veri hatası): `.toLowerCase()` (yerel-duyarsız,
    // Türkçe DEĞİL) kullanılıyor. JS'in varsayılan (Türkçe olmayan) `toLowerCase()`'i Türkçe büyük "İ" harfini
    // düz "i"ye değil, "i" + birleşen nokta (U+0307) dizisine çevirir — bu yüzden platform "İade..." gibi BÜYÜK
    // harfle başlayan bir statü metni gönderirse `.includes('iade')` YANLIŞ (false) döner ve işlem sessizce
    // SATIŞ (credit) olarak sınıflandırılır, oysa gerçekte bir İADE'dir. Gerçek Pazarama yanıtlarının hangi
    // harf biçimini kullandığı doğrulanmadan bunun üretimde gerçek bir sınıflandırma hatasına yol açıp
    // açmadığı bilinmiyor — BUGÜNKÜ davranış (yanlış sınıflandırma) sabitlendi, düzeltilmedi.
    it('[BACKLOG-adayı] status "İade" (Türkçe büyük İ) ile BAŞLARSA .toLowerCase() Türkçe-duyarsız olduğundan "iade" ile EŞLEŞMEZ; işlem yanlışlıkla SATIŞ (credit) sayılır', () => {
        const [tx] = m.toInternalTransactions({ transactionList: [{ trxId: 'T2b', amount: 50, status: 'İade İşlemi' }] });
        expect(tx.debt).toBe(0);
        expect(tx.credit).toBe(50);
    });

    it('{ data: { transactionList: [...] } } sarmalayıcısı da okunur; doğrudan dizi de kabul edilir', () => {
        expect(m.toInternalTransactions({ data: { transactionList: [{ trxId: 'T3' }] } })).toHaveLength(1);
        expect(m.toInternalTransactions([{ trxId: 'T4' }])).toHaveLength(1);
    });

    it('{ items: [...] } veya { content: [...] } da kabul edilir (transactionList/data yoksa)', () => {
        expect(m.toInternalTransactions({ items: [{ trxId: 'T5' }] })).toHaveLength(1);
        expect(m.toInternalTransactions({ content: [{ trxId: 'T6' }] })).toHaveLength(1);
    });

    it('trxId yoksa id kullanılır; transactionDate yoksa "şimdi"ye düşer (Date örneği)', () => {
        const [tx] = m.toInternalTransactions({ transactionList: [{ id: 'ID-1' }] });
        expect(tx.externalId).toBe('ID-1');
        expect(tx.transactionDate).toBeInstanceOf(Date);
        expect(tx.payoutDate).toBeUndefined();
    });

    it.each([
        ['satış tamamlandı', UniversalTransactionType.SALE],
        ['sale completed', UniversalTransactionType.SALE],
        ['iade edildi', UniversalTransactionType.RETURN],
        ['return processed', UniversalTransactionType.RETURN],
        ['ödeme yapıldı', UniversalTransactionType.PAYOUT],
        ['payout done', UniversalTransactionType.PAYOUT],
        ['bilinmeyen tip', UniversalTransactionType.CORRECTION], // bilinmeyen -> CORRECTION (sessizce)
        [undefined, UniversalTransactionType.CORRECTION],
    ])('mapToUniversalType("%s") -> %s', (status, expected) => {
        const [tx] = m.toInternalTransactions({ transactionList: [{ trxId: 'X', status }] });
        expect(tx.transactionType).toBe(expected);
    });
});

describe('Pazarama FinancialMapper.toInternalCargoInvoices — karakterizasyon', () => {
    const m = new FinancialMapper();

    it('doğrudan dizi veya { items }/{ content } sarmalayıcısını okur; invoiceNumber parametre olarak eklenir', () => {
        const direct = m.toInternalCargoInvoices([{ orderNumber: 'O1', packageId: 'P1', desi: 2, amount: 15, transactionDate: '2026-01-01T00:00:00.000Z' }], 'INV-1');
        expect(direct[0]).toMatchObject({ integrationCode: 'pazarama', invoiceNumber: 'INV-1', orderNumber: 'O1', packageId: 'P1', shipmentType: CargoShipmentType.FORWARD, desi: 2, amount: 15 });
        expect(m.toInternalCargoInvoices({ items: [{ orderNumber: 'O2' }] }, 'INV-2')).toHaveLength(1);
        expect(m.toInternalCargoInvoices({ content: [{ orderNumber: 'O3' }] }, 'INV-3')).toHaveLength(1);
    });

    it('desi/amount yoksa 0; transactionDate yoksa "şimdi"', () => {
        const [inv] = m.toInternalCargoInvoices([{}], 'INV-4');
        expect(inv.desi).toBe(0);
        expect(inv.amount).toBe(0);
        expect(inv.transactionDate).toBeInstanceOf(Date);
        expect(inv.orderNumber).toBe('');
    });
});
