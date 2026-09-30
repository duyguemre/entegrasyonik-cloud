/**
 * frontend/src/components/message/messageSla.ts
 *
 * C2.5 — müşteri sorusu/mesajı: yanıt bekleme süresi + kanal karakter kuralı (saf TS, Vue import'u yok).
 *
 * HİPOTEZ ÖZELLİĞİ: bekleme eşikleri bir pazaryeri SLA'sı DEĞİLDİR. Hiçbir kanalın resmi yanıt süresi
 * bu dosyada iddia edilmez; eşikler ürün önerisidir ve `MESSAGE_WAIT_THRESHOLDS`'tan ayarlanır.
 * Ton anlamı DESIGN_SYSTEM §2.3 ile aynıdır: `warning` = dikkat/bekliyor, `danger` (error rolü) = kritik.
 * Ekran renk seçmez; bu modül yalnız `StatusTone` verir, `EkStatusChip` boyar.
 *
 * Karakter kuralı yalnız BELGELİ kanal için zorlanır: Trendyol soru cevabı 10–2000 karakter
 * (docs/research/2026-09-28-trendyol-v2-migration-spec.md §1, `qnaAnswerUrl`). Kuralı bilinmeyen
 * kanalda sayaç yalnız bilgi amaçlıdır — uydurma sınır yok.
 */
import type { StatusTone } from '@/design/status-map'
import { MessageStatusEnum } from '@/types/MessageTypes'

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

/** Bekleme tonu eşikleri (saat). ÖNERİ — ayarlanabilir; pazaryeri taahhüdü değildir. */
export const MESSAGE_WAIT_THRESHOLDS = Object.freeze({
  /** Bu süreye ulaşan bekleyiş `warning`. */
  warningHours: 24,
  /** Bu süreyi AŞAN bekleyiş `danger`. */
  dangerHours: 48,
})

export type WaitThresholds = { warningHours: number; dangerHours: number }

export interface AnswerLengthRule {
  /** Kural metninde görünen kanal adı. */
  channel: string
  min: number
  max: number
}

/** Belgeli kanal kuralları. Anahtar = `integrationCode`. */
export const ANSWER_LENGTH_RULES: Readonly<Record<string, AnswerLengthRule>> = Object.freeze({
  trendyol: { channel: 'Trendyol', min: 10, max: 2000 },
})

/** Henüz müşteriye ulaşmış bir yanıtı olmayan mesaj (reddedilen yanıt da ulaşmamış sayılır). */
export function isAwaitingReply(message: { status?: string; isRejected?: boolean } | null | undefined): boolean {
  if (!message) return false
  if (message.isRejected) return true
  return message.status === MessageStatusEnum.WAITING_SELLER
    || message.status === MessageStatusEnum.UNREAD
    || message.status === MessageStatusEnum.READ
    || message.status === MessageStatusEnum.REJECTED
}

/** Mesaj tarihinden (`date`) bu yana geçen süre; bekleyen değilse veya tarih okunamazsa `null`. */
export function waitingMs(message: { status?: string; isRejected?: boolean; date?: unknown } | null | undefined, now: Date = new Date()): number | null {
  if (!isAwaitingReply(message)) return null
  const raw = message?.date
  if (raw === null || raw === undefined || raw === '') return null
  const at = new Date(raw as string | number | Date).getTime()
  if (!Number.isFinite(at)) return null
  return Math.max(0, now.getTime() - at)
}

export function waitTone(ms: number, thresholds: WaitThresholds = MESSAGE_WAIT_THRESHOLDS): StatusTone {
  if (ms > thresholds.dangerHours * HOUR_MS) return 'danger'
  if (ms >= thresholds.warningHours * HOUR_MS) return 'warning'
  return 'neutral'
}

/** Kısa süre parçaları: `{ days, hours, minutes }` — biçimleme i18n'de. */
export function waitParts(ms: number): { days: number; hours: number; minutes: number } {
  const totalMinutes = Math.floor(Math.max(0, ms) / MINUTE_MS)
  const totalHours = Math.floor(totalMinutes / 60)
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24, minutes: totalMinutes % 60 }
}

export function answerRuleFor(integrationCode: string | null | undefined): AnswerLengthRule | null {
  if (!integrationCode) return null
  return ANSWER_LENGTH_RULES[String(integrationCode).toLowerCase()] ?? null
}

export type AnswerLengthState = 'empty' | 'tooShort' | 'tooLong' | 'ok'

/** Gönderilecek metin `trim` edilmiş haliyle ölçülür (baştaki/sondaki boşluk pazaryerine gitmez sayılmaz). */
export function answerLengthState(text: string | null | undefined, rule: AnswerLengthRule | null): { count: number; state: AnswerLengthState } {
  const count = String(text ?? '').trim().length
  if (count === 0) return { count, state: 'empty' }
  if (rule && count < rule.min) return { count, state: 'tooShort' }
  if (rule && count > rule.max) return { count, state: 'tooLong' }
  return { count, state: 'ok' }
}

/**
 * İstemci tarafı, YALNIZ bu sayfa: bekleyenler en uzun bekleyenden başlayarak öne, diğerleri mevcut
 * (sunucu) sırasını korur. Backend'de bu sıralama yok — ekranda "bu sayfada" diye etiketlenir.
 */
export function sortAwaitingFirst<T extends { status?: string; isRejected?: boolean; date?: unknown }>(rows: T[], now: Date = new Date()): T[] {
  return rows
    .map((row, index) => ({ row, index, wait: waitingMs(row, now) }))
    .sort((a, b) => {
      if (a.wait !== null && b.wait !== null) return b.wait - a.wait || a.index - b.index
      if (a.wait !== null) return -1
      if (b.wait !== null) return 1
      return a.index - b.index
    })
    .map(entry => entry.row)
}
