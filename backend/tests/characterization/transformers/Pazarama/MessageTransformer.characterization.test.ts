// Protokol 13 karakterizasyon: Pazarama `MessageTransformer` (soru/mesaj dönüşümü). ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect } from '@jest/globals';
import { MessageTransformer } from '@integration/modules/marketplace/pazarama/transformers/MessageTransformer';

describe('Pazarama MessageTransformer.toInternalMessages — sarmalayıcı anahtarları (karakterizasyon)', () => {
    const m = new MessageTransformer();

    it('ApprovalAnswersByMerchant anahtarını okur', () => {
        const res = m.toInternalMessages({ ApprovalAnswersByMerchant: [{ QuestionId: 1, Question: 'Soru?' }] });
        expect(res).toHaveLength(1);
        expect(res[0].externalMessageId).toBe('1');
    });

    it('approvalAnswersByMerchant (camelCase) anahtarını okur', () => {
        const res = m.toInternalMessages({ approvalAnswersByMerchant: [{ questionId: 2 }] });
        expect(res).toHaveLength(1);
    });

    it('ApprovalAnswersByMerchantSearchs / approvalAnswersByMerchantSearchs anahtarlarını da okur', () => {
        expect(m.toInternalMessages({ ApprovalAnswersByMerchantSearchs: [{ QuestionId: 3 }] })).toHaveLength(1);
        expect(m.toInternalMessages({ approvalAnswersByMerchantSearchs: [{ questionId: 4 }] })).toHaveLength(1);
    });

    it('hiçbir anahtar yoksa boş dizi', () => {
        expect(m.toInternalMessages({})).toEqual([]);
    });
});

describe('Pazarama MessageTransformer.toInternalMessage — alan eşlemeleri (karakterizasyon)', () => {
    const m = new MessageTransformer();

    it('PascalCase alanları eşler; type her zaman PRODUCT_QUESTION sabittir', () => {
        const msg = m.toInternalMessage({
            QuestionId: 10, MaskedUserName: 'A***', QuestionStatus: 1, Question: 'Soru metni', Answer: 'Cevap metni',
            ProductName: 'Ürün', ProductImageUrl: 'img.jpg', Barcode: 'BC1', Brand: 'Marka1',
            QuestionDate: '2026-01-01T00:00:00.000Z', AnswerDate: '2026-01-02T00:00:00.000Z',
        });
        expect(msg).toMatchObject({
            integrationCode: 'pazarama', externalMessageId: '10', threadId: '10', externalUserName: 'A***',
            type: 'PRODUCT_QUESTION', status: 'ANSWERED', direction: 'INBOUND', text: 'Soru metni', answer: 'Cevap metni',
            context: { productName: 'Ürün', imageUrl: 'img.jpg', barcode: 'BC1', brand: 'Marka1' }, isRejected: false,
        });
        expect(msg.date).toEqual(new Date('2026-01-01T00:00:00.000Z'));
        expect(msg.answeredAt).toEqual(new Date('2026-01-02T00:00:00.000Z'));
    });

    it('camelCase alanları da kabul eder (PascalCase yoksa)', () => {
        const msg = m.toInternalMessage({ questionId: 11, maskedUserName: 'B***', questionStatus: 0, question: 'q', answer: 'a' });
        expect(msg.externalUserName).toBe('B***');
        expect(msg.status).toBe('WAITING_SELLER');
    });

    it('externalUserName yoksa "Müşteri" varsayılır; text/answer yoksa boş string', () => {
        const msg = m.toInternalMessage({ QuestionId: 12 });
        expect(msg.externalUserName).toBe('Müşteri');
        expect(msg.text).toBe('');
        expect(msg.answer).toBe('');
    });

    it('QuestionDate yoksa date "şimdi"ye düşer; AnswerDate yoksa answeredAt undefined', () => {
        const msg = m.toInternalMessage({ QuestionId: 13 });
        expect(msg.date).toBeInstanceOf(Date);
        expect(msg.answeredAt).toBeUndefined();
    });

    it.each([
        [0, 'WAITING_SELLER'],
        [1, 'ANSWERED'],
        [2, 'WAITING_APPROVAL'],
        [3, 'REJECTED'],
        [99, 'WAITING_SELLER'], // bilinmeyen sayısal kod -> sessizce WAITING_SELLER
        ['1', 'ANSWERED'], // string sayı da Number() ile çözülür
    ])('mapStatus(%s) -> %s', (status, expected) => {
        const msg = m.toInternalMessage({ QuestionId: 1, QuestionStatus: status });
        expect(msg.status).toBe(expected);
    });

    it('isRejected HAM statü değeri === 3 ise true olur (mapStatus\'tan BAĞIMSIZ ayrı bir hesap — statü metni REJECTED olmasa bile isRejected tutarlı kalır çünkü aynı kaynaktan türetiliyor)', () => {
        const msg = m.toInternalMessage({ QuestionId: 1, QuestionStatus: 3 });
        expect(msg.isRejected).toBe(true);
        expect(msg.status).toBe('REJECTED');
    });

    it('rawMetadata ham öğeyi olduğu gibi taşır (spread kopya, referans DEĞİL)', () => {
        const raw = { QuestionId: 1, extra: 'x' };
        const msg = m.toInternalMessage(raw);
        expect(msg.rawMetadata).toEqual(raw);
        expect(msg.rawMetadata).not.toBe(raw);
    });
});
