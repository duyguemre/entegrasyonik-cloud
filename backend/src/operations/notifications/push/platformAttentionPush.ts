// MOB-06: backoffice web push -- platform yoneticisinin cihazina YALNIZ kritik "dikkat gerektirenler" maddeleri (K51 getAttention kaynaklari).
// Kanal ve tasiyici MOB-04 ile ayni (VAPID, web-push gondericisi, 404/410 temizligi, PushSubscriptions koleksiyonu). Abonelik kaydi
// tid = PLATFORM_PUSH_TID (0; gercek tenant tid'i >= 1) + userId = yonetici `Users._id` ile tutulur -- yeni koleksiyon/goc YOK.
// Kurallar:
//  - Kanal kapaliyken (NOTIFY_V2_ENABLED / WEBPUSH_VAPID_*) hicbir koleksiyona DOKUNMAZ; abone yonetici yoksa dikkat hesaplanmaz.
//  - Gonderim aninda alici yeniden denetlenir: `isGlobalAdmin===true` ve etkin degilse aboneligi SILINIR (yetkisi alinan yonetici almaz).
//  - Icerik: madde basliklari sunucu SABITleridir (tenant adi/PII/sayac yok); konu (subjects) ASLA metne girmez.
//  - Tekrar: yalniz YENI kritik madde (ya da 6 sa'tir suren) bildirim uretir; ayni `tag` cihazda eskisinin yerine gecer.
//    Durum surec bellegindedir (worker); yeniden baslatmada en cok bir tekrar bildirimi olur (bilincli: yeni tablo yok).
import { logger } from '@platform/core/logger';
import { metricsRegistry } from '@platform/runtime/metrics';
import { classifyPushError, PUSH_TTL_SECONDS, type PushSender, type PushTarget } from './PushDispatcher';
import { decodePushTarget } from './subscriptions';

const log = logger.child({ module: 'notifications.push.platform' });

/** Platform yoneticisi aboneliklerinin tid'i (tenant tid'leri pozitiftir). */
export const PLATFORM_PUSH_TID = 0;
/** Kritik madde suruyorsa yeniden hatirlatma araligi. */
export const ATTENTION_RENOTIFY_MS = 6 * 60 * 60 * 1000;
export const ATTENTION_PUSH_TAG = 'bo-attention';
const TITLE_MAX = 80;
const BODY_ITEMS = 3;

export interface CriticalItem { id: string; title: string }
export interface AttentionPushPayload { v: 1; title: string; body: string; url: string; tag: string; severity: 'critical' }

const clean = (s: unknown): string => (typeof s === 'string' ? [...s].filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f).join('').trim().slice(0, TITLE_MAX) : '');

/** getAttention yanitindan yalniz kritik maddeler (id + sabit baslik), sistem once. Bicim bozuksa bos liste. */
export function criticalAttentionItems(attention: any): CriticalItem[] {
    const groups = attention?.groups ?? {};
    const out: CriticalItem[] = [];
    for (const g of [groups.system, groups.customers]) {
        for (const i of Array.isArray(g?.items) ? g.items : []) {
            if (i?.severity === 'critical' && typeof i.id === 'string' && clean(i.title)) out.push({ id: i.id, title: clean(i.title) });
        }
    }
    return out;
}

/** Kilit ekrani metni: baslik + en cok 3 madde basligi. Hedef backoffice ana sayfasi (dikkat listesi). */
export function buildAttentionPushPayload(items: CriticalItem[]): AttentionPushPayload {
    const n = items.length;
    const title = n === 1 ? `Kritik: ${items[0].title}` : `${n} kritik dikkat maddesi`;
    const rest = items.slice(0, BODY_ITEMS).map((i) => i.title);
    const body = n === 1 ? 'Ayrıntılar için yönetim panelini açın.' : `${rest.join(' · ')}${n > BODY_ITEMS ? ` ve ${n - BODY_ITEMS} madde daha` : ''}`;
    return { v: 1, title, body, url: '/', tag: ATTENTION_PUSH_TAG, severity: 'critical' };
}

/** Bildirim gerekir mi: yeni kritik madde ya da hatirlatma suresi dolmus madde. `seen` (id -> son gonderim) yerinde budanir. */
export function dueCriticalIds(items: CriticalItem[], seen: Map<string, number>, nowMs: number, renotifyMs = ATTENTION_RENOTIFY_MS): string[] {
    const ids = new Set(items.map((i) => i.id));
    for (const k of [...seen.keys()]) if (!ids.has(k)) seen.delete(k); // cozulen madde tekrar kritiklesirse yeniden bildirilir
    return [...ids].filter((id) => { const at = seen.get(id); return at === undefined || nowMs - at >= renotifyMs; });
}

export interface PlatformPushRepoLike {
    listByTid(tid: number): Promise<any[]>;
    deleteById(id: string): Promise<void>;
    markSuccess(id: string, at: Date): Promise<void>;
}

export interface PlatformAttentionPushDeps {
    enabled(): boolean;
    repo: PlatformPushRepoLike;
    /** Verilen kullanicilardan HALEN etkin platform yoneticisi olanlar (DB'den taze). */
    activeAdminIds(userIds: string[]): Promise<Set<string>>;
    getAttention(): Promise<any>;
    sender: PushSender;
    now?(): number;
    /** Test icin: surec bellegi yerine verilen durum. */
    seen?: Map<string, number>;
}

export interface PlatformAttentionPushResult { skipped?: string; processed: number; failed: number; note: string }

export class PlatformAttentionPusher {
    private readonly seen: Map<string, number>;
    constructor(private readonly d: PlatformAttentionPushDeps) { this.seen = d.seen ?? new Map(); }
    private now(): number { return this.d.now ? this.d.now() : Date.now(); }

    async runOnce(): Promise<PlatformAttentionPushResult> {
        if (!this.d.enabled()) return { skipped: 'disabled', processed: 0, failed: 0, note: 'disabled' };
        const rows = await this.d.repo.listByTid(PLATFORM_PUSH_TID);
        if (!rows.length) return { skipped: 'no_subscription', processed: 0, failed: 0, note: 'no_subscription' };

        const admins = await this.d.activeAdminIds([...new Set(rows.map((r) => String(r.userId)))]);
        const targets: PushTarget[] = [];
        let revoked = 0;
        for (const r of rows) {
            if (!admins.has(String(r.userId))) { await this.d.repo.deleteById(String(r._id)); revoked++; continue; }
            const t = decodePushTarget(r);
            if (t) targets.push(t);
        }
        if (!targets.length) return { skipped: 'no_subscription', processed: 0, failed: 0, note: `revoked=${revoked}` };

        const items = criticalAttentionItems(await this.d.getAttention());
        const due = dueCriticalIds(items, this.seen, this.now());
        if (!due.length) return { processed: 0, failed: 0, note: `critical=${items.length} due=0 revoked=${revoked}` };

        const payload = JSON.stringify(buildAttentionPushPayload(items));
        let sent = 0; let transient = 0; let failed = 0; let removed = 0;
        for (const t of targets) {
            try {
                await this.d.sender.send(t, payload, { ttl: PUSH_TTL_SECONDS, urgency: 'high', topic: ATTENTION_PUSH_TAG });
                sent++;
                try { await this.d.repo.markSuccess(t.id, new Date(this.now())); } catch { /* bilgi amacli */ }
            } catch (err) {
                const c = classifyPushError(err);
                if (c.kind === 'gone') {
                    try { await this.d.repo.deleteById(t.id); removed++; } catch (e) { log.warn({ err: { message: (e as Error).message } }, 'biten abonelik silinemedi'); }
                } else {
                    failed++;
                    if (c.kind === 'transient') transient++;
                    else log.warn({ errClass: c.code }, 'push servisi istegi reddetti');
                }
            }
        }
        // Yalniz gecici hatalarla hic iletilemediyse durum yazilmaz: sonraki turda yeniden denenir.
        if (sent > 0 || transient === 0) for (const id of due) this.seen.set(id, this.now());
        metricsRegistry.incCounter('notifications.delivery', { channel: 'push', result: sent > 0 ? 'sent' : 'retried', reason: 'platform_attention' });
        return { processed: targets.length, failed, note: `critical=${items.length} due=${due.length} sent=${sent} failed=${failed} removed=${removed} revoked=${revoked}` };
    }
}
