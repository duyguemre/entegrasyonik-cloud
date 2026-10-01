// PRC-R1: bir barkodun buybox durum geçişi — SAF (DB yok). Varyant üzerinde güncel durum (`competition.trendyol`), geçmiş
// `BuyboxSnapshots`'ta seyreltilmiş tutulur (değişince ya da 6 saatte bir). "Buybox kaybedildi" = önceki gözlem `winning`, yeni `losing`.
import type { IBuyboxObservation } from '@interfaces/index';

export type CompetitionStatus = 'winning' | 'losing' | 'not_found';

export interface ChannelCompetitionState {
    status: CompetitionStatus;
    buyboxOrder: number | null;
    buyboxPrice: number | null;
    hasMultipleSeller: boolean | null;
    ownPrice: number | null;
    /** Son okuma (başarılı yanıt) anı. */
    checkedAt: Date;
    /** Durum/sıra/fiyatın son değiştiği an. */
    changedAt: Date;
    /** Son "kaybedildi" geçişi (buybox geri kazanılınca null). */
    lostAt: Date | null;
    lostNotifiedAt: Date | null;
    snapshotAt: Date | null;
}

export const SNAPSHOT_HEARTBEAT_MS = 6 * 3600_000;

export function statusOf(o: IBuyboxObservation): CompetitionStatus {
    if (!o.found || o.buyboxOrder === null) return 'not_found';
    return o.buyboxOrder === 1 ? 'winning' : 'losing';
}

export interface Transition {
    next: ChannelCompetitionState;
    changed: boolean;
    /** winning -> losing geçişi (bildirim adayı). */
    lost: boolean;
    writeSnapshot: boolean;
}

export function transition(prev: Partial<ChannelCompetitionState> | null | undefined, o: IBuyboxObservation, ownPrice: number | null, now: Date): Transition {
    const status = statusOf(o);
    const p = prev ?? null;
    const changed = !p || p.status !== status || (p.buyboxOrder ?? null) !== o.buyboxOrder || (p.buyboxPrice ?? null) !== o.buyboxPrice;
    const lost = p?.status === 'winning' && status === 'losing';
    const lastSnap = p?.snapshotAt ? new Date(p.snapshotAt).getTime() : null;
    const writeSnapshot = changed || lastSnap === null || now.getTime() - lastSnap >= SNAPSHOT_HEARTBEAT_MS;
    const next: ChannelCompetitionState = {
        status, buyboxOrder: o.buyboxOrder, buyboxPrice: o.buyboxPrice, hasMultipleSeller: o.hasMultipleSeller, ownPrice,
        checkedAt: now,
        changedAt: changed ? now : (p?.changedAt ? new Date(p.changedAt) : now),
        lostAt: status === 'winning' ? null : lost ? now : (p?.lostAt ? new Date(p.lostAt) : null),
        lostNotifiedAt: p?.lostNotifiedAt ? new Date(p.lostNotifiedAt) : null,
        snapshotAt: writeSnapshot ? now : (lastSnap !== null ? new Date(lastSnap) : null),
    };
    return { next, changed, lost, writeSnapshot };
}

/** Soğuma: aynı barkod için `cooldownMs` içinde ikinci bildirim yok. */
export function shouldNotifyLost(t: Transition, prevNotifiedAt: Date | null | undefined, cooldownMs: number, now: Date): boolean {
    if (!t.lost) return false;
    if (!prevNotifiedAt) return true;
    return now.getTime() - new Date(prevNotifiedAt).getTime() >= cooldownMs;
}

/** Kanal fiyatımız: kanal bazlı fiyat açıksa `platforms.<kod>.prices.salePrice`, değilse `prices.salePrice` (COM-07 ile aynı kural). */
export function ownChannelPrice(v: any, code: string): number | null {
    const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    return v?.prices?.isPlatformBasedPrice ? n(v?.platforms?.[code]?.prices?.salePrice) : n(v?.prices?.salePrice);
}
