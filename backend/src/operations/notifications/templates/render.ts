// ADR-0029 Karar 1/8: sablon render. Bagimlilik yok. Yalniz katalog params'i; eksik parametre "-" olur.
import { getDefinition } from '../catalog';
import { NotificationLocale } from '../catalog.types';
import { TR } from './tr';
import { EN } from './en';

const TABLES: Record<NotificationLocale, Record<string, { title: string; body: string }>> = { tr: TR, en: EN };

function interpolate(tpl: string, params: Record<string, unknown>): string {
    return tpl.replace(/\{(\w+)\}/g, (_m, k) => {
        const v = params[k];
        return v === undefined || v === null || v === '' ? '-' : String(v);
    });
}

export interface RenderedNotification { title: string; message: string }

/** Kod + params -> {title,message}. LEGACY_* ailesinde cagiranin duz title/message'i aynen doner. */
export function renderNotification(code: string, params: Record<string, unknown>, locale: NotificationLocale = 'tr'): RenderedNotification {
    const def = getDefinition(code);
    if (def?.legacy) return { title: String(params.title ?? ''), message: String(params.message ?? '') };
    const t = TABLES[locale]?.[code] ?? TR[code];
    if (!t) return { title: code, message: '' };
    return { title: interpolate(t.title, params), message: interpolate(t.body, params) };
}
