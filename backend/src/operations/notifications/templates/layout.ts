// ADR-0029 Karar 4/8 (NB5): ortak e-posta duzeni. Sade, marka rengi, karanlik mod dostu (color-scheme + prefers-color-scheme),
// HTML + duz metin alternatifi. Kullanici verisi (ad/e-posta) YOK; tum degiskenler kacislanir; ust bilgi enjeksiyonuna karsi tek satir.
import type { NotificationLocale } from '../catalog.types';

export const BRAND = 'Entegrasyonik';

const STR = {
    tr: {
        openApp: 'Uygulamada aç', prefs: 'Bildirim tercihleri', unsub: 'Bu kategoriden çık',
        serviceNote: 'Bu bir hizmet bildirimidir; hesabınızın güvenliği/faturalaması için gönderilir ve kapatılamaz.',
        optionalNote: 'Bu bildirimi bildirim tercihlerinizden değiştirebilirsiniz.',
        more: 've {n} bildirim daha',
        digestTitle: 'Bildirim özeti', digestIntro: 'Bu dönemde biriken bildirimleriniz:',
        fallbackTitle: 'Yeni bildirim', fallbackBody: 'Uygulamada görüntüleyebileceğiniz yeni bir bildiriminiz var.',
        cat: { order: 'Siparişler', stock: 'Stok', integration: 'Entegrasyonlar', catalog: 'Katalog', finance: 'Finans', billing: 'Faturalama', security: 'Güvenlik', system: 'Sistem' } as Record<string, string>,
    },
    en: {
        openApp: 'Open in app', prefs: 'Notification preferences', unsub: 'Unsubscribe from this category',
        serviceNote: 'This is a service notification about your account security/billing and cannot be turned off.',
        optionalNote: 'You can change this notification in your notification preferences.',
        more: 'and {n} more notifications',
        digestTitle: 'Notification digest', digestIntro: 'Notifications that accumulated in this period:',
        fallbackTitle: 'New notification', fallbackBody: 'You have a new notification you can view in the app.',
        cat: { order: 'Orders', stock: 'Stock', integration: 'Integrations', catalog: 'Catalog', finance: 'Finance', billing: 'Billing', security: 'Security', system: 'System' } as Record<string, string>,
    },
} as const;

export const strings = (l: NotificationLocale) => STR[l] ?? STR.tr;

export function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** Ust bilgi (Subject) enjeksiyonu: satir sonlari ve kontrol karakterleri temizlenir, uzunluk sinirli. */
export function oneLine(s: string, max = 200): string {
    // eslint-disable-next-line no-control-regex
    return s.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

export interface LayoutItem { title: string; message: string; actionUrl?: string; note?: string }
export interface LayoutSection { heading?: string; items: LayoutItem[] }
export interface LayoutInput {
    locale: NotificationLocale;
    heading: string;
    intro?: string;
    sections: LayoutSection[];
    /** Zorunlu (hizmet) bildirimi: abonelik baglantisi yok, altbilgi "hizmet bildirimi" der. */
    service: boolean;
    preferencesUrl?: string;
    unsubscribeUrl?: string;
}

const CSS = `body{margin:0;padding:0;background:#f4f5f7;color:#1f2933}
.wrap{max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5}
.card{background:#ffffff;border-radius:8px;padding:20px 24px;border:1px solid #e4e7eb}
.brand{font-weight:bold;font-size:16px;color:#0b6bcb;margin-bottom:12px}
h1{font-size:18px;margin:0 0 12px 0;color:#1f2933}h2{font-size:14px;margin:18px 0 6px 0;color:#52606d}
.item{margin:0 0 14px 0}.item b{color:#1f2933}.muted{color:#7b8794;font-size:12px}
a{color:#0b6bcb}.btn{display:inline-block;margin-top:6px;padding:6px 12px;border-radius:6px;background:#0b6bcb;color:#ffffff!important;text-decoration:none;font-size:13px}
.foot{padding:14px 4px;color:#7b8794;font-size:12px}
@media (prefers-color-scheme: dark){body{background:#12161b!important;color:#e4e7eb!important}.card{background:#1c2229!important;border-color:#2b333c!important}
h1,.item b{color:#f5f7fa!important}h2{color:#9aa5b1!important}.brand,a{color:#6cb2ff!important}.btn{background:#2d7fd8!important;color:#ffffff!important}.foot,.muted{color:#9aa5b1!important}}`;

export function renderLayout(i: LayoutInput): { html: string; text: string } {
    const s = strings(i.locale);
    const html: string[] = [];
    const text: string[] = [BRAND, '', i.heading, ''];
    if (i.intro) text.push(i.intro, '');
    html.push(`<h1>${esc(i.heading)}</h1>`);
    if (i.intro) html.push(`<p>${esc(i.intro)}</p>`);
    for (const sec of i.sections) {
        if (sec.heading) { html.push(`<h2>${esc(sec.heading)}</h2>`); text.push(`== ${sec.heading} ==`); }
        for (const it of sec.items) {
            html.push(`<div class="item"><b>${esc(it.title)}</b>${it.note ? ` <span class="muted">${esc(it.note)}</span>` : ''}<br>${esc(it.message)}` +
                (it.actionUrl ? `<br><a class="btn" href="${esc(it.actionUrl)}">${esc(s.openApp)}</a>` : '') + '</div>');
            text.push(`- ${it.title}${it.note ? ` (${it.note})` : ''}`, `  ${it.message}`);
            if (it.actionUrl) text.push(`  ${s.openApp}: ${it.actionUrl}`);
            text.push('');
        }
    }
    const note = i.service ? s.serviceNote : s.optionalNote;
    const links: string[] = []; const tlinks: string[] = [];
    if (i.preferencesUrl) { links.push(`<a href="${esc(i.preferencesUrl)}">${esc(s.prefs)}</a>`); tlinks.push(`${s.prefs}: ${i.preferencesUrl}`); }
    if (!i.service && i.unsubscribeUrl) { links.push(`<a href="${esc(i.unsubscribeUrl)}">${esc(s.unsub)}</a>`); tlinks.push(`${s.unsub}: ${i.unsubscribeUrl}`); }
    text.push('--', note, ...tlinks);
    const doc = `<!DOCTYPE html><html lang="${i.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(i.heading)}</title><style>${CSS}</style></head>` +
        `<body><div class="wrap"><div class="card"><div class="brand">${BRAND}</div>${html.join('')}</div>` +
        `<div class="foot">${esc(note)}${links.length ? `<br>${links.join(' · ')}` : ''}</div></div></body></html>`;
    return { html: doc, text: text.join('\n') };
}
