// MOB-04: web push ileti icerigi (SAF). Kural (ADR-0029 Karar 8 + MOB-04): kilit ekraninda gorunen metinde HASSAS VERI YOK --
// params ASLA metne girmez. Baslik = katalog sablonunun SABIT basligi (yer tutucu iceriyorsa kategori etiketi), metin = sabit kisa
// cagri. Ayrinti uygulama icinde (yetki yolu RPC'de kalir). `url` yalniz uygulama ici goreli yol (SW yine suzer).
import { getDefinition } from '../catalog';
import type { NotificationCategory, NotificationLocale, NotificationSeverity } from '../catalog.types';
import { TR } from '../templates/tr';
import { EN } from '../templates/en';

export interface PushPayload {
    /** Surum: SW bilinmeyen surumu genel metinle gosterir. */
    v: 1;
    title: string;
    body: string;
    /** Uygulama ici goreli yol ('/' ile baslar, '//' degil); yoksa '/notifications'. */
    url: string;
    /** Ayni olay ayni bildirimi gunceller (cihazda tekrar yok). */
    tag: string;
    severity: NotificationSeverity;
}

const CATEGORY_LABEL: Record<NotificationCategory, Record<NotificationLocale, string>> = {
    order: { tr: 'Sipariş bildirimi', en: 'Order notification' },
    stock: { tr: 'Stok bildirimi', en: 'Stock notification' },
    integration: { tr: 'Entegrasyon bildirimi', en: 'Integration notification' },
    catalog: { tr: 'Katalog bildirimi', en: 'Catalog notification' },
    finance: { tr: 'Finans bildirimi', en: 'Finance notification' },
    billing: { tr: 'Abonelik bildirimi', en: 'Billing notification' },
    security: { tr: 'Güvenlik bildirimi', en: 'Security notification' },
    system: { tr: 'Sistem bildirimi', en: 'System notification' },
};

const BODY: Record<NotificationLocale, string> = {
    tr: 'Ayrıntılar için Entegrasyonik’i açın.',
    en: 'Open Entegrasyonik for details.',
};

/** Uygulama ici goreli yol mu (acik yonlendirme / protokol yok). */
export function safeInternalPath(p: unknown): string | undefined {
    if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//') || p.includes('\\') || p.length > 300) return undefined;
    if (/[\u0000-\u001f]/.test(p)) return undefined;
    return p;
}

export function pushTitle(code: string, locale: NotificationLocale): string {
    const def = getDefinition(code);
    const raw = (locale === 'en' ? EN[code] : undefined) ?? TR[code];
    if (raw && !raw.title.includes('{')) return raw.title;
    return CATEGORY_LABEL[def?.category ?? 'system'][locale];
}

export function buildPushPayload(i: { code: string; params: Record<string, unknown>; locale: NotificationLocale; eventId: string; severity: NotificationSeverity }): PushPayload {
    const def = getDefinition(i.code);
    let url: string | undefined;
    try { url = def?.action ? safeInternalPath(def.action(i.params as any)) : undefined; } catch { url = undefined; }
    return { v: 1, title: pushTitle(i.code, i.locale), body: BODY[i.locale], url: url ?? '/notifications', tag: `ntf:${i.eventId}`, severity: i.severity };
}
