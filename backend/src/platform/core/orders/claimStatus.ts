import { ClaimInternalStatusEnum } from '@interfaces/claim';

// İade (Claim) durum yardımcıları — saf, tek kaynak (WP6-kalan: D-TY-6 kalem düzeyi durum, F-P1-9 sync güncellemesi).
// Adaptörler kalem durumlarını üretir; iade düzeyi durum buradaki birleştirme kuralıyla türetilir.
// ClaimRepository `resolvedAt`/`history` kararlarını da buradan alır (platform zamanı, tespit anı değil).

/** Dosyanın kapandığı durumlar: `resolvedAt` yalnız bunlarda doldurulur. DISPUTED açık sayılır (itiraz sürüyor). */
const TERMINAL: ReadonlySet<ClaimInternalStatusEnum> = new Set([
    ClaimInternalStatusEnum.APPROVED,
    ClaimInternalStatusEnum.REJECTED,
    ClaimInternalStatusEnum.CANCELLED,
    ClaimInternalStatusEnum.COMPLETED,
]);

export function isTerminalClaimStatus(status: ClaimInternalStatusEnum | string | undefined | null): boolean {
    return !!status && TERMINAL.has(status as ClaimInternalStatusEnum);
}

/**
 * Kalem durumlarından iade düzeyi durum.
 * Kural: satıcıdan iş bekleyen/açık bir kalem varsa iade açıktır — öncelik DISPUTED > UNDER_REVIEW > WAITING.
 * Tüm kalemler kapalıysa: hepsi COMPLETED → COMPLETED; en az bir kabul (APPROVED/COMPLETED) → APPROVED
 * (kısmi kabul: para iadesi en az bir kalemde var); yoksa en az bir REJECTED → REJECTED; aksi CANCELLED.
 * Boş liste → WAITING (çağıranın güvenli varsayılanı).
 */
export function aggregateClaimStatus(statuses: ReadonlyArray<ClaimInternalStatusEnum>): ClaimInternalStatusEnum {
    if (!statuses.length) return ClaimInternalStatusEnum.WAITING;
    const has = (s: ClaimInternalStatusEnum) => statuses.includes(s);
    if (has(ClaimInternalStatusEnum.DISPUTED)) return ClaimInternalStatusEnum.DISPUTED;
    if (has(ClaimInternalStatusEnum.UNDER_REVIEW)) return ClaimInternalStatusEnum.UNDER_REVIEW;
    if (has(ClaimInternalStatusEnum.WAITING)) return ClaimInternalStatusEnum.WAITING;
    if (statuses.every(s => s === ClaimInternalStatusEnum.COMPLETED)) return ClaimInternalStatusEnum.COMPLETED;
    if (has(ClaimInternalStatusEnum.APPROVED) || has(ClaimInternalStatusEnum.COMPLETED)) return ClaimInternalStatusEnum.APPROVED;
    if (has(ClaimInternalStatusEnum.REJECTED)) return ClaimInternalStatusEnum.REJECTED;
    return ClaimInternalStatusEnum.CANCELLED;
}

export interface ClaimSyncState {
    internalStatus?: ClaimInternalStatusEnum | string;
    resolvedAt?: Date | null;
}

export interface ClaimSyncIncoming {
    internalStatus: ClaimInternalStatusEnum;
    externalStatus: string;
    resolvedAt?: Date;
    externalUpdatedAt?: Date;
}

export interface ClaimSyncDecision {
    /** Durum değiştiyse eklenecek tarihçe satırı (platform zamanı; yoksa tespit anı). */
    historyEntry?: { status: ClaimInternalStatusEnum; changedAt: Date; description: string; actionBy: 'PLATFORM' };
    /** `$set` edilecek çözüm zamanı; `null` → `$unset` (iade yeniden açıldı); `undefined` → dokunma. */
    resolvedAt?: Date | null;
}

/**
 * Var olan bir iade için sync kararı (F-P1-9). Saf: `now` dışarıdan.
 * - Durum değiştiyse `history`'ye PLATFORM satırı (eskiden `history` yalnız `$setOnInsert` idi → değişimler kayboluyordu).
 * - `resolvedAt`: adaptör verdiyse o; kapanış durumuna ilk geçişte platform güncelleme zamanı; açık duruma dönüşte silinir.
 */
export function decideClaimSync(existing: ClaimSyncState, incoming: ClaimSyncIncoming, now: Date): ClaimSyncDecision {
    const decision: ClaimSyncDecision = {};
    const at = incoming.externalUpdatedAt ?? now;
    if (existing.internalStatus !== incoming.internalStatus) {
        decision.historyEntry = {
            status: incoming.internalStatus,
            changedAt: at,
            description: `Pazaryeri durumu güncellendi: ${incoming.externalStatus}`,
            actionBy: 'PLATFORM',
        };
    }
    if (incoming.resolvedAt) {
        decision.resolvedAt = incoming.resolvedAt;
    } else if (isTerminalClaimStatus(incoming.internalStatus)) {
        if (!existing.resolvedAt || !isTerminalClaimStatus(existing.internalStatus)) decision.resolvedAt = at;
    } else if (existing.resolvedAt) {
        decision.resolvedAt = null;
    }
    return decision;
}

/** Yeni iade için çözüm zamanı: adaptör verdiyse o; kapalı durumda gelmişse platform zamanı (yoksa tespit anı). */
export function initialResolvedAt(incoming: ClaimSyncIncoming, now: Date): Date | undefined {
    if (incoming.resolvedAt) return incoming.resolvedAt;
    return isTerminalClaimStatus(incoming.internalStatus) ? (incoming.externalUpdatedAt ?? now) : undefined;
}
