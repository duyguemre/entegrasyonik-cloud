import crypto from 'crypto';
import { verifyExportDownloadToken, ExportDownloadTokenPayload } from './exportDownloadToken';
import { parseExportArchiveKey } from './exportKey';

/**
 * KVKK dışa aktarma indirme kararı (ADR-0003 adım 8, Karar F.22) — Express'ten BAĞIMSIZ, saf/enjekte edilebilir.
 * Route katmanı: api/files/ExportDownloadApiManager.ts.
 *
 * Güvenlik özellikleri:
 *  - HMAC imzalı token (exportDownloadToken.ts) + 24 sa geçerlilik (imza doğrulaması sırasında).
 *  - TENANT BAĞLI: token'daki anahtar `exports/<N>/export_<N>_<ts>.zip` biçiminde olmalı ve N = isteği yapan oturumun tenant'ı
 *    (sunucudaki doğrulanmış `userContext.order`). Başka tenant'ın (geçerli imzalı!) token'ı 403 + denetim kaydı verir.
 *  - TEK KULLANIM: token özeti süreç-içi "kullanıldı" kümesine yazılır (yarış: aynı süreçte tek kazanan); başarılı tam aktarımdan
 *    sonra arşiv R2'den SİLİNİR (çok-replikada kalıcı tek-kullanım garantisi budur). Aktarım yarıda kesilirse talep serbest bırakılır
 *    (yeniden denenebilir; dosya silinmez) — süre dolana/dosya silinene kadar.
 *  - AKIŞ: arşiv bellekte tamponlanmaz (R2 GetObject gövdesi doğrudan istemciye pipe edilir).
 *  - DENETİM: her sonuç (ok/fail/error) `tenant.export.download` olayı olarak yazılır (sub/tid/ip; token/anahtar YAZILMAZ).
 */

export interface ExportDownloadStorage {
    open(clientId: string, key: string): Promise<{ body: any; contentLength?: number } | null>;
    remove(clientId: string, key: string): Promise<boolean>;
}

export interface ExportDownloadAudit {
    (entry: { event: string; result: 'ok' | 'fail' | 'error'; sub?: string; tid?: number; ip?: string; meta?: Record<string, any> }): void;
}

/** Tek kullanım kaydı: token SHA-256 özeti -> bitiş zamanı (ms). Bellek üst sınırlı; süresi dolanlar temizlenir. */
export class ConsumedTokenStore {
    private readonly used = new Map<string, number>();
    constructor(private readonly maxEntries = 10_000) { }

    private sweep(nowMs: number) {
        for (const [k, exp] of this.used) if (exp <= nowMs) this.used.delete(k);
        while (this.used.size >= this.maxEntries) {
            const oldest = this.used.keys().next().value;
            if (oldest === undefined) break;
            this.used.delete(oldest);
        }
    }

    /** true = bu çağrı token'ı KAZANDI (ilk kullanım); false = zaten kullanılmış/kullanımda. */
    claim(token: string, expiresAt: number, nowMs: number): boolean {
        const h = crypto.createHash('sha256').update(token).digest('hex');
        const exp = this.used.get(h);
        if (exp !== undefined && exp > nowMs) return false;
        this.sweep(nowMs);
        this.used.set(h, expiresAt);
        return true;
    }

    release(token: string): void {
        this.used.delete(crypto.createHash('sha256').update(token).digest('hex'));
    }

    get size(): number { return this.used.size; }
}

export const defaultConsumedTokens = new ConsumedTokenStore();

export interface ExportDownloadInput {
    token: unknown;
    /** Sunucuda doğrulanmış tenant (userContext.order); istek gövdesinden/sorgudan ASLA. */
    order: unknown;
    sub?: string;
    ip?: string;
    /** İsteği yapan owner kademesinde mi (route çözer). */
    isOwner: boolean;
}

export interface ExportDownloadDeps {
    storage: ExportDownloadStorage;
    audit: ExportDownloadAudit;
    consumed?: ConsumedTokenStore;
    verify?: (token: string) => ExportDownloadTokenPayload | null;
    now?: () => Date;
}

export type ExportDownloadOutcome =
    | { ok: false; status: 400 | 403 | 410 | 500; error: string }
    | { ok: true; body: any; contentLength?: number; filename: string; complete: () => Promise<void>; abort: () => void };

const MAX_TOKEN_LEN = 2048;

export async function prepareExportDownload(input: ExportDownloadInput, deps: ExportDownloadDeps): Promise<ExportDownloadOutcome> {
    const consumed = deps.consumed ?? defaultConsumedTokens;
    const verify = deps.verify ?? ((t: string) => verifyExportDownloadToken(t, () => (deps.now ?? (() => new Date()))()));
    const nowMs = (deps.now ?? (() => new Date()))().getTime();

    const tid = Number(input.order);
    const base = { sub: input.sub, tid: Number.isInteger(tid) ? tid : undefined, ip: input.ip };
    const audit = (result: 'ok' | 'fail' | 'error', reason?: string) =>
        deps.audit({ event: 'tenant.export.download', result, ...base, meta: reason ? { reason } : undefined });

    if (!Number.isInteger(tid)) return { ok: false, status: 400, error: 'Tenant bulunamadı.' };
    if (!input.isOwner) { audit('fail', 'not_owner'); return { ok: false, status: 403, error: 'Forbidden' }; }

    const token = input.token;
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LEN) {
        audit('fail', 'bad_token');
        return { ok: false, status: 400, error: 'Geçersiz veya süresi dolmuş indirme bağlantısı.' };
    }
    const payload = verify(token);
    if (!payload) { audit('fail', 'bad_token'); return { ok: false, status: 400, error: 'Geçersiz veya süresi dolmuş indirme bağlantısı.' }; }

    // Tenant bağı: anahtar biçimi + sahiplik (başka tenant'ın geçerli imzalı token'ı burada düşer)
    const parsed = parseExportArchiveKey(payload.key);
    if (!parsed || parsed.clientId !== String(tid)) { audit('fail', 'tenant_mismatch'); return { ok: false, status: 403, error: 'Forbidden' }; }

    if (!consumed.claim(token, payload.expiresAt, nowMs)) { audit('fail', 'already_used'); return { ok: false, status: 410, error: 'Bu indirme bağlantısı daha önce kullanıldı.' }; }

    let opened: { body: any; contentLength?: number } | null;
    try {
        opened = await deps.storage.open(String(tid), payload.key);
    } catch (e: any) {
        consumed.release(token);
        audit('error', 'storage_error');
        console.error('[ExportDownload] arşiv açılamadı:', e?.name || e?.message);
        return { ok: false, status: 500, error: 'Arşiv şu anda indirilemiyor.' };
    }
    if (!opened) { audit('fail', 'gone'); return { ok: false, status: 410, error: 'Arşiv artık mevcut değil; yeni bir dışa aktarma isteyin.' }; }

    const day = new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, '');
    let settled = false;
    return {
        ok: true,
        body: opened.body,
        contentLength: opened.contentLength,
        filename: `entegrasyonik-veri-disa-aktarma-${tid}-${day}.zip`,
        // Tam aktarım bitti: token kalıcı olarak tüketilmiş kalır + arşiv silinir (best-effort)
        complete: async () => {
            if (settled) return; settled = true;
            audit('ok');
            try {
                const removed = await deps.storage.remove(String(tid), payload.key);
                if (!removed) console.error('[ExportDownload] indirilen arşiv silinemedi (süre dolumunda yaşam döngüsü/temizlik gerekir).');
            } catch (e: any) {
                console.error('[ExportDownload] arşiv silme hatası:', e?.name || e?.message);
            }
        },
        // Yarıda kesildi: talep serbest bırakılır (yeniden denenebilir), dosya silinmez
        abort: () => {
            if (settled) return; settled = true;
            consumed.release(token);
            audit('error', 'aborted');
        },
    };
}
