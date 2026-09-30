// ADR-0029 Karar 4 (NB5): e-posta yeniden deneme politikasi (saf).
// Gecici hata sonrasi bekleme: 1 dk -> 5 dk -> 30 dk -> 2 sa -> 12 sa; ilk deneme + 5 yeniden deneme = en fazla 6 deneme,
// 6. basarisizlikta `dead` (olu mektup). Kalici hata (5xx / gecersiz adres) dogrudan `dead`.
const MIN = 60_000;
export const RETRY_DELAYS_MS: readonly number[] = [1 * MIN, 5 * MIN, 30 * MIN, 120 * MIN, 720 * MIN];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export type RetryDecision = { action: 'retry'; nextAttemptAt: Date } | { action: 'dead'; reason: 'permanent' | 'max_attempts' };

/** `attempts`: bu basarisiz deneme DAHIL toplam deneme sayisi (>=1). */
export function decideAfterFailure(kind: 'transient' | 'permanent', attempts: number, now: Date): RetryDecision {
    if (kind === 'permanent') return { action: 'dead', reason: 'permanent' };
    if (attempts >= MAX_ATTEMPTS) return { action: 'dead', reason: 'max_attempts' };
    return { action: 'retry', nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[attempts - 1]) };
}
