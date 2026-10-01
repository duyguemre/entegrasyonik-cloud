// B12: backend/scripts/reset-admin-mfa.ts -- saf mantik (DB'ye BAGLANMAZ; sahte db). CLI kapilari (yerel host/izinli DB) ortak `_migrationCommon.runCli` testlerinde.
import { describe, it, expect } from '@jest/globals';
import { resetAdminMfa, normalizeTargetEmail, type ResetMfaDbLike } from '../../../../scripts/reset-admin-mfa';

function fakeDb(seed: Record<string, any[]>) {
    const cols: Record<string, any[]> = seed;
    const ops: string[] = [];
    const db: ResetMfaDbLike = {
        collection: (name) => {
            const rows = (cols[name] ??= []);
            return {
                async findOne(f: any) { return rows.find((r) => Object.entries(f).every(([k, v]) => String(r[k]) === String(v))) ?? null; },
                async deleteOne(f: any) { ops.push(`delete:${name}`); const i = rows.findIndex((r) => Object.entries(f).every(([k, v]) => String(r[k]) === String(v))); if (i >= 0) rows.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
                async updateOne(f: any, u: any) {
                    ops.push(`update:${name}`);
                    const d = rows.find((r) => String(r._id) === String(f._id)); if (!d) return { modifiedCount: 0 };
                    for (const [k, v] of Object.entries(u.$set ?? {})) d[k] = v;
                    for (const k of Object.keys(u.$unset ?? {})) delete d[k];
                    for (const [k, v] of Object.entries(u.$inc ?? {})) d[k] = (d[k] ?? 0) + (v as number);
                    return { modifiedCount: 1 };
                },
                async insertOne(doc: any) { ops.push(`insert:${name}`); rows.push(doc); return {}; },
            };
        },
    };
    return { db, cols, ops };
}

const seed = () => ({
    Users: [{ _id: 'u1', email: 'root@example.test', isGlobalAdmin: true, tokenVersion: 2, failedLoginAttempts: 4, lockUntil: new Date() }, { _id: 'u2', email: 'tenant@example.test', isGlobalAdmin: false }],
    AdminMfa: [{ sub: 'u1', secret: 'enc:v1:SECRET', enabledAt: new Date() }, { sub: 'other', secret: 'enc:v1:OTHER' }],
});

describe('reset-admin-mfa', () => {
    it('e-posta normalize/dogrulama', () => {
        expect(normalizeTargetEmail('  Root@Example.TEST ')).toBe('root@example.test');
        expect(normalizeTargetEmail('bozuk')).toBeNull();
        expect(normalizeTargetEmail(undefined)).toBeNull();
    });
    it('DRY-RUN: hicbir yazma yok (yalniz okuma); durum bildirilir', async () => {
        const { db, ops, cols } = fakeDb(seed());
        await expect(resetAdminMfa(db, { email: 'root@example.test', apply: false })).resolves.toEqual({ found: true, sub: 'u1', hadMfaRecord: true, applied: false });
        expect(ops).toEqual([]);
        expect(cols.AdminMfa).toHaveLength(2);
    });
    it('--apply: yalniz hedefin AdminMfa kaydi silinir, oturumlar kapanir, kilit temizlenir, sistem-aktorlu denetim yazilir (sir YOK)', async () => {
        const { db, cols } = fakeDb(seed());
        const r = await resetAdminMfa(db, { email: 'ROOT@example.test', apply: true, now: () => new Date('2026-09-30T00:00:00Z') });
        expect(r).toMatchObject({ applied: true, sub: 'u1' });
        expect(cols.AdminMfa.map((m) => m.sub)).toEqual(['other']);
        expect(cols.Users[0]).toMatchObject({ tokenVersion: 3, failedLoginAttempts: 0 });
        expect(cols.Users[0].lockUntil).toBeUndefined();
        expect(cols.AuditLogs).toEqual([{ at: new Date('2026-09-30T00:00:00Z'), event: 'backoffice.admin.mfa_reset', result: 'ok', sub: 'u1', actorType: 'system', surface: 'backoffice', meta: { targetSub: 'u1', via: 'local-script', hadMfaRecord: true } }]);
        expect(JSON.stringify(cols.AuditLogs)).not.toMatch(/SECRET|example\.test/);
    });
    it('platform yoneticisi olmayan/bulunmayan hedef reddedilir; hicbir yazma olmaz', async () => {
        const { db, ops } = fakeDb(seed());
        await expect(resetAdminMfa(db, { email: 'tenant@example.test', apply: true })).rejects.toThrow(/platform yöneticisi bulunamadı/);
        await expect(resetAdminMfa(db, { email: 'yok@example.test', apply: true })).rejects.toThrow(/bulunamadı/);
        await expect(resetAdminMfa(db, { email: 'x', apply: true })).rejects.toThrow(/--email/);
        expect(ops).toEqual([]);
    });
});
