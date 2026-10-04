/**
 * frontend/src/composables/useSyncNowApi.ts
 *
 * [eslesme-fiyat WP7b, F-10] "Şimdi senkronize et" istemcisi + saf yardımcılar.
 * Backend: `IntegrationService/syncNow {integrationCode, kind?}` → `backend/src/operations/integrations/syncNow.ts`
 * (tenant × entegrasyon × tür başına 5 dk soğuma → 429 RATE_LIMITED; kill-switch → 503 INTEGRATION_PAUSED;
 * canlı salt-okuma → 423 LIVE_READONLY; art arda AUTH → 502 AUTH; Redis yok → 503 QUEUE_UNAVAILABLE).
 */
import useRestApi from '@/composables/restapi'
import { apiErrorStatus } from '@/composables/useIntegrationHealthApi'

export const SYNC_NOW_KINDS = ['orders', 'claims', 'messages', 'finance'] as const
export type SyncNowKind = typeof SYNC_NOW_KINDS[number]
export const SYNC_NOW_COOLDOWN_MS = 5 * 60 * 1000

export interface SyncNowResponse {
  accepted: true
  jobId: string
  kind: SyncNowKind
  integrationCode: string
  requestedAt: string
  nextAllowedAt: string
  lastSuccessAt: string | null
}

export type SyncNowOutcome =
  | { ok: true; data: SyncNowResponse }
  | { ok: false; status: number | null; code: string | null }

/** Hata kodu → i18n anahtarı (`integrationSync.error.*`); bilinmeyen → genel. */
export function syncNowErrorKey(code: string | null, status: number | null): string {
  switch (code) {
    case 'RATE_LIMITED': return 'integrationSync.error.cooldown'
    case 'INTEGRATION_PAUSED': return 'integrationSync.error.paused'
    case 'LIVE_READONLY': return 'integrationSync.error.readonly'
    case 'AUTH': return 'integrationSync.error.auth'
    case 'QUEUE_UNAVAILABLE': return 'integrationSync.error.queue'
    case 'NOT_FOUND': return 'integrationSync.error.notConfigured'
    default: return status === 403 ? 'integrationSync.error.forbidden' : 'integrationSync.error.generic'
  }
}

export function useSyncNowApi() {
  const restApi = useRestApi()
  async function syncNow(integrationCode: string, kind: SyncNowKind = 'orders'): Promise<SyncNowOutcome> {
    const res: any = await restApi.post('IntegrationService/syncNow', { integrationCode, kind })
    const status = apiErrorStatus(res)
    if (status !== undefined) {
      const code = res?.response?.data?.code
      return { ok: false, status, code: typeof code === 'string' ? code : null }
    }
    if (!res || res.accepted !== true) return { ok: false, status: null, code: null }
    return { ok: true, data: res as SyncNowResponse }
  }
  return { syncNow }
}
