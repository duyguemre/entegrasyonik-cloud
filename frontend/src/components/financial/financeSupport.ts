/**
 * frontend/src/components/financial/financeSupport.ts
 *
 * Finans sekmelerinin ortak yardımcıları.
 *
 * KANAL DESTEĞİ — "0" ile "desteklenmiyor" ayrımı için. Kaynak: backend pazaryeri modülleri (salt okunur):
 *  - kargo faturası: hepsiburada `retrieveCargoInvoices` ve n11 `fetchCargoInvoices` DAİMA boş dizi döner;
 *  - ödeme emri dökümü: hepsiburada, n11, pazarama `retrieveSettlementsByPaymentId` DAİMA boş dizi döner
 *    (bkz. `modules/marketplace/<kanal>/descriptor.ts` finance.note).
 * Bu kanallar için boş yanıt "0,00 ₺" / "kayıt yok" DEĞİL, "bu görünüm desteklenmiyor" olarak gösterilir.
 * Backend bir gün veri döndürürse satırlar yine gösterilir — liste yalnız BOŞ yanıtın anlamını belirler.
 */
import type { StatusTone } from '@/design/status-map'

export type FinanceView = 'cargoInvoices' | 'payouts'

const UNSUPPORTED: Record<FinanceView, readonly string[]> = {
  cargoInvoices: ['hepsiburada', 'n11'],
  payouts: ['hepsiburada', 'n11', 'pazarama'],
}

const CHANNEL_NAMES: Record<string, string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
  n11: 'N11',
  pazarama: 'Pazarama',
  ideasoft: 'Ideasoft',
  bizimhesap: 'Bizimhesap',
}

export function channelName(code: string | null | undefined): string {
  const key = String(code ?? '').toLowerCase()
  if (CHANNEL_NAMES[key]) return CHANNEL_NAMES[key]
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '—'
}

/** Kanal bu görünümü sağlamıyor mu? (kod büyük/küçük harf duyarsız) */
export function isUnsupported(view: FinanceView, code: string | null | undefined): boolean {
  return UNSUPPORTED[view].includes(String(code ?? '').toLowerCase())
}

/** Görünümü sağlamayan kanalların adları ("Hepsiburada, N11"). */
export function unsupportedNames(view: FinanceView): string {
  return UNSUPPORTED[view].map(channelName).join(', ')
}

/** Kargo gönderim tipi (CargoShipmentType). */
export const SHIPMENT_TYPES: Record<string, { label: string; tone: StatusTone }> = {
  FORWARD: { label: 'Gidiş', tone: 'info' },
  RETURN: { label: 'İade', tone: 'warning' },
}

/** İşlem türü (UniversalTransactionType) — ödeme dökümü kalemleri için. */
export const TRANSACTION_TYPES: Record<string, { label: string; tone: StatusTone }> = {
  SALE: { label: 'Satış', tone: 'success' },
  RETURN: { label: 'İade', tone: 'warning' },
  CANCEL: { label: 'İptal', tone: 'neutral' },
  PAYOUT: { label: 'Ödeme', tone: 'info' },
  DEDUCTION: { label: 'Kesinti', tone: 'danger' },
  CORRECTION: { label: 'Düzeltme', tone: 'neutral' },
  PROVISION: { label: 'Provizyon', tone: 'neutral' },
  COUPON: { label: 'Kupon', tone: 'neutral' },
  DISCOUNT: { label: 'İndirim', tone: 'neutral' },
}

export function transactionType(code: string | null | undefined): { label: string; tone: StatusTone } {
  const key = String(code ?? '')
  return TRANSACTION_TYPES[key] ?? { label: key || '—', tone: 'neutral' }
}

/** Hata durumunda kullanıcıya önerilecek eylem — ham hata/HTTP kodu ASLA gösterilmez. */
export function errorHint(status: number | null): string {
  if (status === 403) return 'Bu görünüm için yetkiniz yok; hesap yöneticinizden erişim isteyin.'
  if (status === 400) return 'İstek geçersiz; girdiğiniz değeri kontrol edin.'
  return 'Bağlantınızı kontrol edip yeniden deneyin.'
}

/** "<ne oldu> — <ne yapılmalı>" biçiminde tek satır hata metni (EkErrorState). */
export function errorMessage(status: number | null, subject: string): string {
  const what = status === 403 ? `${subject} görüntülenemiyor` : status === 400 ? `${subject} getirilemedi` : `${subject} yüklenemedi`
  return `${what} — ${errorHint(status)}`
}
