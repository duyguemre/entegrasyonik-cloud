/**
 * Genel bakış triyajı — "dikkat gerektirenler" + "nabız" (K51, BO1-DASH). [ÖNERİ — BE yazılıyor]
 * Uçlar: `BackofficeOverviewService/getAttention`, `BackofficeOverviewService/getPulse`.
 * Resmî sözleşme `docs/cloud-contracts/API_BACKOFFICE_ATTENTION.md` gelene dek bu dosya ÖNERİDİR
 * (`frontend/backoffice/docs/ATTENTION_CONTRACT_PROPOSAL.md`). Ekranlar bu tipleri DOĞRUDAN kullanmaz;
 * `src/api/attention.ts` adaptörü görünüm modeline çevirir (sözleşme değişirse yalnız adaptör değişir).
 */

export type AttentionSeverity = 'critical' | 'warning' | 'info'
export type AttentionScope = 'system' | 'tenant'

/**
 * Bilinen türler. Metin (ne oldu / ne yapmalı) istemcide `kind`'e göre kurulur; bilinmeyen tür genel metinle gösterilir.
 * Sistem: dependency.down, queue.dlq, queue.backlog, queue.unavailable, breaker.open, integration.error_rate,
 *   integration.latency, issue.spike, alert.firing, intake.restricted
 * Müşteri: tenant.integration_failing, tenant.auth_failed, tenant.sync_lag, tenant.payment_failed, tenant.trial_ending,
 *   tenant.suspended, tenant.provisioning_failed, tenant.deletion_pending, tenant.support_waiting
 */
export type AttentionKind = string

export interface AttentionTarget {
  /** Ekran kaydı anahtarı (`navigation/screens.ts`) ya da detay rota adı (`tenant`, `subscription`). */
  screen: string
  /** Detay rotası parametreleri (ör. `{ tid: 107 }`). */
  params?: Record<string, string | number>
  /** Hedef ekranda önceden uygulanacak süzgeç (ör. `{ sekme: 'basarisiz', kaynak: 'dlq' }`). */
  query?: Record<string, string>
}

export interface AttentionItemDto {
  /** Kararlı kimlik (`<kind>:<anahtar>`); aynı sorun yenilemelerde aynı id ile gelir. */
  id: string
  scope: AttentionScope
  severity: AttentionSeverity
  kind: AttentionKind
  /** Durumun başladığı an (ISO). */
  since: string
  /** Metin parametreleri — yalnız sayı, kod, kısa ad; yük/hata METNİ yok. */
  facts: {
    count?: number
    tenantCount?: number
    rate?: number
    thresholdRate?: number
    valueMs?: number
    integrationCode?: string
    queue?: string
    daysLeft?: number
    dependency?: 'mongo' | 'redis'
    errorCode?: string
    step?: string
  }
  tid?: number
  tenantName?: string | null
  target: AttentionTarget
  /** Kaynak kayıt (sorun parmak izi, uyarı id'si) — iz bağlantısı için. */
  ref?: { fp?: string; alertId?: string }
}

export interface GetAttentionResponse {
  generatedAt: string
  /** critical > 0 → 'critical'; warning > 0 → 'warning'; aksi 'ok'. Okunamayan kaynak varsa `degradedSources` doludur. */
  status: 'ok' | 'warning' | 'critical'
  counts: Record<AttentionScope, Record<AttentionSeverity, number>>
  /** Önem sırasına dizili (critical → warning → info, sonra `since` eskiden yeniye). Sınır: kapsam başına 25. */
  items: AttentionItemDto[]
  /** Hangi denetimler yapıldı — "her şey yolunda" durumunda neyin denetlendiğini söylemek için. */
  checks: Array<{ key: string; scope: AttentionScope; status: 'ok' | 'degraded' }>
  /** Okunamayan kaynaklar (bölüm düşmez, liste eksik olabilir). */
  degradedSources: string[]
}

export type PulseRange = '24h' | '7d'
export interface PulsePoint {
  t: string
  v: number | null
}
export interface PulseMetric {
  value: number | null
  /** Önceki eş dönem (24h → dünkü aynı saatler, 7d → önceki 7 gün); yoksa null. */
  previous: number | null
  series: PulsePoint[]
}
export interface GetPulseResponse {
  generatedAt: string
  range: PulseRange
  system: {
    requestsPerMinute: PulseMetric
    errorRate: PulseMetric
    p95Ms: PulseMetric
    ordersProcessed: PulseMetric
    catalogPublished: PulseMetric
  }
  customers: {
    active: number
    trialing: number
    pastDue: number
    suspended: number
    deletionPending: number
    newInRange: number
    churnedInRange: number
    /** Aylık yinelenen gelir (kuruş) para birimine göre. */
    mrrMinor: Record<string, number>
    /** Önceki eş dönemdeki MRR (kuruş). */
    mrrPreviousMinor: Record<string, number>
  }
  usage: {
    connectedChannels: Array<{ code: string; tenants: number }>
    activeTenantsInRange: number
  }
  degradedSources: string[]
}

declare module '../contract' {
  interface AdminRpc {
    'BackofficeOverviewService/getAttention': [Record<string, never>, GetAttentionResponse]
    'BackofficeOverviewService/getPulse': [{ range?: PulseRange }, GetPulseResponse]
  }
}
