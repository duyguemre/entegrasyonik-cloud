// ADR-0035 / MCP-1: `OAuthStore`'un ApplicationDB (Mongo) uygulamasi. Kod tuketimi ve refresh rotasyonu tek atomik `findOneAndUpdate`'tir
// (ADR-0010 madde 7): yarista ikinci cagri yeniden kullanim sayilir. Belirtec/kod DUZ saklanmaz (yalniz SHA-256 ozeti; cagiran hash'ler).
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { summarizeHeads, type ConsumeCodeResult, type OAuthClientRecord, type OAuthCodeRecord, type OAuthFamilySummary, type OAuthRefreshRecord, type OAuthStore, type RevokedBy } from './store';

async function db() { return DatabaseManagerInstance.getApplicationDB(); }

export class MongoOAuthStore implements OAuthStore {
    async insertClient(c: OAuthClientRecord): Promise<void> {
        await (await db()).getOAuthClientModel().create(c);
    }
    async getClient(clientId: string): Promise<OAuthClientRecord | null> {
        return (await (await db()).getOAuthClientModel().findOne({ clientId }).lean()) as OAuthClientRecord | null;
    }
    async markClientGranted(clientId: string, at: Date): Promise<void> {
        await (await db()).getOAuthClientModel().updateOne({ clientId }, { $set: { lastGrantAt: at }, $unset: { unusedExpireAt: 1 } });
    }

    async insertCode(c: OAuthCodeRecord): Promise<void> {
        await (await db()).getOAuthAuthCodeModel().create(c);
    }
    async consumeCode(codeHash: string, at: Date): Promise<ConsumeCodeResult> {
        const model = (await db()).getOAuthAuthCodeModel();
        const won = (await model.findOneAndUpdate({ codeHash, usedAt: null }, { $set: { usedAt: at } }).lean()) as OAuthCodeRecord | null;
        if (won) return { kind: 'ok', code: won };
        const existing = (await model.findOne({ codeHash }).lean()) as OAuthCodeRecord | null;
        return existing ? { kind: 'reused', code: existing } : { kind: 'missing' };
    }

    async insertRefresh(r: OAuthRefreshRecord): Promise<void> {
        await (await db()).getOAuthRefreshTokenModel().create(r);
    }
    async getRefresh(tokenHash: string): Promise<OAuthRefreshRecord | null> {
        return (await (await db()).getOAuthRefreshTokenModel().findOne({ tokenHash }).lean()) as OAuthRefreshRecord | null;
    }
    async consumeRefresh(tokenHash: string, at: Date): Promise<boolean> {
        const won = await (await db()).getOAuthRefreshTokenModel()
            .findOneAndUpdate({ tokenHash, usedAt: null, revokedAt: null }, { $set: { usedAt: at, lastUsedAt: at } }).lean();
        return !!won;
    }
    async revokeFamily(familyId: string, by: RevokedBy, at: Date): Promise<number> {
        const r = await (await db()).getOAuthRefreshTokenModel().updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: at, revokedBy: by } });
        return r.modifiedCount ?? 0;
    }
    async isFamilyActive(familyId: string, now: Date): Promise<boolean> {
        const hit = await (await db()).getOAuthRefreshTokenModel().exists({ familyId, revokedAt: null, familyExpiresAt: { $gt: now } });
        return !!hit;
    }
    async revokeBySub(sub: string, by: RevokedBy, at: Date): Promise<number> {
        return this.revokeWhere({ sub }, by, at);
    }
    async revokeByTenant(tid: number, by: RevokedBy, at: Date): Promise<number> {
        return this.revokeWhere({ tid }, by, at);
    }
    async listFamilies(q: { tid: number; sub?: string; familyId?: string }, now: Date): Promise<OAuthFamilySummary[]> {
        // Yalniz GUNCEL uyeler (kullanilmamis + iptal edilmemis + omru dolmamis): aile basina 1 (yarista 2) belge; `lastUsedAt` her yenilemede yeni uyeye tasinir.
        const filter: Record<string, unknown> = { tid: q.tid, revokedAt: null, usedAt: null, familyExpiresAt: { $gt: now }, idleExpiresAt: { $gt: now } };
        if (q.sub) filter.sub = q.sub;
        if (q.familyId) filter.familyId = q.familyId;
        const heads = (await (await db()).getOAuthRefreshTokenModel().find(filter).sort({ createdAt: -1 }).limit(1000).lean()) as unknown as OAuthRefreshRecord[];
        return summarizeHeads(heads);
    }
    private async revokeWhere(filter: Record<string, unknown>, by: RevokedBy, at: Date): Promise<number> {
        const model = (await db()).getOAuthRefreshTokenModel();
        const families: string[] = await model.distinct('familyId', { ...filter, revokedAt: null });
        if (families.length === 0) return 0;
        await model.updateMany({ familyId: { $in: families }, revokedAt: null }, { $set: { revokedAt: at, revokedBy: by } });
        return families.length;
    }
}
