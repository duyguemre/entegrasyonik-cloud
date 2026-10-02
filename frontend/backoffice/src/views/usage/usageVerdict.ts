/**
 * MOB-08 / K55 — kullanım bölümlerinin K51 hiyerarşisi: Durum (tek cümle) → Karar (müdahale gerekir mi?) → Eylem (nereye/ne)
 * → Ayrıntı (ekranda). SAF: yalnız sunucu yanıtından türetir; eşikler burada sabit (ekranda satır içi kural yazılmaz).
 */
import type { RouteLocationRaw } from 'vue-router'
import type { ByClass, PulseActiveUsers, TenantUsage } from '@bo/api/contract'
import { formatCount, formatPercent } from '@bo/utils/units'
import { BADGE, rankAttention, type PageVerdict } from '@bo/utils/verdict'

export type VerdictTone = 'success' | 'info' | 'warning' | 'error' | 'neutral'
/** `to`/`cta`: kararın bağlantısı (ortak PageVerdict bağlantısız madde çizmez — CONSOLE_IDENTITY ilke 1). */
export interface UsageDecision { key: string; tone: VerdictTone; title: string; why: string; to?: RouteLocationRaw; cta?: string }
export interface UsageAction { key: string; label: string; icon: string; to: RouteLocationRaw }
export interface UsageVerdict { tone: VerdictTone; title: string; sentence: string; decisions: UsageDecision[]; actions: UsageAction[] }

/** Platformu belirlenemeyen kullanıcı payı bu eşiği aşarsa uyarı (eski istemci / başlıksız çağrı). */
export const UNKNOWN_SHARE_WARN = 0.2
/** Mobil pay bu eşiği aşarsa bilgi: mobil deneyim öncelikli. */
export const MOBILE_MAJORITY = 0.5
/** Müşteri bu kadar gündür aktif değilse uyarı. */
export const INACTIVE_DAYS_WARN = 7
/** Ayrıntı bölümünün konumu (göstergeler + kırılım); konumsuz kararların bağlantısı. */
export const USAGE_DETAIL_HASH = '#kullanim-ayrinti'

const RANK: Record<VerdictTone, number> = { error: 4, warning: 3, info: 1, neutral: 0, success: 0 }

function worst(decisions: UsageDecision[]): VerdictTone {
  const top = decisions.reduce<VerdictTone>((t, d) => (RANK[d.tone] > RANK[t] ? d.tone : t), 'success')
  return top === 'info' ? 'success' : top
}

function unknownShare(byClass: ByClass): number {
  const total = byClass.desktop + byClass.mobile + byClass.unknown
  return total > 0 ? byClass.unknown / total : 0
}

const pct = (v: number | null) => (v === null ? '—' : formatPercent(v))

function commonDecisions(byClass: ByClass, mobileShare: number | null, truncated: boolean, scope: string): UsageDecision[] {
  const out: UsageDecision[] = []
  const unk = unknownShare(byClass)
  if (unk >= UNKNOWN_SHARE_WARN) {
    out.push({
      key: 'unknown', tone: 'warning', title: `Platformu belirlenemeyen kullanım yüksek (${formatPercent(unk)})`,
      why: `${scope} istemcilerin bir kısmı platform bilgisi göndermiyor; eski sürüm ya da dış entegrasyon olabilir. Yeni sürümün yayında olduğunu doğrulayın.`,
      to: { query: { platform: 'unknown' } }, cta: 'Belirlenemeyenleri göster',
    })
  }
  if (mobileShare !== null && mobileShare >= MOBILE_MAJORITY) {
    out.push({
      key: 'mobile-majority', tone: 'info', title: `Kullanıcıların çoğu mobilden geliyor (${formatPercent(mobileShare)})`,
      why: 'Mobil ekranlardaki sorunlar daha çok kullanıcıyı etkiler; mobil hata ve geri bildirimleri önce ele alın.',
      to: { query: { platform: 'mobile' } }, cta: 'Mobil kullanımı göster',
    })
  }
  if (truncated) out.push({ key: 'truncated', tone: 'warning', title: 'Sayılar alt sınırdır', why: 'Okunan kayıt üst sınırı aşıldı; daha dar bir süzgeçle bakın.', to: { hash: USAGE_DETAIL_HASH }, cta: 'Ayrıntıya bak' })
  return out
}

/** Platform geneli (getPulse.activeUsers). */
export function pulseUsageVerdict(a: PulseActiveUsers): UsageVerdict {
  const toLogins: UsageAction = { key: 'logins', label: 'Giriş kayıtları', icon: 'mdi-login-variant', to: { path: '/denetim', query: { event: 'login' } } }
  const toTenants: UsageAction = { key: 'tenants', label: 'Müşteri listesi', icon: 'mdi-storefront-outline', to: '/musteriler' }
  if (a.status === 'degraded') {
    return {
      tone: 'warning', title: 'Kullanım verisi okunamadı', sentence: 'Aktif kullanıcı sayıları şu an okunamıyor; diğer göstergeler etkilenmez.',
      decisions: [{ key: 'degraded', tone: 'warning', title: 'Okunamayan bölüm "kullanım yok" anlamına gelmez', why: 'Yeniden deneyin; sürerse veritabanı durumunu Altyapı ekranında kontrol edin.', to: '/altyapi', cta: 'Altyapı durumu' }],
      actions: [{ key: 'infra', label: 'Altyapı durumu', icon: 'mdi-server-outline', to: '/altyapi' }],
    }
  }
  if (!a.computable) {
    return {
      tone: 'neutral', title: 'Kullanım verisi henüz yok', sentence: 'Platform ayrımlı kullanım kaydı birikiyor; ilk müşteri isteğinden itibaren günlük toplanır.',
      decisions: [{ key: 'none', tone: 'success', title: 'Müdahale gerekmez', why: 'Veri biriktikçe masaüstü / mobil kırılımı burada görünür.' }],
      actions: [toTenants],
    }
  }
  const decisions = commonDecisions(a.byClass, a.mobileShare, a.truncated, 'Bazı')
  if (!decisions.some((d) => d.tone === 'warning' || d.tone === 'error')) decisions.unshift({ key: 'ok', tone: 'success', title: 'Müdahale gerekmez', why: 'Kullanım dağılımında olağan dışı bir durum yok.' })
  const actions: UsageAction[] = []
  if (a.platform !== 'mobile') actions.push({ key: 'mobile', label: 'Yalnız mobil kullanımı göster', icon: 'mdi-cellphone', to: { query: { platform: 'mobile' } } })
  if (decisions.some((d) => d.key === 'unknown')) actions.push({ key: 'unknown', label: 'Belirlenemeyenleri göster', icon: 'mdi-help-circle-outline', to: { query: { platform: 'unknown' } } })
  actions.push(toTenants, toLogins)
  return {
    tone: worst(decisions),
    title: `Son 7 günde ${formatCount(a.last7d.users)} aktif kullanıcı`,
    sentence: `${formatCount(a.last7d.tenants)} müşteriden; bugün ${formatCount(a.today.users)} kullanıcı. Mobil payı ${pct(a.mobileShare)}.`,
    decisions, actions: actions.slice(0, 3),
  }
}

/** Müşteri detayı (getUsage). `today` yalnız test için enjekte edilir ('YYYY-MM-DD'). */
export function tenantUsageVerdict(u: TenantUsage, today: string = u.to): UsageVerdict {
  const tid = String(u.tid)
  const toAudit: UsageAction = { key: 'logins', label: 'Giriş kayıtları', icon: 'mdi-login-variant', to: { path: '/denetim', query: { tid, event: 'login' } } }
  const toLife: UsageAction = { key: 'life', label: 'Yaşam döngüsüne bak', icon: 'mdi-timeline-clock-outline', to: { query: { sekme: 'yasam-dongusu' } } }
  const a = u.activeUsers
  if (!a.computable) {
    const logins = u.logins.total
    return {
      tone: logins > 0 ? 'neutral' : 'warning',
      title: logins > 0 ? 'Aktif kullanım kaydı yok' : `Son ${u.days} günde kullanım yok`,
      sentence: logins > 0
        ? `Bu dönemde ${formatCount(logins)} giriş var ama günlük kullanım kaydı yok (kayıt yeni başladı ya da süzgeç dar).`
        : `Bu dönemde giriş ya da aktif kullanım kaydı bulunmuyor.`,
      decisions: logins > 0
        ? [{ key: 'none', tone: 'success', title: 'Müdahale gerekmez', why: 'Kullanım kaydı biriktikçe masaüstü / mobil kırılımı burada görünür.' }]
        : [{ key: 'inactive', tone: 'warning', title: 'Müşteri uygulamayı kullanmıyor olabilir', why: 'Abonelik ve kurulum durumunu kontrol edin; gerekirse müşteriyle iletişime geçin.' }],
      actions: [toLife, toAudit],
    }
  }
  const decisions = commonDecisions(a.byClass, a.mobileShare, a.truncated, 'Bu müşterideki')
  if (a.lastActiveDay) {
    const idle = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${a.lastActiveDay}T00:00:00Z`)) / 86_400_000)
    if (idle >= INACTIVE_DAYS_WARN) {
      decisions.unshift({ key: 'inactive', tone: 'warning', title: `${idle} gündür aktif kullanıcı yok`, why: 'Entegrasyon ya da abonelik sorunu kullanımı durdurmuş olabilir; yaşam döngüsünü ve son olayları kontrol edin.' })
    }
  }
  if (!decisions.some((d) => d.tone === 'warning' || d.tone === 'error')) decisions.unshift({ key: 'ok', tone: 'success', title: 'Müdahale gerekmez', why: 'Müşteri düzenli kullanıyor; dağılımda olağan dışı bir durum yok.' })
  return {
    tone: worst(decisions),
    title: `Son ${u.days} günde ${formatCount(a.users)} aktif kullanıcı`,
    sentence: `${formatCount(u.logins.total)} başarılı giriş; mobil payı ${pct(a.mobileShare)}.`,
    decisions,
    actions: decisions.some((d) => d.key === 'inactive') ? [toLife, toAudit] : [toAudit],
  }
}

/** Denetlenen ölçütler (sakin durumda "Denetlenen: …"). */
const USAGE_CHECKS = ['Belirlenemeyen platform payı', 'Mobil payı', 'Okuma üst sınırı']

/**
 * INT-1001 §8 uyarlaması — kullanım hükmünü ortak `PageVerdict` modeline (bo-r1b; BO_UI_PATTERNS §11) çevirir.
 * İçerik aynı: başlık = hüküm, cümle = not, uyarı/bilgi kararları = dikkat maddeleri (neden → etki, bağlantı + eylem metni),
 * "Müdahale gerekmez" kararı = sakin başlık + nedeni, eylemler aynı sırada (ilki "Önerilen ilk adım").
 */
export function toPageVerdict(v: UsageVerdict): PageVerdict {
  const ok = v.decisions.find((d) => d.tone === 'success' || d.tone === 'neutral')
  const attention = rankAttention(
    v.decisions
      .filter((d): d is UsageDecision & { tone: 'error' | 'warning' | 'info' } => d.tone === 'error' || d.tone === 'warning' || d.tone === 'info')
      .map((d) => ({ id: d.key, tone: d.tone, title: d.title, impact: d.why, to: d.to ?? { hash: USAGE_DETAIL_HASH }, cta: d.cta ?? 'Ayrıntıya bak' })),
  )
  return {
    tone: v.tone,
    badge: v.tone === 'neutral' ? 'Veri yok' : BADGE[v.tone],
    summary: v.title,
    note: v.sentence,
    attention,
    actions: v.actions.map((a) => ({ id: a.key, label: a.label, icon: a.icon, to: a.to })),
    okTitle: ok ? `${ok.title} — ${ok.why}` : undefined,
    checks: ok ? USAGE_CHECKS : undefined,
  }
}
