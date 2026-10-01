/**
 * Paket çevirmeni. Öncelik: host `t` (uygulama i18n'i) → paket sözlüğü (locale) → tr. `{name}` her zaman
 * CHAT_PRODUCT.name ile doldurulur (ürün adı tek sabitten; K17/K39).
 */
import { CHAT_PRODUCT } from '../brand'
import type { ChatErrorCode, Locale } from '../protocol/v1'
import { en } from './en'
import { tr, type ChatMessageKey } from './tr'

export { tr, en }
export type { ChatMessageKey }

export const CHAT_MESSAGES: Record<Locale, Record<ChatMessageKey, string>> = { tr, en }

export type Translate = (key: ChatMessageKey, params?: Record<string, unknown>) => string

export function interpolate(template: string, params: Record<string, unknown> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (name === 'name' && !(name in params)) return CHAT_PRODUCT.name
    const value = params[name]
    return value === undefined || value === null ? match : String(value)
  })
}

export function createTranslator(
  locale: () => Locale,
  hostT?: (key: string, params?: Record<string, unknown>) => string | undefined,
): Translate {
  return (key, params) => {
    const merged = { name: CHAT_PRODUCT.name, ...params }
    const fromHost = hostT?.(`chat.${key}`, merged)
    if (typeof fromHost === 'string' && fromHost.length > 0) return fromHost
    const dict = CHAT_MESSAGES[locale()] ?? tr
    return interpolate(dict[key] ?? tr[key] ?? key, merged)
  }
}

/** Taşıyıcı ve durum makinesinin yedek hata metni (sunucu metni yoksa). */
export function turnErrorMessage(code: ChatErrorCode, locale: Locale = 'tr'): string {
  const key = `turnError.${code}` as ChatMessageKey
  return interpolate((CHAT_MESSAGES[locale] ?? tr)[key] ?? tr['turnError.INTERNAL'])
}
