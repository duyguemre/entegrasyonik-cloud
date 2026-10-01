/**
 * ACIL DURUM (yalniz YEREL): bir platform yoneticisinin AdminMfa kaydini siler (sonraki giriste TOTP yeniden kaydedilir).
 * Normal yol: baska bir platform yoneticisi `/admin-api` `BackofficeAdminUserService/resetMfa` ile sifirlar (step-up + denetim). Bu betik,
 * TUM yoneticiler kilitli kaldiginda icindir (ADR-0026 uygulama notu: betik yalniz yerelde, uzak/Atlas'a asla).
 *
 * Kapilar: (1) VARSAYILAN DRY-RUN (yazmaz); yazmak icin `--apply`. (2) Yerel host kapisi: bagliti yalniz 127.0.0.1; `--allow-remote` bu betikte REDDEDILIR.
 * (3) Izinli DB kapisi: uygulama DB adi CLAUDE.md kural 2'deki 7 DB'den biri olmali (`_migrationCommon.runCli`). (4) Hedef `isGlobalAdmin:true`
 * bir kullanici olmali (tenant kullanicisi reddedilir). (5) `--apply` yazimi AuditLogs'a `backoffice.admin.mfa_reset` (actorType:system, via:local-script) yazar.
 * Cikti: e-posta/sir/kurtarma kodu ASLA yazdirilmaz (yalniz kullanici kimligi + durum). CALISTIRILMADI; yerel uygulama ajani/insan `--apply` karari verir.
 *
 * Kullanim:  cd backend && npm run admin:reset-mfa -- --email=<adres> [--apply] [<appDbName>]
 */

type Doc = Record<string, unknown>;

export interface ResetMfaDbLike {
    collection(name: string): {
        findOne(filter: Doc, opts?: Doc): Promise<Doc | null>;
        deleteOne(filter: Doc): Promise<{ deletedCount?: number }>;
        updateOne(filter: Doc, update: Doc): Promise<{ modifiedCount?: number }>;
        insertOne(doc: Doc): Promise<unknown>;
    };
}

export interface ResetMfaResult { found: boolean; sub?: string; hadMfaRecord?: boolean; applied: boolean }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeTargetEmail = (v: unknown): string | null => {
    const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
    return e.length > 0 && e.length <= 254 && EMAIL_RE.test(e) ? e : null;
};

/** Saf mantik (DB enjekte edilir; testler sahte `db` kullanir). Hedef platform yoneticisi degilse/yoksa Error. */
export async function resetAdminMfa(db: ResetMfaDbLike, opts: { email: unknown; apply: boolean; now?: () => Date }): Promise<ResetMfaResult> {
    const email = normalizeTargetEmail(opts.email);
    if (!email) throw new Error('Geçerli bir --email=<adres> gerekli.');
    const users = db.collection('Users');
    const user = await users.findOne({ email }, { projection: { _id: 1, isGlobalAdmin: 1 } });
    if (!user || user.isGlobalAdmin !== true) throw new Error('Bu e-posta ile bir platform yöneticisi bulunamadı.');
    const sub = String(user._id);
    const mfa = db.collection('AdminMfa');
    const hadMfaRecord = !!(await mfa.findOne({ sub }, { projection: { _id: 1 } }));
    if (!opts.apply) return { found: true, sub, hadMfaRecord, applied: false };
    await mfa.deleteOne({ sub });
    // Acil durumda eski oturumlar da kapanir (tokenVersion++) ve parola kilidi/deneme sayaci temizlenir (yonetici yeniden girebilsin).
    await users.updateOne({ _id: user._id, isGlobalAdmin: true }, { $inc: { tokenVersion: 1 }, $set: { failedLoginAttempts: 0 }, $unset: { lockUntil: 1 } });
    await db.collection('AuditLogs').insertOne({
        at: (opts.now ?? (() => new Date()))(), event: 'backoffice.admin.mfa_reset', result: 'ok', sub,
        actorType: 'system', surface: 'backoffice', meta: { targetSub: sub, via: 'local-script', hadMfaRecord },
    });
    return { found: true, sub, hadMfaRecord, applied: true };
}

/** CLI (`dev-tools/run-ts.js` cagirir). `--email=` argv'den cikarilir; kalan bayraklar ortak `runCli`'ye gider. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runCli } = require('../dev-tools/_migrationCommon');
    let email: string | undefined;
    const rest: string[] = [];
    for (const a of argv) {
        if (a.startsWith('--email=')) email = a.slice('--email='.length);
        else rest.push(a);
    }
    if (rest.includes('--allow-remote')) { console.error('[reset-admin-mfa] hata: --allow-remote bu betikte REDDEDİLİR (yalnız yerel 127.0.0.1).'); process.exitCode = 1; return; }
    process.argv = [...process.argv.slice(0, 2), ...rest];
    await runCli('reset-admin-mfa', async ({ appDb, flags }: { appDb: ResetMfaDbLike; flags: { apply: boolean } }) => {
        const r = await resetAdminMfa(appDb, { email, apply: !!flags.apply });
        console.log(`[reset-admin-mfa] kullanıcı: ${r.sub}; AdminMfa kaydı ${r.hadMfaRecord ? 'VAR' : 'YOK'}; ${r.applied ? 'SİLİNDİ (oturumlar kapatıldı, denetim kaydı yazıldı)' : 'DRY-RUN: değişiklik yapılmadı (--apply ile uygulanır)'}`);
    });
}
