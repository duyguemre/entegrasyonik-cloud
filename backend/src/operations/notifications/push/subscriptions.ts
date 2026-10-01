// MOB-04: web push abonelik kurallari (kayit / silme / listeleme). Uc URL'si ve anahtarlar FieldCrypto ile sifreli saklanir;
// tekillik sha256(endpoint). SSRF: yalniz bilinen push servis host'lari (pushHosts.ts). Kullanici basina en cok 10 cihaz
// (en eskiler dusurulur). Hata iletileri uc/anahtar ICERMEZ.
import { createHash } from 'crypto';
import { decryptField, encryptField } from '@utils/FieldCrypto';
import { logger } from '@platform/core/logger';
import { isAllowedPushEndpoint } from './pushHosts';
import type { PushSubscriptionPort, PushTarget } from './PushDispatcher';

const log = logger.child({ module: 'notifications.push.subscriptions' });
export const MAX_DEVICES_PER_USER = 10;

export interface PushSubscriptionRepoLike {
    upsertByHash(endpointHash: string, doc: { tid: number; userId: string; sub: string; deviceLabel?: string; createdAt: Date }): Promise<void>;
    listByUser(tid: number, userId: string): Promise<any[]>;
    deleteOwned(tid: number, userId: string, by: { endpointHash?: string; id?: string }): Promise<number>;
    deleteManyByIds(ids: unknown[]): Promise<void>;
    deleteById(id: string): Promise<void>;
    markSuccess(id: string, at: Date): Promise<void>;
}

export interface PushSubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }
export interface PushDevice { id: string; deviceLabel: string | null; createdAt: Date; lastSuccessAt: Date | null }

export class PushSubscriptionError extends Error {
    constructor(readonly code: 'PUSH_ENDPOINT_NOT_ALLOWED' | 'PUSH_KEYS_INVALID', message: string) { super(message); }
}

export function hashEndpoint(endpoint: string): string {
    return createHash('sha256').update(endpoint, 'utf8').digest('hex');
}

const b64urlBytes = (v: string) => (/^[A-Za-z0-9_-]+=*$/.test(v) ? Buffer.from(v.replace(/=+$/, ''), 'base64url').length : -1);

/** Abonelik bicim denetimi: izinli push ucu, p256dh 65 bayt (sikistirilmamis P-256 noktasi), auth 16 bayt. */
export function validateSubscription(s: PushSubscriptionInput): void {
    if (!isAllowedPushEndpoint(s?.endpoint)) throw new PushSubscriptionError('PUSH_ENDPOINT_NOT_ALLOWED', 'Bu tarayıcının bildirim servisi desteklenmiyor.');
    if (b64urlBytes(s.keys?.p256dh ?? '') !== 65 || b64urlBytes(s.keys?.auth ?? '') !== 16) throw new PushSubscriptionError('PUSH_KEYS_INVALID', 'Bildirim aboneliği geçersiz.');
}

/** Cihaz adi: yalniz yazdirilabilir, <= 60 karakter (FE "Android · Chrome" gibi turetir; PII beklenmez). */
export function cleanDeviceLabel(v: unknown): string | undefined {
    if (typeof v !== 'string') return undefined;
    const s = [...v].filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f && ch !== '<' && ch !== '>').join('').trim().slice(0, 60);
    return s || undefined;
}

export async function savePushSubscription(repo: PushSubscriptionRepoLike, i: { tid: number; userId: string; subscription: PushSubscriptionInput; deviceLabel?: unknown; now: Date }): Promise<{ id?: string }> {
    validateSubscription(i.subscription);
    const { endpoint, keys } = i.subscription;
    const sub = encryptField(JSON.stringify({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }));
    await repo.upsertByHash(hashEndpoint(endpoint), { tid: i.tid, userId: i.userId, sub, deviceLabel: cleanDeviceLabel(i.deviceLabel), createdAt: i.now });
    // cihaz siniri: en yeniler kalir
    const rows = await repo.listByUser(i.tid, i.userId);
    if (rows.length > MAX_DEVICES_PER_USER) await repo.deleteManyByIds(rows.slice(MAX_DEVICES_PER_USER).map((r) => r._id));
    return {};
}

export async function removePushSubscription(repo: PushSubscriptionRepoLike, i: { tid: number; userId: string; endpoint?: string; id?: string }): Promise<number> {
    if (i.endpoint) return repo.deleteOwned(i.tid, i.userId, { endpointHash: hashEndpoint(i.endpoint) });
    if (i.id) return repo.deleteOwned(i.tid, i.userId, { id: i.id });
    return 0;
}

export async function listPushDevices(repo: PushSubscriptionRepoLike, tid: number, userId: string): Promise<PushDevice[]> {
    const rows = await repo.listByUser(tid, userId);
    return rows.map((r) => ({ id: String(r._id), deviceLabel: r.deviceLabel ?? null, createdAt: r.createdAt, lastSuccessAt: r.lastSuccessAt ?? null }));
}

/** Gonderici portu: sifre cozumu burada; cozulemeyen (anahtar donusu/bozuk) kayit atlanir (silinmez). */
export function createPushSubscriptionPort(repo: PushSubscriptionRepoLike): PushSubscriptionPort {
    return {
        async listForUser(tid, userId) {
            const rows = await repo.listByUser(tid, userId);
            const out: PushTarget[] = [];
            for (const r of rows) {
                try {
                    const s = JSON.parse(decryptField(r.sub));
                    if (isAllowedPushEndpoint(s?.endpoint) && s?.keys?.p256dh && s?.keys?.auth) out.push({ id: String(r._id), endpoint: s.endpoint, keys: s.keys });
                    else log.warn({ subscriptionId: String(r._id) }, 'push aboneligi gecersiz; atlandi');
                } catch {
                    // SILINMEZ: anahtar halkasi yapilandirma hatasi (eski kid eksik) tum abonelikleri yok etmesin.
                    log.warn({ subscriptionId: String(r._id) }, 'push aboneligi cozulemedi; atlandi');
                }
            }
            return out;
        },
        remove: (id) => repo.deleteById(id),
        markSuccess: (id, at) => repo.markSuccess(id, at),
    };
}
