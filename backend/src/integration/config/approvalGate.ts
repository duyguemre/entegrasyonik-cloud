// ADR-0020 Karar 3.2 adım 3 ("Onay kapısı") + Karar 3.1 (`reason` ≥15 karakter) + Karar 9.1 (iki kişi kuralı).
import type { SettingDanger } from './types';

export class ApprovalRequiredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ApprovalRequiredError';
    }
}

const MIN_REASON_LENGTH = 15;
const MAX_REASON_LENGTH = 500;

export interface ApprovalInput {
    danger: SettingDanger;
    reason?: string;
    /** `dangerous` için zorunlu: hedef kodunu YAZMAK (ADR-0015 `EkConfirmDialog` yıkıcı varyantı, FE kanıtlar; backend yalnız eşitliği kontrol eder). */
    typedConfirmation?: string;
    target: string;
    publishedBy: string;
    /** İki kişi kuralı açıkken `dangerous` yayın için ikinci bir platformAdmin'in kimliği. */
    approvedBy?: string;
    twoPersonRuleEnabled: boolean;
}

/**
 * Onay kapısını kontrol eder; yetersizse `ApprovalRequiredError` fırlatır (çağıran bunu 400/409 zarfına çevirir).
 * `safe`: hiçbir şey gerekmez. `caution`/`dangerous`: gerekçe ≥15 karakter. `dangerous`: EK olarak yazılı onay
 * (hedef kodu birebir) + (bayrak açıksa) ikinci bir platformAdmin onayı (`publishedBy` ≠ `approvedBy`).
 */
export function assertApprovalSatisfied(input: ApprovalInput): void {
    if (input.danger === 'safe') return;

    const reason = (input.reason ?? '').trim();
    if (reason.length < MIN_REASON_LENGTH) {
        throw new ApprovalRequiredError(`Bu değişiklik (${input.danger}) için en az ${MIN_REASON_LENGTH} karakterlik bir gerekçe girilmelidir.`);
    }
    if (reason.length > MAX_REASON_LENGTH) {
        throw new ApprovalRequiredError(`Gerekçe en fazla ${MAX_REASON_LENGTH} karakter olabilir.`);
    }

    if (input.danger !== 'dangerous') return;

    if ((input.typedConfirmation ?? '').trim() !== input.target) {
        throw new ApprovalRequiredError(`Tehlikeli değişiklik için hedef kodunu yazarak onaylamalısınız: '${input.target}'.`);
    }

    if (input.twoPersonRuleEnabled) {
        if (!input.approvedBy) {
            throw new ApprovalRequiredError('İki kişi kuralı açık: tehlikeli değişiklik ikinci bir platformAdmin onayı gerektirir.');
        }
        if (input.approvedBy === input.publishedBy) {
            throw new ApprovalRequiredError('İki kişi kuralı açık: onaylayan, yayınlayanla AYNI kişi olamaz.');
        }
    }
}
