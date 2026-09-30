// ADR-0029 Karar 4/5 (NB5): tek tik abonelikten cikma. Belirtec dogrulanir (sabit-zamanli), kategori e-posta tercihi `off` yapilir.
// Zorunlu (tamami mandatory) kategori kapatilamaz. Yalniz e-posta kanali kapanir; uygulama ici bildirim aynen kalir.
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '../catalog.types';
import { categoryLocks } from '../preferences';
import { UNSUB_ALL, verifyUnsubscribeToken } from './unsubscribeToken';

export interface PreferencesWriter { updateOne(filter: any, update: any, opts?: any): Promise<any> }

export type UnsubscribeOutcome =
    | { status: 'ok'; category: string }
    | { status: 'mandatory'; category: string }
    | { status: 'invalid' }
    | { status: 'expired' };

export interface UnsubscribeDeps { secret?: string; prefs: PreferencesWriter; now?(): Date }

function plan(category: string): { targets: NotificationCategory[] } | { mandatory: true } | { invalid: true } {
    const locks = categoryLocks();
    if (category === UNSUB_ALL) return { targets: locks.filter((l) => !l.locked).map((l) => l.category) };
    if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(category)) return { invalid: true };
    const lock = locks.find((l) => l.category === category);
    if (lock?.locked) return { mandatory: true };
    return { targets: [category as NotificationCategory] };
}

/** Yazmadan dogrular (GET onay sayfasi). */
export function previewUnsubscribe(token: unknown, deps: Pick<UnsubscribeDeps, 'secret' | 'now'>): UnsubscribeOutcome {
    const v = verifyUnsubscribeToken(deps.secret, token, deps.now ? deps.now() : new Date());
    if (!v.ok) return v.reason === 'expired' ? { status: 'expired' } : { status: 'invalid' };
    const p = plan(v.payload.category);
    if ('invalid' in p) return { status: 'invalid' };
    if ('mandatory' in p) return { status: 'mandatory', category: v.payload.category };
    return { status: 'ok', category: v.payload.category };
}

/** Tercihi kapatir (POST). Idempotent: tekrar ayni sonucu verir. */
export async function applyUnsubscribe(token: unknown, deps: UnsubscribeDeps): Promise<UnsubscribeOutcome> {
    const now = deps.now ? deps.now() : new Date();
    const v = verifyUnsubscribeToken(deps.secret, token, now);
    if (!v.ok) return v.reason === 'expired' ? { status: 'expired' } : { status: 'invalid' };
    const p = plan(v.payload.category);
    if ('invalid' in p) return { status: 'invalid' };
    if ('mandatory' in p) return { status: 'mandatory', category: v.payload.category };
    const set: Record<string, unknown> = { updatedAt: now, updatedBy: 'unsubscribe' };
    for (const c of p.targets) set[`matrix.${c}.email`] = 'off';
    await deps.prefs.updateOne({ tid: v.payload.tid, userId: v.payload.userId }, { $set: set }, { upsert: true });
    return { status: 'ok', category: v.payload.category };
}
