// frontend/src/components/adminPanel/integrations/useIntegrationComplianceApi.ts
//
// ADR-0018 Karar 2 "Konsol" + Karar 4 "Aşama B" — `IntegrationComplianceService` (backend HAZIR,
// `backend/src/api/services/integration-compliance-service.ts`) için tek RPC istemcisi.
// Desen `useIntegrationConfigApi.ts` ile AYNI: `restApi.post` ağ/HTTP hatasında REDDETMEZ, ham axios
// hata nesnesini "başarılı" değer olarak döner — ayrım `isErrorShapedResponse` ile yapılır (tek kaynak,
// yeniden tanımlanmaz, aşağıda yeniden dışa aktarılır).
//
// Tipler backend DTO'larının (`toListDto`/`toDetailDto`/`summary()`) BİREBİR yansımasıdır; alan
// UYDURULMAZ. Tarihler JSON'dan string olarak gelir.
import useRestApi from '@/composables/restapi'
import { isErrorShapedResponse, serverErrorMessage } from './useIntegrationConfigApi'

export { isErrorShapedResponse, serverErrorMessage }

const SERVICE = 'IntegrationComplianceService'

// Backend `IntegrationFinding.ts` enum'larıyla BİREBİR (sıra dahil).
export const FINDING_KINDS = ['schema', 'unknown_enum', 'endpoint', 'version', 'deprecation', 'auth', 'ratelimit', 'doc'] as const
export type FindingKind = typeof FINDING_KINDS[number]

export const FINDING_SOURCES = ['guard', 'probe', 'source_monitor', 'manual', 'agent'] as const
export type FindingSource = typeof FINDING_SOURCES[number]

export const FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const
export type FindingSeverity = typeof FINDING_SEVERITIES[number]

export const FINDING_STATUSES = ['new', 'triaged', 'accepted', 'fixed', 'wontfix', 'false_positive'] as const
export type FindingStatus = typeof FINDING_STATUSES[number]

/** Backend `INTEGRATION_CATEGORIES` (`integration/catalog/types.ts`) ile BİREBİR. */
export const INTEGRATION_CATEGORIES = ['marketplace', 'ecommerce', 'erp', 'einvoice', 'shipping'] as const
export type IntegrationCategory = typeof INTEGRATION_CATEGORIES[number]

/** `transition()` `TRANSITION_ACTIONS` ile BİREBİR ('new' hedefi YOK — yalnız `report()` regresyonu). */
export const TRANSITION_ACTIONS = ['triage', 'accept', 'wontfix', 'false_positive', 'fixed'] as const
export type TransitionAction = typeof TRANSITION_ACTIONS[number]

/** `FindingService.transition` `statusByAction` ile BİREBİR. */
export const STATUS_BY_ACTION: Record<TransitionAction, FindingStatus> = {
  triage: 'triaged', accept: 'accepted', wontfix: 'wontfix', false_positive: 'false_positive', fixed: 'fixed',
}

/** Backend `CLOSED_STATUSES` ile BİREBİR. */
export const CLOSED_STATUSES: readonly FindingStatus[] = ['fixed', 'wontfix', 'false_positive']

/** `FindingService.transition` kırpma sınırları (notes 500, fixRef 200, fixedInAdapterVersion 32). */
export const TRANSITION_LIMITS = { reason: 500, fixRef: 200, fixedInAdapterVersion: 32 } as const

/** `IntegrationFinding.evidence` (REDAKTE — yazım anında `redactEvidence`'tan geçmiş). */
export interface FindingEvidence {
  paths?: string[]
  types?: string[]
  enumValue?: string
  httpStatus?: number
  headerNames?: string[]
  sunsetAt?: string
  docDiff?: string
  fingerprint?: string
}

/** `toListDto()` çıktısı. */
export interface FindingListItem {
  dedupKey: string
  integrationCode: string
  category: string
  kind: FindingKind
  source: FindingSource
  subjectKey: string
  severity: FindingSeverity
  status: FindingStatus
  confirmed: boolean
  occurrences: number
  firstSeenAt: string
  lastSeenAt: string
  affectedTenantsCount: number
  adapterVersionSeen?: string
  fixedInAdapterVersion?: string
  fixRef?: string
}

/** `toDetailDto()` çıktısı. `affectedTenants` (kimlik listesi) bu ekranda BİLİNÇLİ OLARAK GÖSTERİLMEZ — yalnız sayı. */
export interface FindingDetail extends FindingListItem {
  affectedTenants: number[]
  evidence?: FindingEvidence
  recommendation?: string
  decidedBy?: string
  decidedAt?: string
  notes?: string
  closedAt?: string
}

/** `summary()` → `lastProbeRun` (JobState `compliance.probeRunner`; TEK platform-düzeyi koşu). */
export interface LastProbeRun {
  name: string
  lastFinishedAt: string | null
  lastStatus: 'ok' | 'partial' | 'failed' | 'skipped' | null
  lastCounts: unknown
}

/** `summary()` dizisinin bir elemanı (entegrasyon başına özet kartı). */
export interface ComplianceSummaryItem {
  integrationCode: string
  displayName: string
  category: string
  adapterVersion: string
  lastVerifiedAt: string | null
  openFindings: { total: number; bySeverity: Record<FindingSeverity, number> }
  lastProbeRun: LastProbeRun | null
}

export interface FindingListFilter {
  integrationCode?: string
  category?: IntegrationCategory
  kind?: FindingKind
  severity?: FindingSeverity
  status?: FindingStatus
}

export interface TransitionInput {
  action: TransitionAction
  reason?: string
  fixRef?: string
  fixedInAdapterVersion?: string
}

/** Boş/null filtre değerlerini gövdeye YAZMAZ (backend `assertOneOf` boş dizeyi zaten yok sayar; gövde sade kalır). */
export function buildListBody(filter: FindingListFilter): Record<string, string> {
  const body: Record<string, string> = {}
  for (const key of ['integrationCode', 'category', 'kind', 'severity', 'status'] as const) {
    const value = filter[key]
    if (typeof value === 'string' && value) body[key] = value
  }
  return body
}

/**
 * FE ön doğrulaması (backend tek doğruluk kaynağı olarak KALIR): `fixed` için `fixRef` zorunlu;
 * diğer eylemlerde gerekçe opsiyonel. Uzunluk sınırları backend kırpma sınırlarıyla aynı (sessiz kırpma yerine
 * kullanıcıya önceden söylenir). Hata yoksa `null`, varsa alan → i18n anahtarı haritası döner.
 */
export function validateTransition(input: Partial<TransitionInput>): Partial<Record<'action' | 'reason' | 'fixRef' | 'fixedInAdapterVersion', string>> | null {
  const errors: Partial<Record<'action' | 'reason' | 'fixRef' | 'fixedInAdapterVersion', string>> = {}
  if (!input.action || !(TRANSITION_ACTIONS as readonly string[]).includes(input.action)) errors.action = 'integrationCompliance.decision.errors.actionRequired'
  const reason = (input.reason ?? '').trim()
  if (reason.length > TRANSITION_LIMITS.reason) errors.reason = 'integrationCompliance.decision.errors.reasonTooLong'
  if (input.action === 'fixed') {
    const fixRef = (input.fixRef ?? '').trim()
    if (!fixRef) errors.fixRef = 'integrationCompliance.decision.errors.fixRefRequired'
    else if (fixRef.length > TRANSITION_LIMITS.fixRef) errors.fixRef = 'integrationCompliance.decision.errors.fixRefTooLong'
    if ((input.fixedInAdapterVersion ?? '').trim().length > TRANSITION_LIMITS.fixedInAdapterVersion) {
      errors.fixedInAdapterVersion = 'integrationCompliance.decision.errors.versionTooLong'
    }
  }
  return Object.keys(errors).length ? errors : null
}

/**
 * `transition()` istek gövdesi: `id` + `action` + YALNIZCA dolu opsiyonel alanlar. `fixRef`/
 * `fixedInAdapterVersion` yalnız `fixed` eyleminde gönderilir (başka eylemde anlamsız).
 */
export function buildTransitionBody(id: string, input: TransitionInput): Record<string, string> {
  const body: Record<string, string> = { id, action: input.action }
  const reason = (input.reason ?? '').trim()
  if (reason) body.reason = reason
  if (input.action === 'fixed') {
    const fixRef = (input.fixRef ?? '').trim()
    if (fixRef) body.fixRef = fixRef
    const version = (input.fixedInAdapterVersion ?? '').trim()
    if (version) body.fixedInAdapterVersion = version
  }
  return body
}

/** Mevcut duruma geçişi anlamsız kılan eylemi (hedef == mevcut durum) eler; backend başka kısıt KOYMAZ. */
export function availableActions(status: FindingStatus): TransitionAction[] {
  return TRANSITION_ACTIONS.filter((a) => STATUS_BY_ACTION[a] !== status)
}

export function useIntegrationComplianceApi() {
  const restApi = useRestApi()
  const call = (operation: string, body: Record<string, unknown> = {}) => restApi.post(`${SERVICE}/${operation}`, body)

  return {
    list: (filter: FindingListFilter = {}): Promise<any> => call('list', buildListBody(filter)),
    summary: (): Promise<any> => call('summary'),
    getDetail: (id: string): Promise<any> => call('getDetail', { id }),
    transition: (id: string, input: TransitionInput): Promise<any> => call('transition', buildTransitionBody(id, input)),
  }
}
