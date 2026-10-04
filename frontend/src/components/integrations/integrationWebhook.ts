/**
 * frontend/src/components/integrations/integrationWebhook.ts
 *
 * C1.2 — webhook alıcı adresi. Backend rotası `/hooks/<kanal>/:hookToken` (`backend/src/api/webhooks/{WebhookApiManager,ChannelWebhookApiManager}.ts`) API ile AYNI Express sunucusunda, `/api` bağlamının DIŞINDA
 * bağlanır (`Webserver.ts`). HB: `PUT <baseUrl>/<eventName>` — kullanıcı yalnız `<baseUrl>` girer, olay adını HB ekler.
 * IS: `POST /hooks/ideasoft/:token`, HMAC `X-Ideashop-Hmac-Sha256` (API secret girilmiş olmalı). Bu yüzden taban = `apiBaseUrl`'in kökü (origin); göreli `apiBaseUrl` (ör. `/api/`)
 * sayfanın kökü ile çözülür. Anahtar yalnız URL yolu bileşeni olarak kodlanır.
 */
import { apiBaseUrl } from '@/config/env'

/** [eslesme-fiyat WP7b, F-11] Alıcısı olan kanallar (backend `integration/contracts/webhookChannels.ts` ile aynı liste). */
export const WEBHOOK_CHANNELS = ['trendyol', 'hepsiburada', 'ideasoft'] as const
export type WebhookChannel = typeof WEBHOOK_CHANNELS[number]

export const WEBHOOK_CHANNEL_NAMES: Record<WebhookChannel, string> = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada', ideasoft: 'Ideasoft' }

export function isWebhookChannel(code: unknown): code is WebhookChannel {
  return typeof code === 'string' && (WEBHOOK_CHANNELS as readonly string[]).includes(code)
}

export function webhookPath(channel: string, token: string): string {
  return `/hooks/${encodeURIComponent(channel)}/${encodeURIComponent(token)}`
}

export function webhookOrigin(base: string = apiBaseUrl, pageOrigin?: string): string {
  const fallback = pageOrigin ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  try {
    return new URL(base, fallback).origin
  } catch {
    return fallback
  }
}

export function webhookUrl(channel: string, token: string, base: string = apiBaseUrl, pageOrigin?: string): string {
  return `${webhookOrigin(base, pageOrigin)}${webhookPath(channel, token)}`
}
