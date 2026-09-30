/**
 * frontend/src/design/status-map.ts
 *
 * ADR-0015 Karar 3.3 — "Alan eşlemesi tek dosyadadır" (saf TS, Vue import'u
 * YASAK). Ekranlar renk SEÇMEZ, yalnızca durum KODU verir; bu dosya kodu
 * `tone` (5 anlamsal ton) + `labelKey` (i18n) çiftine çevirir. `EkStatusChip`
 * bu haritayı tüketir (çıplak `v-chip` + renk YASAKTIR).
 *
 * Kaynak enum'lar `src/types/**`'te ZATEN tanımlı (`OrderInternalStatusEnum`
 * vb.) — bu dosya onları YENİDEN TANIMLAMAZ, yalnızca `tone`'a ÇEVİRİR.
 * `labelKey`'ler `src/plugins/locales/tr.json`'daki YENİ `status.*`
 * ad alanına karşılık gelir; METİNLER mevcut `*_LABELS` sabitleriyle
 * BİREBİR AYNIDIR (görünür metin değişmez, yalnızca kaynak TEKİLLEŞİR).
 *
 * **Kapsam notu (A2):** entegrasyon bağlantı durumu (N7 "Entegrasyon
 * sağlığı", B4) ve `IntegrationInternalStatusEnum`'ın backend'deki TAM
 * kod kümesi bu görevde doğrulanamadı — `INTEGRATION_CONNECTION_TONE` bu
 * yüzden 3 durumlu MANTIKLI bir iskelet olarak eklendi, N7 backend
 * sözleşmesi netleştiğinde anahtarlar güncellenecek (BACKLOG TODO).
 */
import { OrderInternalStatusEnum } from '@/types/OrderTypes'
import { ClaimInternalStatusEnum } from '@/types/ClaimTypes'
import { MessageStatusEnum } from '@/types/MessageTypes'
import { TicketStatusEnum } from '@/types/TicketTypes'
import { InvoiceStatusEnum } from '@/types/InvoiceTypes'

import type { StatusTone } from '@entegrasyonik/ui/components/statusTone'
export type { StatusTone }

export interface StatusMapEntry {
  tone: StatusTone
  /** `src/plugins/locales/tr.json` `status.*` ad alanındaki anahtar. */
  labelKey: string
}

// ---- Sipariş iç durumu (OrderInternalStatusEnum) ----
export const ORDER_STATUS_TONE: Record<OrderInternalStatusEnum, StatusMapEntry> = {
  [OrderInternalStatusEnum.UNAPPROVED]: { tone: 'warning', labelKey: 'status.order.unapproved' },
  [OrderInternalStatusEnum.AWAITING_APPROVAL]: { tone: 'warning', labelKey: 'status.order.awaitingApproval' },
  [OrderInternalStatusEnum.APPROVED]: { tone: 'info', labelKey: 'status.order.approved' },
  [OrderInternalStatusEnum.SHIPPED]: { tone: 'info', labelKey: 'status.order.shipped' },
  [OrderInternalStatusEnum.DELIVERED]: { tone: 'success', labelKey: 'status.order.delivered' },
  [OrderInternalStatusEnum.CANCELLED]: { tone: 'danger', labelKey: 'status.order.cancelled' },
  [OrderInternalStatusEnum.RETURNED]: { tone: 'danger', labelKey: 'status.order.returned' },
}

// ---- İade/talep durumu (ClaimInternalStatusEnum) ----
export const CLAIM_STATUS_TONE: Record<ClaimInternalStatusEnum, StatusMapEntry> = {
  [ClaimInternalStatusEnum.WAITING]: { tone: 'info', labelKey: 'status.claim.waiting' },
  [ClaimInternalStatusEnum.UNDER_REVIEW]: { tone: 'warning', labelKey: 'status.claim.underReview' },
  [ClaimInternalStatusEnum.APPROVED]: { tone: 'success', labelKey: 'status.claim.approved' },
  [ClaimInternalStatusEnum.REJECTED]: { tone: 'success', labelKey: 'status.claim.rejected' },
  [ClaimInternalStatusEnum.CANCELLED]: { tone: 'neutral', labelKey: 'status.claim.cancelled' },
  [ClaimInternalStatusEnum.DISPUTED]: { tone: 'warning', labelKey: 'status.claim.disputed' },
  [ClaimInternalStatusEnum.COMPLETED]: { tone: 'success', labelKey: 'status.claim.completed' },
}

// ---- Mesaj durumu (MessageStatusEnum) ----
export const MESSAGE_STATUS_TONE: Record<MessageStatusEnum, StatusMapEntry> = {
  [MessageStatusEnum.WAITING_SELLER]: { tone: 'warning', labelKey: 'status.message.waitingSeller' },
  [MessageStatusEnum.ANSWERED]: { tone: 'success', labelKey: 'status.message.answered' },
  [MessageStatusEnum.REJECTED]: { tone: 'danger', labelKey: 'status.message.rejected' },
  [MessageStatusEnum.UNREAD]: { tone: 'info', labelKey: 'status.message.unread' },
  [MessageStatusEnum.READ]: { tone: 'neutral', labelKey: 'status.message.read' },
  [MessageStatusEnum.WAITING_APPROVAL]: { tone: 'warning', labelKey: 'status.message.waitingApproval' },
}

// ---- Destek talebi durumu (TicketStatusEnum) ----
export const TICKET_STATUS_TONE: Record<TicketStatusEnum, StatusMapEntry> = {
  [TicketStatusEnum.OPEN]: { tone: 'info', labelKey: 'status.ticket.open' },
  [TicketStatusEnum.IN_PROGRESS]: { tone: 'warning', labelKey: 'status.ticket.inProgress' },
  [TicketStatusEnum.WAITING_CLIENT]: { tone: 'warning', labelKey: 'status.ticket.waitingClient' },
  [TicketStatusEnum.RESOLVED]: { tone: 'success', labelKey: 'status.ticket.resolved' },
  [TicketStatusEnum.CLOSED]: { tone: 'neutral', labelKey: 'status.ticket.closed' },
}

// ---- Fatura/iş durumu (InvoiceStatusEnum — "iş/log durumları" ailesi) ----
export const INVOICE_STATUS_TONE: Record<InvoiceStatusEnum, StatusMapEntry> = {
  [InvoiceStatusEnum.DRAFT]: { tone: 'neutral', labelKey: 'status.invoice.draft' },
  [InvoiceStatusEnum.QUEUED]: { tone: 'neutral', labelKey: 'status.invoice.queued' },
  [InvoiceStatusEnum.PROCESSING]: { tone: 'info', labelKey: 'status.invoice.processing' },
  [InvoiceStatusEnum.APPROVED]: { tone: 'success', labelKey: 'status.invoice.approved' },
  [InvoiceStatusEnum.FAILED]: { tone: 'danger', labelKey: 'status.invoice.failed' },
  [InvoiceStatusEnum.CANCELLED]: { tone: 'neutral', labelKey: 'status.invoice.cancelled' },
}

// ---- İş/log durumu (genel, 5 aşamalı — ECharts CHART_STATUS ile AYNI kaynak) ----
export type JobStatus = 'queued' | 'processing' | 'completed' | 'partial' | 'failed'

export const JOB_STATUS_TONE: Record<JobStatus, StatusMapEntry> = {
  queued: { tone: 'neutral', labelKey: 'status.job.queued' },
  processing: { tone: 'info', labelKey: 'status.job.processing' },
  completed: { tone: 'success', labelKey: 'status.job.completed' },
  partial: { tone: 'warning', labelKey: 'status.job.partial' },
  failed: { tone: 'danger', labelKey: 'status.job.failed' },
}

// ---- Abonelik durumu (ADR-0008; SubscriptionView.vue'daki GERÇEK kod kümesi) ----
export type SubscriptionStatus = 'no_subscription' | 'trialing' | 'active' | 'past_due' | 'canceled'

export const SUBSCRIPTION_STATUS_TONE: Record<SubscriptionStatus, StatusMapEntry> = {
  no_subscription: { tone: 'neutral', labelKey: 'status.subscription.noSubscription' },
  trialing: { tone: 'info', labelKey: 'status.subscription.trialing' },
  active: { tone: 'success', labelKey: 'status.subscription.active' },
  past_due: { tone: 'warning', labelKey: 'status.subscription.pastDue' },
  canceled: { tone: 'danger', labelKey: 'status.subscription.canceled' },
}

// ---- Mağaza aktif/pasif (Clients.isActive: boolean) ----
export function storeStatusTone(isActive: boolean): StatusMapEntry {
  return isActive
    ? { tone: 'success', labelKey: 'status.store.active' }
    : { tone: 'neutral', labelKey: 'status.store.passive' }
}

// ---- Entegrasyon bağlantı durumu (İSKELET — bkz. dosya başı "Kapsam notu") ----
export type IntegrationConnectionStatus = 'connected' | 'disconnected' | 'error'

export const INTEGRATION_CONNECTION_TONE: Record<IntegrationConnectionStatus, StatusMapEntry> = {
  connected: { tone: 'success', labelKey: 'status.integration.connected' },
  disconnected: { tone: 'neutral', labelKey: 'status.integration.disconnected' },
  error: { tone: 'danger', labelKey: 'status.integration.error' },
}

// ---- ADR-0020 Karar 4.2 — ayar tehlike rozeti (`SettingDef.danger`). `safe` rozet GÖSTERMEZ
// (Karar 4.2 "`safe` rozet göstermez") — bu yüzden harita `null` döner, çağıran rozeti hiç render etmez. ----
export type SettingDanger = 'safe' | 'caution' | 'dangerous'

export const SETTING_DANGER_TONE: Record<SettingDanger, StatusMapEntry | null> = {
  safe: null,
  caution: { tone: 'warning', labelKey: 'status.setting.caution' },
  dangerous: { tone: 'danger', labelKey: 'status.setting.dangerous' },
}

// ---- ADR-0020 Karar 3.8/3.1 — entegrasyon kabul durumu (`IntegrationConfigHeads.intake`).
// Aşama D (`setIntake` yazma ucu + bakım modu) henüz BAĞLANMADI; bu harita yalnızca `list()`'in
// bugün döndürdüğü salt-okunur `intake` alanını (varsayılan `'on'`) göstermek içindir. ----
export type ConfigIntakeStatus = 'on' | 'drain' | 'off'

export const CONFIG_INTAKE_TONE: Record<ConfigIntakeStatus, StatusMapEntry> = {
  on: { tone: 'success', labelKey: 'status.configIntake.on' },
  drain: { tone: 'warning', labelKey: 'status.configIntake.drain' },
  off: { tone: 'danger', labelKey: 'status.configIntake.off' },
}

// ---- ADR-0020 Karar 3.1 — revizyon durumu (`IntegrationConfigRevisions.status`, sürüm geçmişi tablosu). ----
export type ConfigRevisionStatus = 'draft' | 'published' | 'superseded' | 'discarded'

export const CONFIG_REVISION_STATUS_TONE: Record<ConfigRevisionStatus, StatusMapEntry> = {
  draft: { tone: 'info', labelKey: 'status.configRevision.draft' },
  published: { tone: 'success', labelKey: 'status.configRevision.published' },
  superseded: { tone: 'neutral', labelKey: 'status.configRevision.superseded' },
  discarded: { tone: 'neutral', labelKey: 'status.configRevision.discarded' },
}

// ---- ADR-0018 Karar 2 — entegrasyon uyum bulgusu (`IntegrationFinding`) şiddeti ve yaşam döngüsü durumu.
// Şiddet: critical/high → danger (ikisi de "müşteriyi etkileyebilir", ayrım METİNDE); medium → warning;
// low → info; info → neutral (ADR: `doc` bulguları her zaman `info`, alarm üretmez). Durum: açık üçlü
// (new/triaged/accepted) dikkat ister; kapalı üçlüden yalnız `fixed` başarıdır, `wontfix`/`false_positive` nötr. ----
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export const FINDING_SEVERITY_TONE: Record<FindingSeverity, StatusMapEntry> = {
  critical: { tone: 'danger', labelKey: 'status.findingSeverity.critical' },
  high: { tone: 'danger', labelKey: 'status.findingSeverity.high' },
  medium: { tone: 'warning', labelKey: 'status.findingSeverity.medium' },
  low: { tone: 'info', labelKey: 'status.findingSeverity.low' },
  info: { tone: 'neutral', labelKey: 'status.findingSeverity.info' },
}

export type FindingStatus = 'new' | 'triaged' | 'accepted' | 'fixed' | 'wontfix' | 'false_positive'

export const FINDING_STATUS_TONE: Record<FindingStatus, StatusMapEntry> = {
  new: { tone: 'warning', labelKey: 'status.findingStatus.new' },
  triaged: { tone: 'info', labelKey: 'status.findingStatus.triaged' },
  accepted: { tone: 'info', labelKey: 'status.findingStatus.accepted' },
  fixed: { tone: 'success', labelKey: 'status.findingStatus.fixed' },
  wontfix: { tone: 'neutral', labelKey: 'status.findingStatus.wontfix' },
  false_positive: { tone: 'neutral', labelKey: 'status.findingStatus.falsePositive' },
}

// ---- ADR-0017 `JobState.lastStatus` (zamanlanmış iş koşu sonucu; ADR-0018 uyum konsolunda son probe turu).
// Karar 3.3 "canlı iş-durumu paleti" ile aynı ilke: tamamlandı → success, kısmi → warning, hatalı → danger;
// `skipped` (ör. canlı probe kimlikleri yok) hata değil → neutral. ----
export type JobRunOutcome = 'ok' | 'partial' | 'failed' | 'skipped'

export const JOB_RUN_OUTCOME_TONE: Record<JobRunOutcome, StatusMapEntry> = {
  ok: { tone: 'success', labelKey: 'status.jobRunOutcome.ok' },
  partial: { tone: 'warning', labelKey: 'status.jobRunOutcome.partial' },
  failed: { tone: 'danger', labelKey: 'status.jobRunOutcome.failed' },
  skipped: { tone: 'neutral', labelKey: 'status.jobRunOutcome.skipped' },
}

// ---- ADR-0004 / docs/API_TENANT_SURFACE.md §2 — sipariş kalemi stok tahsis durumu
// (`Orders.items[].allocationState`; backend şeması `Order.ts` enum'uyla AYNI 6 kod). Kalem durumu
// sipariş durumundan AYRIDIR: siparişin kendisi onaylı olsa da kalemi stokta karşılanamamış olabilir. ----
export const ALLOCATION_STATES = ['RESERVED', 'COMMITTED', 'RELEASED', 'OVERSOLD', 'RESTOCKED', 'UNMAPPED'] as const
export type AllocationState = (typeof ALLOCATION_STATES)[number]

export const ALLOCATION_STATE_TONE: Record<AllocationState, StatusMapEntry> = {
  RESERVED: { tone: 'info', labelKey: 'status.allocation.reserved' },
  COMMITTED: { tone: 'success', labelKey: 'status.allocation.committed' },
  RELEASED: { tone: 'neutral', labelKey: 'status.allocation.released' },
  OVERSOLD: { tone: 'danger', labelKey: 'status.allocation.oversold' },
  RESTOCKED: { tone: 'neutral', labelKey: 'status.allocation.restocked' },
  UNMAPPED: { tone: 'warning', labelKey: 'status.allocation.unmapped' },
}
