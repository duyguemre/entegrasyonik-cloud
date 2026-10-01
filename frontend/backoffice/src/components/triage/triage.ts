/**
 * "Durum → Karar → Eylem → Ayrıntı" deseninin ortak türleri ve eşlemeleri (BO_UI_PATTERNS §11, K51).
 * Bileşenler: BoStatusHeader (Durum) · BoAttentionList (Karar) · BoActionCard (Eylem) · BoDetailSection (Ayrıntı) ·
 * BoTriageSection (soru-cevap bölümü). Sayfa kendi verisini bu şekle çevirir; bileşen veri çekmez.
 */
import type { RouteLocationRaw } from 'vue-router'
import type { StatusTone } from '@entegrasyonik/ui/components'

export type Severity = 'critical' | 'warning' | 'info'
/** Sayfa/bölüm sağlığı: ok = doğrulanmış iyi · warning = izlenmeli · critical = şimdi müdahale · unknown = okunamadı. */
export type Health = 'ok' | 'warning' | 'critical' | 'unknown'

export const SEVERITY: Record<Severity, { label: string; icon: string; tone: StatusTone }> = {
  critical: { label: 'Kritik', icon: 'mdi-alert-octagon', tone: 'danger' },
  warning: { label: 'Uyarı', icon: 'mdi-alert', tone: 'warning' },
  info: { label: 'Bilgi', icon: 'mdi-information-outline', tone: 'info' },
}

export const HEALTH_BADGE: Record<Health, { label: string; icon: string; tone: StatusTone }> = {
  ok: { label: 'Sağlıklı', icon: 'mdi-check-circle', tone: 'success' },
  warning: { label: 'İzlenmeli', icon: 'mdi-alert', tone: 'warning' },
  critical: { label: 'Müdahale gerekli', icon: 'mdi-alert-octagon', tone: 'danger' },
  unknown: { label: 'Bilinmiyor', icon: 'mdi-help-circle-outline', tone: 'neutral' },
}

/**
 * Dikkat listesinin bir maddesi: ne oldu (title + why) · ne kadar ciddi (severity + count + impact + since) ·
 * ne yapmalı (advice) · eylem (action: ilgili ekran + süzgeç). Metin kaynağı sayfanındır (pano: sunucu metni).
 */
export interface AttentionEntry {
  id: string
  severity: Severity
  title: string
  why?: string
  impact?: string | null
  /** "1.240 iş" gibi sayı + birim. */
  count?: string | null
  advice?: string
  action?: { label: string; to: RouteLocationRaw }
  secondary?: { label: string; to: RouteLocationRaw }
  /** Yerinde güvenli eylem önerileri — ilgili ekranda step-up + gerekçeyle yapılır (yalnız ipucu olarak gösterilir). */
  capabilities?: Array<{ label: string; capabilityId: string }>
  /** Durumun başladığı an (ISO) → "52 dk önce başladı". */
  since?: string
  /** Etkilenen müşteriler (≤ 5 örnek): nötr kimlik etiketi, müşteri detayına bağlı. */
  subjects?: Array<{ tid: number; name: string | null }>
}

/** Bir madde listesinden sağlık hükmü: kritik varsa critical, uyarı varsa warning, yoksa ok (info sağlığı bozmaz). */
export function healthOf(items: Array<{ severity: Severity }>, unknown = false): Health {
  if (items.some((i) => i.severity === 'critical')) return 'critical'
  if (items.some((i) => i.severity === 'warning')) return 'warning'
  return unknown ? 'unknown' : 'ok'
}

/** "2 kritik · 3 uyarı" — sayısı 0 olan atlanır; hepsi 0 ise boş. */
export function countText(items: Array<{ severity: Severity }>): string {
  const c = { critical: 0, warning: 0, info: 0 }
  for (const i of items) c[i.severity]++
  return [c.critical && `${c.critical} kritik`, c.warning && `${c.warning} uyarı`, c.info && `${c.info} bilgi`].filter(Boolean).join(' · ')
}
