// frontend/src/components/adminPanel/integrations/useIntegrationConfigApi.ts
//
// ADR-0020 Aşama C — `IntegrationConfigService` (Aşama B, backend HAZIR) için tek RPC istemcisi.
// Desen `SubscriptionView.vue`/`BillingService` ile AYNI: `restApi.post` ağ hatasında REDDETMEZ
// (bkz. `restapi.ts` `postService`), ham axios hata nesnesini "başarılı" değer olarak döner —
// bu yüzden `isErrorShapedResponse` ile ayırt edilir (bkz. `StatisticsComponent.vue` aynı desen).
import useRestApi from '@/composables/restapi'

const SERVICE = 'IntegrationConfigService'

/** `restApi.post` sonucu bir axios HATASI mı (network/HTTP) — başarı gövdesiyle KARIŞTIRILMAZ. */
export function isErrorShapedResponse(res: any): boolean {
  return Boolean(res?.isAxiosError || res?.response?.status)
}

/** Sunucunun `{error, service, operation, code?}` zarfından insan-okunur ileti (ham hata SIZDIRMAZ). */
export function serverErrorMessage(res: any, fallback: string): string {
  const msg = res?.response?.data?.error
  return typeof msg === 'string' && msg.length > 0 ? msg : fallback
}

export type ValueSource = 'default' | 'platform' | 'env' | 'tenant' | 'legacy'

export interface TargetSummary {
  target: string
  displayName: string
  category: string
  adapterVersion?: string
  publishedVersion: number
  intake: 'on' | 'drain' | 'off'
  hasDraft: boolean
  draftLockedBy?: string
}

export interface ResolvedValue {
  key: string
  value: unknown
  source: ValueSource
  envVar?: string
  revision?: number
}

export interface EffectiveConfigResponse {
  target: string
  publishedVersion: number
  catalogVersion: string
  values: ResolvedValue[]
}

export interface DiffEntry {
  key: string
  from?: unknown
  to?: unknown
  danger: 'safe' | 'caution' | 'dangerous'
}

export interface HistoryEntry {
  version: number
  status: 'draft' | 'published' | 'superseded' | 'discarded'
  createdBy: string
  createdAt: string
  publishedBy?: string
  publishedAt?: string
  reason?: string
  diff: DiffEntry[]
  origin: { kind: string; ref?: string }
  approvedBy?: string
}

export interface SaveDraftResponse {
  target: string
  version: number
  draftRev: number
  overrides: Record<string, unknown>
}

export interface PreviewPublishResponse {
  target: string
  draftVersion: number
  basedOnVersion: number
  diff: DiffEntry[]
  impact: { activeTenants: number; approximate: boolean }
  danger: 'safe' | 'caution' | 'dangerous'
  restartCount: number
  requiresReason: boolean
  requiresTypedApproval: boolean
}

export interface PublishResponse {
  target: string
  version: number
  publishedVersion: number
  diff: DiffEntry[]
}

export function useIntegrationConfigApi() {
  const restApi = useRestApi()
  const call = (operation: string, body: Record<string, unknown> = {}) => restApi.post(`${SERVICE}/${operation}`, body)

  return {
    list: (): Promise<any> => call('list'),
    getEffectiveConfig: (target: string): Promise<any> => call('getEffectiveConfig', { target }),
    history: (target: string, limit = 50): Promise<any> => call('history', { target, limit }),
    saveDraft: (target: string, patch: Record<string, unknown>, unset?: string[], expectedDraftRev?: number): Promise<any> =>
      call('saveDraft', { target, patch, unset, expectedDraftRev }),
    discardDraft: (target: string, expectedDraftRev: number): Promise<any> => call('discardDraft', { target, expectedDraftRev }),
    previewPublish: (target: string): Promise<any> => call('previewPublish', { target }),
    publish: (target: string, payload: { reason?: string; typedConfirmation?: string; approvedBy?: string }): Promise<any> =>
      call('publish', { target, ...payload }),
    rollback: (target: string, toVersion: number, payload: { reason?: string; typedConfirmation?: string; approvedBy?: string }): Promise<any> =>
      call('rollback', { target, toVersion, ...payload }),
    takeOverLock: (target: string): Promise<any> => call('takeOverLock', { target }),
    testEndpoint: (target: string, mode: 'static' | 'replay' | 'live', key?: string, value?: unknown): Promise<any> =>
      call('testEndpoint', { target, mode, key, value }),
  }
}
