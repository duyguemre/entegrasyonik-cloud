// ADR-0029 Karar 4/8 (NB5): e-posta govdesi uretimi. Girdi yalniz katalog kodu + izinli params (PII'siz); ham hata metni yok.
// Baslik/ileti `renderNotification` ile (tr/en) uretilir; eylem baglantisi katalogdaki app-ici yolun PUBLIC_APP_URL ile birlestirilmesidir.
import { getDefinition } from '../catalog';
import type { NotificationLocale } from '../catalog.types';
import { renderNotification } from './render';
import { renderLayout, oneLine, strings, BRAND } from './layout';

export interface EmailContent { subject: string; text: string; html: string }
export interface EmailLinks { appUrl?: string; preferencesUrl?: string; unsubscribeUrl?: string }

/** Katalog eylem yolu (yalniz '/' ile baslayan app-ici yol) + app tabani. Base yoksa/yol guvensizse undefined. */
export function actionLink(code: string, params: Record<string, unknown>, appUrl?: string): string | undefined {
    if (!appUrl) return undefined;
    const def = getDefinition(code);
    if (!def?.action) return undefined;
    let path: string;
    try { path = def.action(params); } catch { return undefined; }
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\r\n\\]/.test(path)) return undefined;
    return appUrl.replace(/\/+$/, '') + path;
}

function content(code: string, params: Record<string, unknown>, locale: NotificationLocale) {
    const s = strings(locale);
    const r = renderNotification(code, params, locale);
    return { title: r.title || s.fallbackTitle, message: r.message || s.fallbackBody };
}

export function buildInstantEmail(i: { code: string; params: Record<string, unknown>; locale: NotificationLocale; service: boolean; count?: number } & EmailLinks): EmailContent {
    const c = content(i.code, i.params, i.locale);
    const note = i.count && i.count > 1 ? `×${i.count}` : undefined;
    const { html, text } = renderLayout({
        locale: i.locale, heading: c.title, service: i.service, preferencesUrl: i.preferencesUrl, unsubscribeUrl: i.unsubscribeUrl,
        sections: [{ items: [{ title: c.title, message: c.message, actionUrl: actionLink(i.code, i.params, i.appUrl), note }] }],
    });
    return { subject: oneLine(`[${BRAND}] ${c.title}`), text, html };
}

export interface DigestItem { code: string; params: Record<string, unknown>; count?: number }
const MAX_DIGEST_ITEMS = 50;

export function buildDigestEmail(i: { items: DigestItem[]; locale: NotificationLocale; service?: boolean } & EmailLinks): EmailContent {
    const s = strings(i.locale);
    const by = new Map<string, Array<{ title: string; message: string; actionUrl?: string; note?: string }>>();
    let shown = 0;
    for (const it of i.items) {
        if (shown >= MAX_DIGEST_ITEMS) break;
        const cat = getDefinition(it.code)?.category ?? 'system';
        const c = content(it.code, it.params, i.locale);
        const arr = by.get(cat) ?? []; by.set(cat, arr);
        arr.push({ title: c.title, message: c.message, actionUrl: actionLink(it.code, it.params, i.appUrl), note: it.count && it.count > 1 ? `×${it.count}` : undefined });
        shown++;
    }
    const rest = i.items.length - shown;
    const sections = [...by.entries()].map(([cat, items]) => ({ heading: s.cat[cat] ?? cat, items }));
    const intro = rest > 0 ? `${s.digestIntro} (${s.more.replace('{n}', String(rest))})` : s.digestIntro;
    const { html, text } = renderLayout({ locale: i.locale, heading: s.digestTitle, intro, sections, service: i.service === true, preferencesUrl: i.preferencesUrl, unsubscribeUrl: i.unsubscribeUrl });
    return { subject: oneLine(`[${BRAND}] ${s.digestTitle} (${i.items.length})`), text, html };
}
