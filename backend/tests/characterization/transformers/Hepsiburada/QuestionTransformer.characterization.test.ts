// Protokol 13 karakterizasyon: Hepsiburada `QuestionMapper` (soru/mesaj dönüşümü). ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect } from '@jest/globals';
import { QuestionMapper } from '@integration/modules/marketplace/hepsiburada/transformers/QuestionTransformer';

describe('Hepsiburada QuestionMapper.toInternalMessages — karakterizasyon', () => {
    const m = new QuestionMapper();

    it('rawResponse.items varsa oradan okur; orderNumber varsa ORDER_QUESTION, yoksa PRODUCT_QUESTION', () => {
        const res = m.toInternalMessages({
            items: [
                { id: 1, orderNumber: 'O1', text: 'Soru1', answer: 'Cevap1', customerName: 'Ali', creationDate: '2026-01-01T00:00:00.000Z', answerDate: '2026-01-02T00:00:00.000Z', status: 'Answered', productName: 'P1', productSku: 'SKU-1' },
                { id: 2, text: 'Soru2', status: 'WaitingForAnswer', creationDate: '2026-01-01T00:00:00.000Z' },
            ],
        });
        expect(res).toHaveLength(2);
        expect(res[0]).toMatchObject({
            integrationCode: 'hepsiburada', externalMessageId: '1', type: 'ORDER_QUESTION', status: 'ANSWERED',
            direction: 'INBOUND', text: 'Soru1', answer: 'Cevap1', externalUserName: 'Ali',
            context: { orderNumber: 'O1', productName: 'P1', barcode: 'SKU-1' },
        });
        expect(res[0].date).toEqual(new Date('2026-01-01T00:00:00.000Z'));
        expect(res[0].answeredAt).toEqual(new Date('2026-01-02T00:00:00.000Z'));
        expect(res[1].type).toBe('PRODUCT_QUESTION');
        expect(res[1].status).toBe('WAITING_SELLER');
        expect(res[1].answeredAt).toBeUndefined();
    });

    it('rawResponse dizi ise doğrudan işlenir (items sarmalayıcısı olmadan)', () => {
        const res = m.toInternalMessages([{ id: 9, text: 'Direkt dizi', creationDate: '2026-01-01T00:00:00.000Z' }]);
        expect(res).toHaveLength(1);
        expect(res[0].externalMessageId).toBe('9');
    });

    it('rawResponse ne items ne dizi ise boş dizi döner', () => {
        expect(m.toInternalMessages({})).toEqual([]);
    });

    it.each([
        ['WaitingForAnswer', 'WAITING_SELLER'],
        ['Answered', 'ANSWERED'],
        ['Closed', 'REJECTED'],
        ['BilinmeyenDurum', 'WAITING_SELLER'], // bilinmeyen -> sessizce WAITING_SELLER
        [undefined, 'WAITING_SELLER'],
    ])('mapStatus("%s") -> %s', (status, expected) => {
        const res = m.toInternalMessages({ items: [{ id: 1, status, creationDate: '2026-01-01T00:00:00.000Z' }] });
        expect(res[0].status).toBe(expected);
    });

    // [DÜZELTİLDİ, 2026-09-29, orkestratör] `date` alanı `item.creationDate` YOKSA ÖNCEDEN `new Date(undefined)`
    // = Invalid Date üretiyordu. Kardeş dönüştürücülerin (Order/Claim, AYNI dosyadaki `answeredAt`) "yoksa şimdi"
    // korumasıyla TUTARLI hale getirildi.
    it('[DÜZELTİLDİ] creationDate eksikse date alanı artık "şimdi" olur (kardeş dönüştürücülerle TUTARLI), Invalid Date DEĞİL', () => {
        const res = m.toInternalMessages({ items: [{ id: 1, text: 'x' }] });
        expect(res[0].date).toBeInstanceOf(Date);
        expect(isNaN(res[0].date.getTime())).toBe(false);
    });

    it('rawMetadata ham öğeyi olduğu gibi taşır', () => {
        const raw = { id: 1, creationDate: '2026-01-01T00:00:00.000Z', extra: 'x' };
        const res = m.toInternalMessages({ items: [raw] });
        expect(res[0].rawMetadata).toBe(raw);
    });
});
