// ADR-0026 Karar 4.5: TOTP kaydi depolama sozlesmesi + Mongo uygulamasi (AdminMfa; autoIndex kapali).
// Tum "bir kez" kurallari (yeniden oynatma, kurtarma kodu tek kullanim, etkinlestirme) KOSULLU ATOMIK guncellemedir:
// oku-sonra-yaz yok, iki es zamanli istek ayni adimi/kodu iki kez kullanamaz.
import type { AdminMfaRecord } from './adminMfaTypes';
export type { AdminMfaRecord } from './adminMfaTypes';

export interface AdminMfaStore {
    get(sub: string): Promise<AdminMfaRecord | null>;
    /** Etkin TOTP yoksa bekleyen (dogrulanmamis) sirri yazar/degistirir. Etkinse false. */
    setPending(sub: string, encSecret: string): Promise<boolean>;
    /** Bekleyen sir `encPending` ise ATOMIK etkinlestirir (secret<-pending, enabledAt, lastStep, kurtarma ozetleri). */
    activate(sub: string, encPending: string, step: number, recoveryHashes: string[]): Promise<boolean>;
    /** `lastStep < step` ise `lastStep=step` yazar (yeniden oynatma korumasi). Yazildiysa true. */
    claimStep(sub: string, step: number): Promise<boolean>;
    /** `hash` kullanilmamis bir kurtarma girdisiyse `usedAt` yazar (tek kullanim). Tuketildiyse true. */
    consumeRecovery(sub: string, hash: string, at: Date): Promise<boolean>;
    /** Basarisiz TOTP/kurtarma denemesini sayar; esik asilirsa `lockUntil` koyar. */
    recordFailure(sub: string, max: number, lockMs: number, now: Date): Promise<{ attempts: number; locked: boolean }>;
    clearFailures(sub: string): Promise<void>;
    /** Yalniz bekleyen kaydi/ayni hesabi siler (B12 resetMfa icin; su an admin arayuzu yok). */
    reset(sub: string): Promise<void>;
}

/** `getModel`: uygulama DB'sinin `admin_mfa` modeli (tembel; DB baglantisi ilk kullanimda). */
export function createMongoAdminMfaStore(getModel: () => Promise<any>): AdminMfaStore {
    return {
        async get(sub) { return (await getModel()).findOne({ sub }).lean(); },
        async setPending(sub, encSecret) {
            const m = await getModel();
            const existing = await m.findOne({ sub }, { enabledAt: 1 }).lean();
            if (existing?.enabledAt) return false;
            // Kayit yoksa olusturur (upsert). Tekil `sub` indeksi onayli goc ile gelir; o zamana dek eszamanli ilk kayit
            // yarisi yalniz "iki bekleyen kayit" riskidir (etkinlestirme `pendingSecret` eslesmesi ister, zarar vermez).
            await m.updateOne({ sub, enabledAt: { $exists: false } }, { $set: { pendingSecret: encSecret } }, { upsert: true });
            return true;
        },
        async activate(sub, encPending, step, recoveryHashes) {
            const m = await getModel();
            const r = await m.updateOne(
                { sub, pendingSecret: encPending, enabledAt: { $exists: false } },
                {
                    $set: { secret: encPending, enabledAt: new Date(), lastStep: step, failedAttempts: 0, recoveryHashes: recoveryHashes.map(hash => ({ hash })) },
                    $unset: { pendingSecret: 1, lockUntil: 1 },
                },
            );
            return (r.modifiedCount ?? 0) === 1;
        },
        async claimStep(sub, step) {
            const m = await getModel();
            const r = await m.updateOne({ sub, $or: [{ lastStep: { $lt: step } }, { lastStep: { $exists: false } }] }, { $set: { lastStep: step } });
            return (r.modifiedCount ?? 0) === 1;
        },
        async consumeRecovery(sub, hash, at) {
            const m = await getModel();
            const r = await m.updateOne(
                { sub, recoveryHashes: { $elemMatch: { hash, usedAt: { $exists: false } } } },
                { $set: { 'recoveryHashes.$.usedAt': at } },
            );
            return (r.modifiedCount ?? 0) === 1;
        },
        async recordFailure(sub, max, lockMs, now) {
            const m = await getModel();
            const doc = await m.findOneAndUpdate({ sub }, { $inc: { failedAttempts: 1 } }, { new: true }).lean();
            const attempts = doc?.failedAttempts ?? 0;
            if (attempts >= max) {
                await m.updateOne({ sub }, { $set: { lockUntil: new Date(now.getTime() + lockMs), failedAttempts: 0 } });
                return { attempts, locked: true };
            }
            return { attempts, locked: false };
        },
        async clearFailures(sub) {
            const m = await getModel();
            await m.updateOne({ sub }, { $set: { failedAttempts: 0 }, $unset: { lockUntil: 1 } });
        },
        async reset(sub) { await (await getModel()).deleteOne({ sub }); },
    };
}
