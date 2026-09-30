/**
 * frontend/src/components/integrations/integrationWebhook.ts
 *
 * C1.2 — webhook alıcı adresi. Backend rotası `/hooks/<kanal>/:hookToken` (`backend/src/api/WebhookApiManager.ts`
 * `configureWebhookRoutes`; bugün yalnız `trendyol`) API ile AYNI Express sunucusunda, `/api` bağlamının DIŞINDA
 * bağlanır (`Webserver.ts`). Bu yüzden taban = `apiBaseUrl`'in kökü (origin); göreli `apiBaseUrl` (ör. `/api/`)
 * sayfanın kökü ile çözülür. Anahtar yalnız URL yolu bileşeni olarak kodlanır.
 */
import { apiBaseUrl } from '@/config/env'

export const WEBHOOK_CHANNELS = ['trendyol'] as const

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
