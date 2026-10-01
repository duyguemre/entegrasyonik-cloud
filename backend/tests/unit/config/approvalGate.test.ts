import { describe, it, expect } from '@jest/globals';
import { assertApprovalSatisfied, ApprovalRequiredError } from '@integration/config/approvalGate';

const base = { target: 'trendyol', publishedBy: 'admin-1', twoPersonRuleEnabled: false };

describe('ADR-0020 Karar 3.2/9.1 — assertApprovalSatisfied', () => {
    it('safe: gerekçe/onay gerekmez', () => {
        expect(() => assertApprovalSatisfied({ ...base, danger: 'safe' })).not.toThrow();
    });

    it('caution: gerekçe <15 karakter reddedilir; >=15 kabul edilir', () => {
        expect(() => assertApprovalSatisfied({ ...base, danger: 'caution', reason: 'kısa' })).toThrow(ApprovalRequiredError);
        expect(() => assertApprovalSatisfied({ ...base, danger: 'caution', reason: 'yeterince uzun bir gerekçe metni' })).not.toThrow();
    });

    it('caution: 500 karakteri aşan gerekçe reddedilir', () => {
        expect(() => assertApprovalSatisfied({ ...base, danger: 'caution', reason: 'x'.repeat(501) })).toThrow(ApprovalRequiredError);
    });

    it('dangerous: gerekçe yeterli ama yazılı onay (hedef kodu) eksikse reddedilir', () => {
        expect(() => assertApprovalSatisfied({ ...base, danger: 'dangerous', reason: 'yeterince uzun bir gerekçe metni buraya' }))
            .toThrow(/yazarak onaylamalısınız/);
    });

    it('dangerous: yazılı onay hedef koduna TAM eşit değilse reddedilir', () => {
        expect(() => assertApprovalSatisfied({ ...base, danger: 'dangerous', reason: 'yeterince uzun bir gerekçe metni buraya', typedConfirmation: 'Trendyol' }))
            .toThrow(ApprovalRequiredError);
    });

    it('dangerous: gerekçe + doğru yazılı onay ile (iki kişi kuralı KAPALI) kabul edilir', () => {
        expect(() => assertApprovalSatisfied({ ...base, danger: 'dangerous', reason: 'yeterince uzun bir gerekçe metni buraya', typedConfirmation: 'trendyol' }))
            .not.toThrow();
    });

    it('dangerous + iki kişi kuralı AÇIK: approvedBy eksikse reddedilir', () => {
        expect(() => assertApprovalSatisfied({ ...base, twoPersonRuleEnabled: true, danger: 'dangerous', reason: 'yeterince uzun bir gerekçe metni buraya', typedConfirmation: 'trendyol' }))
            .toThrow(/ikinci bir platformAdmin/);
    });

    it('dangerous + iki kişi kuralı AÇIK: approvedBy yayınlayanla AYNI kişi ise reddedilir', () => {
        expect(() => assertApprovalSatisfied({ ...base, twoPersonRuleEnabled: true, danger: 'dangerous', reason: 'yeterince uzun bir gerekçe metni buraya', typedConfirmation: 'trendyol', approvedBy: 'admin-1' }))
            .toThrow(/AYNI kişi olamaz/);
    });

    it('dangerous + iki kişi kuralı AÇIK: farklı bir approvedBy ile kabul edilir', () => {
        expect(() => assertApprovalSatisfied({ ...base, twoPersonRuleEnabled: true, danger: 'dangerous', reason: 'yeterince uzun bir gerekçe metni buraya', typedConfirmation: 'trendyol', approvedBy: 'admin-2' }))
            .not.toThrow();
    });

    it('dangerous + iki kişi kuralı KAPALI (varsayılan): approvedBy verilmese de yayın engellenmez (regresyon: bayrağın varsayılan kapalı davranışı bozulmasın)', () => {
        expect(() => assertApprovalSatisfied({ ...base, twoPersonRuleEnabled: false, danger: 'dangerous', reason: 'yeterince uzun bir gerekçe metni buraya', typedConfirmation: 'trendyol' }))
            .not.toThrow();
    });
});
