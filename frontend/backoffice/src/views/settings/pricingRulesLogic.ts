/**
 * PRC-R2 backoffice — Fiyat kuralları paneli SAF mantığı (DOM yok): dikkat gerektirenler (K51 "müdahale gerekiyor mu?").
 * Girdi yalnız TOPLAM sayaçlardır (tenant verisi yok).
 */
import type { PricingRulesOverview } from '@bo/api/contract'

export interface PricingAttention { id: string; tone: 'warning' | 'info'; title: string; text: string }

export function pricingRulesAttention(o: PricingRulesOverview | null | undefined, switchOn: boolean): PricingAttention[] {
  if (!o) return []
  const out: PricingAttention[] = []
  const paused = o.rules.pausedExternal + o.rules.pausedOscillation
  if (!switchOn && (o.tenantsEnabled > 0 || o.rules.enabled > 0)) {
    out.push({ id: 'switch-off', tone: 'info', title: 'Platform anahtarı kapalı', text: `${o.tenantsEnabled} müşteri özelliği açmış ve ${o.rules.enabled} kural açık; anahtar kapalıyken öneri üretilmez ve onay uygulanmaz.` })
  }
  if (o.rules.pausedExternal > 0) {
    out.push({ id: 'paused-external', tone: 'warning', title: 'Dış değişiklikle duraklayan kural', text: `${o.rules.pausedExternal} kural, fiyat Entegrasyonik dışında değiştiği için durdu (pazaryerinin kendi aracı açık olabilir). Müşteriler kuralı gözden geçirip yeniden kaydeder.` })
  }
  if (o.rules.pausedOscillation > 0) {
    out.push({ id: 'paused-oscillation', tone: 'warning', title: 'Salınım nedeniyle duraklayan kural', text: `${o.rules.pausedOscillation} kuralda fiyat kısa sürede ileri geri gitti; fiyat savaşı olabilir.` })
  }
  if (o.failedTenants > 0 || o.truncated) {
    out.push({ id: 'partial', tone: 'info', title: 'Sayılar eksik olabilir', text: o.truncated ? 'Tarama sınırına ulaşıldı; tüm müşteriler sayılmadı.' : `${o.failedTenants} müşterinin verisi okunamadı.` })
  }
  if (paused === 0 && out.length === 0) return []
  return out
}
