/**
 * frontend/src/components/ticket/composables/ticketRules.ts
 *
 * A6a — destek talebi diyaloglarının SAF mantığı (Vue/DOM YOK, vitest ile test edilir):
 * doğrulama, karakter sayacı, gönderim durum makinesi, hata metni, zaman çizgisi.
 *
 * Sözleşme kaynağı: backend/src/api/services/ticket-service.ts
 *  - `openTicket`: `{ ticket: { subject, type, priority, message } }` — backend uzunluk/biçim doğrulaması YAPMAZ.
 *    Yalnızca `message.substring(0, 100)` ile özet üretir; `messages[0].attachments` SABİT `[]` (EK KABUL EDİLMEZ).
 *  - `sendTicketMessage`: `{ ticketId, content, senderType }`; müşteri yazınca durum `IN_PROGRESS` olur.
 *  - `closeTicket`: yalnız `status = CLOSED` + `updatedDate` yazar (durum geçmişi TUTULMAZ).
 * Aşağıdaki uzunluk sınırları bu yüzden İSTEMCİ sınırıdır: konu, listede/özet satırında tek satırda
 * okunabilsin diye 120; açıklama ve yanıt, tek bir mesajın makul üst sınırı olarak 4000 karakter.
 */
import { TicketPriorityEnum, TicketStatusEnum, TicketTypeEnum } from '@/types/TicketTypes'

export const SUBJECT_MAX = 120
export const MESSAGE_MAX = 4000
export const REPLY_MAX = 4000

// ---------------------------------------------------------------- seçenek üst verisi

export interface ChoiceMeta {
  icon: string
  description: string
}

/** Talep tipi kartları — yalnızca `TicketTypeEnum`'un gerçek değerleri. */
export const TICKET_TYPE_META: Record<TicketTypeEnum, ChoiceMeta> = {
  [TicketTypeEnum.GENERAL]: { icon: 'mdi-help-circle-outline', description: 'Genel bilgi ve kullanım soruları' },
  [TicketTypeEnum.TECHNICAL]: { icon: 'mdi-wrench-outline', description: 'Entegrasyon ve senkronizasyon sorunları' },
  [TicketTypeEnum.BILLING]: { icon: 'mdi-receipt-text-outline', description: 'Fatura, ödeme ve abonelik konuları' },
  [TicketTypeEnum.FEATURE_REQUEST]: { icon: 'mdi-lightbulb-on-outline', description: 'Yeni özellik veya iyileştirme önerisi' },
  [TicketTypeEnum.BUG]: { icon: 'mdi-bug-outline', description: 'Beklenmedik davranış veya hata bildirimi' },
  [TicketTypeEnum.OTHER]: { icon: 'mdi-dots-horizontal-circle-outline', description: 'Diğer başlıklara uymayan konular' },
}

/** Öncelik seçenekleri — yalnızca `TicketPriorityEnum`'un gerçek değerleri. */
export const TICKET_PRIORITY_META: Record<TicketPriorityEnum, ChoiceMeta> = {
  [TicketPriorityEnum.LOW]: { icon: 'mdi-arrow-down', description: 'Zaman kısıtı yok' },
  [TicketPriorityEnum.MEDIUM]: { icon: 'mdi-minus', description: 'Olağan talep' },
  [TicketPriorityEnum.HIGH]: { icon: 'mdi-arrow-up', description: 'İşimi aksatıyor' },
  [TicketPriorityEnum.URGENT]: { icon: 'mdi-alert-outline', description: 'İş akışım durdu' },
}

// ---------------------------------------------------------------- doğrulama

export interface TicketDraft {
  subject: string
  type: TicketTypeEnum
  priority: TicketPriorityEnum
  message: string
}

export type DraftErrors = Partial<Record<'subject' | 'message', string>>

export function emptyDraft(): TicketDraft {
  return { subject: '', type: TicketTypeEnum.GENERAL, priority: TicketPriorityEnum.MEDIUM, message: '' }
}

/** Boş/uzun konu ve açıklama için insan-okunur (ne oldu — ne yapılmalı) mesajlar. */
export function validateDraft(draft: Pick<TicketDraft, 'subject' | 'message'>): DraftErrors {
  const errors: DraftErrors = {}
  const subject = draft.subject.trim()
  const message = draft.message.trim()
  if (!subject) errors.subject = 'Konu zorunludur — talebi tek cümleyle özetleyin.'
  else if (subject.length > SUBJECT_MAX) errors.subject = `Konu en fazla ${SUBJECT_MAX} karakter olabilir — daha kısa özetleyin, ayrıntıyı açıklamaya yazın.`
  if (!message) errors.message = 'Mesaj alanı zorunludur — sorununuzu veya talebinizi açıklayın.'
  else if (draft.message.length > MESSAGE_MAX) errors.message = `Açıklama en fazla ${MESSAGE_MAX} karakter olabilir — metni kısaltın.`
  return errors
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.keys(errors).length > 0
}

/** Backend'e giden gövde: alanlar ve anahtarlar DEĞİŞMEZ (`ticket.subject/type/priority/message`). */
export function buildOpenTicketPayload(draft: TicketDraft) {
  return { subject: draft.subject.trim(), type: draft.type, priority: draft.priority, message: draft.message.trim() }
}

// ---------------------------------------------------------------- karakter sayacı

export type CounterLevel = 'ok' | 'warn' | 'over'

export interface CounterState {
  used: number
  max: number
  remaining: number
  level: CounterLevel
  /** Görünen sayaç: "128 / 4000". */
  label: string
}

/** Uyarı eşiği: sınırın %90'ı. */
export const COUNTER_WARN_RATIO = 0.9

export function counterState(text: string, max: number): CounterState {
  const used = text.length
  const remaining = max - used
  const level: CounterLevel = used > max ? 'over' : used >= Math.floor(max * COUNTER_WARN_RATIO) ? 'warn' : 'ok'
  return { used, max, remaining, level, label: `${used} / ${max}` }
}

/**
 * Ekran okuyucu duyurusu (aria-live polite). Her tuş vuruşunda okumak gürültüdür; bu yüzden yalnızca
 * eşik aşıldığında ve sınırda/aşımda, sınıra yaklaşırken de her 50 karakterde bir metin döner.
 * Duyuru gerekmiyorsa boş dize (canlı bölge önceki metni korur, tekrar okunmaz).
 */
export function counterAnnouncement(text: string, max: number): string {
  const c = counterState(text, max)
  if (c.level === 'over') return `Sınır ${-c.remaining} karakter aşıldı. Metni kısaltın.`
  if (c.level === 'warn') {
    if (c.remaining === 0) return 'Karakter sınırına ulaşıldı.'
    if (c.remaining % 50 === 0 || c.used === Math.floor(max * COUNTER_WARN_RATIO)) return `${c.remaining} karakter kaldı.`
  }
  return ''
}

// ---------------------------------------------------------------- gönderim durum makinesi

export type SubmitPhase = 'idle' | 'submitting' | 'success' | 'error'

export interface SubmitError {
  title: string
  hint: string
}

export interface SubmitState<T = unknown> {
  phase: SubmitPhase
  error: SubmitError | null
  result: T | null
}

export type SubmitAction<T = unknown> =
  | { type: 'submit' }
  | { type: 'resolve'; result: T }
  | { type: 'reject'; error: SubmitError }
  | { type: 'reset' }

export function initialSubmitState<T = unknown>(): SubmitState<T> {
  return { phase: 'idle', error: null, result: null }
}

/**
 * idle/error → submit → submitting → resolve → success | reject → error.
 * `submitting` iken ikinci `submit` YOK SAYILIR (çift gönderim yok); `success` yalnızca `reset` ile çıkılır.
 * Hata durumunda girilen içerik bu makinenin DIŞINDA (taslak) tutulur — hata onu silmez.
 */
export function submitReducer<T>(state: SubmitState<T>, action: SubmitAction<T>): SubmitState<T> {
  switch (action.type) {
    case 'submit':
      return state.phase === 'idle' || state.phase === 'error' ? { phase: 'submitting', error: null, result: null } : state
    case 'resolve':
      return state.phase === 'submitting' ? { phase: 'success', error: null, result: action.result } : state
    case 'reject':
      return state.phase === 'submitting' ? { phase: 'error', error: action.error, result: null } : state
    case 'reset':
      return initialSubmitState<T>()
    default:
      return state
  }
}

// ---------------------------------------------------------------- hata metni

/** axios hatasından yalnızca kaba sınıf çıkarılır; ham mesaj/HTTP kodu ASLA kullanıcıya gösterilmez. */
export type FailureKind = 'network' | 'server' | 'session' | 'unknown'

export function classifyFailure(err: unknown): FailureKind {
  const e = err as { isAxiosError?: boolean; response?: { status?: number }; code?: string } | null
  if (!e || typeof e !== 'object') return 'unknown'
  const status = e.response?.status
  if (typeof status === 'number') {
    if (status === 401 || status === 403) return 'session'
    if (status >= 500) return 'server'
    return 'unknown'
  }
  if (e.isAxiosError || e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED') return 'network'
  return 'unknown'
}

export function describeSubmitError(kind: 'create' | 'reply', failure: FailureKind): SubmitError {
  const what = kind === 'create' ? 'Talebiniz oluşturulamadı' : 'Yanıtınız gönderilemedi'
  const kept = kind === 'create' ? 'Yazdıklarınız korundu.' : 'Mesajınız korundu.'
  switch (failure) {
    case 'network':
      return { title: `${what} — bağlantı kurulamadı.`, hint: `İnternet bağlantınızı kontrol edip tekrar deneyin. ${kept}` }
    case 'session':
      return { title: `${what} — oturumunuz doğrulanamadı.`, hint: `Sayfayı yenileyip tekrar giriş yapın. ${kept}` }
    case 'server':
      return { title: `${what} — sunucu şu an yanıt veremiyor.`, hint: `Birkaç dakika sonra tekrar deneyin; sorun sürerse destek ekibine başka bir kanaldan ulaşın. ${kept}` }
    default:
      return { title: `${what}.`, hint: `Tekrar deneyin. ${kept}` }
  }
}

// ---------------------------------------------------------------- klavye

/** Ctrl+Enter / Cmd+Enter gönderir (Enter tek başına satır ekler). */
export function isSubmitShortcut(e: { key: string; ctrlKey?: boolean; metaKey?: boolean }): boolean {
  return e.key === 'Enter' && !!(e.ctrlKey || e.metaKey)
}

/** Radiogroup ok tuşu gezinmesi: bir sonraki/önceki indeks (döngüsel); ilgisiz tuşta `null`. */
export function nextRadioIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (current + 1) % count
    case 'ArrowLeft':
    case 'ArrowUp':
      return (current - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

// ---------------------------------------------------------------- zaman çizgisi

export interface TicketMessageLike {
  senderType?: string
  senderName?: string
  content?: string
  date?: string | number | Date
}

export interface TicketLike {
  ticketNumber?: string
  status?: string
  createdDate?: string | number | Date
  updatedDate?: string | number | Date
  messages?: TicketMessageLike[]
}

export type TimelineItem =
  | { kind: 'event'; key: string; icon: string; text: string; date: string | number | Date | null }
  | { kind: 'message'; key: string; mine: boolean; sender: string; content: string; date: string | number | Date | null }

/**
 * Zaman çizgisi YALNIZ kesin bilinen olaylardan kurulur:
 *  - açılış: `createdDate` (openTicket yazar);
 *  - mesajlar: sunucu sırasıyla;
 *  - kapanış: durum `CLOSED` ise, `closeTicket`'ın yazdığı `updatedDate` (talep kapalıyken bu alan başka bir
 *    şeyle güncellenemez — mesaj gönderimi kapalı taleplerde arayüzde engelli). Alan yoksa zamansız gösterilir.
 * Ara durum geçişleri (ör. İşleniyor → Yanıt Bekliyor) backend'de TARİHÇESİ tutulmadığı için türetilmez.
 */
export function buildTimeline(ticket: TicketLike | null | undefined): TimelineItem[] {
  if (!ticket) return []
  const items: TimelineItem[] = []
  items.push({
    kind: 'event',
    key: 'opened',
    icon: 'mdi-flag-outline',
    text: ticket.ticketNumber ? `${ticket.ticketNumber} numaralı talep açıldı` : 'Talep açıldı',
    date: ticket.createdDate ?? null,
  })
  ;(ticket.messages ?? []).forEach((m, i) => {
    const mine = m.senderType !== 'SUPPORT'
    items.push({
      kind: 'message',
      key: `m-${i}`,
      mine,
      sender: m.senderName || (mine ? 'Müşteri' : 'Destek Ekibi'),
      content: m.content ?? '',
      date: m.date ?? null,
    })
  })
  if (ticket.status === TicketStatusEnum.CLOSED) {
    items.push({ kind: 'event', key: 'closed', icon: 'mdi-lock-outline', text: 'Talep kapatıldı', date: ticket.updatedDate ?? null })
  }
  return items
}

/** Gün ayracı için yerel takvim günü anahtarı (`YYYY-MM-DD`); geçersiz tarihte `null`. */
export function dayKey(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export type TimelineEntry = TimelineItem | { kind: 'day'; key: string; date: string | number | Date }

/** Gün değiştiğinde araya tarih ayracı ekler (tarihi olmayan öğe ayraç üretmez, önceki günde kalır). */
export function withDaySeparators(items: TimelineItem[]): TimelineEntry[] {
  const out: TimelineEntry[] = []
  let current: string | null = null
  for (const item of items) {
    const key = dayKey(item.date)
    if (key && key !== current) {
      current = key
      out.push({ kind: 'day', key: `day-${key}`, date: item.date as string | number | Date })
    }
    out.push(item)
  }
  return out
}
