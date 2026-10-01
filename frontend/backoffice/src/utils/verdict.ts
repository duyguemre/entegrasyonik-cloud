/**
 * Sayfa hükmü — "Durum → Karar → Eylem → Ayrıntı" (K51, BO_FEEDBACK_R1 madde 6). Saf TS (DOM yok; tests/verdict.test.ts).
 *
 *  Durum   : tek cümle özet + sağlık rozeti (`tone`, `badge`)
 *  Karar   : dikkat gerektiren öğeler — önce kırmızı (şimdi müdahale), sonra sarı (izlenmeli), sonra bilgi
 *  Eylem   : önerilen eylemler — ekrana/süzgece bağlantı ya da güvenli eylem (step-up + gerekçe; `guarded`)
 *  Ayrıntı : sayfanın mevcut tabloları/panelleri, hükmün ALTINDA
 *
 * Sayfalar hükmü kendi verisinden `buildVerdict` ile üretir; çizim `components/verdict/PageVerdict.vue` — bo-r1a'nın
 * triyaj bileşenlerine (BoStatusHeader · BoAttentionList · BoActionCard; BO_UI_PATTERNS §11) uyarlayıcı.
 * Renk yalnız durum taşır (CONSOLE_IDENTITY ilke 2); okunamayan kaynak "okunamadı" der (ilke 7), "sağlıklı" demez.
 */
import type { RouteLocationRaw } from 'vue-router'

export type VerdictTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'
export type AttentionTone = 'error' | 'warning' | 'info'

export interface AttentionItem {
  /** Kararlı anahtar (v-for, e2e). */
  id: string
  tone: AttentionTone
  /** Ne oldu — kısa, sayıyla ("3 iş elle inceleme bekliyor"). */
  title: string
  /** Ne kadar ciddi — kim/ne etkileniyor, eşik (§11.2 `impact`). */
  impact?: string
  /** Ne yapmalı — tek cümle, siz dili (§11.2 `advice`). */
  advice?: string
  /** Eski alan: `impact` yoksa onun yerine geçer. */
  detail?: string
  /**
   * Hedef ekran/süzgeç (bağlantısız uyarı yazılmaz — CONSOLE_IDENTITY ilke 1). Aynı sayfadaki sekme için göreli konum:
   * `{ query: { sekme: 'basarisiz' } }`. Yalnız `unreadable()` maddelerinde yoktur.
   */
  to?: RouteLocationRaw
  /** Eylem bağlantısı metni; varsayılan "Göster". */
  cta?: string
  /** Durumun başladığı an (ISO). */
  since?: string
  /** Müşteri kapsamlı madde: nötr kimlik. */
  tenant?: { tid: number; name: string | null }
  /** Okunamayan kaynak adı (`unreadable()`); adaptör "X okunamadı — Yeniden dene" notuna çevirir. */
  source?: string
  /** Yalnız okunamayan kaynakta: tekrar dene. */
  onSelect?: () => void
}

export interface SuggestedAction {
  id: string
  /** Kart başlığı / bağlantı metni ("Ölü mektupları inceleyin"). */
  label: string
  /** Kart düğmesi metni (ilk eylem kart olur); varsayılan "Aç" / "Başlat…". */
  cta?: string
  /** Neden/etki — tek cümle. */
  detail?: string
  icon?: string
  to?: RouteLocationRaw
  onSelect?: () => void
  /** Adım-yükseltmesi + gerekçe ister (GuardedDialog/DangerActionDialog açar). */
  guarded?: boolean
  /** Yıkıcı (silme/iptal/atma) — ayrık ve sakin çizilir. */
  danger?: boolean
}

export interface PageVerdict {
  tone: VerdictTone
  /** Rozet metni ("Sağlıklı", "İzlenmeli", "Müdahale gerekli"…). */
  badge: string
  /** Tek cümle durum özeti (hüküm). */
  summary: string
  /** İkinci cümle: neye bakıldı, ne kadar güncel. */
  note?: string
  attention: AttentionItem[]
  actions: SuggestedAction[]
  /** Dikkat listesi boşken "Denetlenen: …". */
  checks?: string[]
  okTitle?: string
}

export const BADGE: Record<VerdictTone, string> = {
  success: 'Sağlıklı',
  warning: 'İzlenmeli',
  error: 'Müdahale gerekli',
  info: 'Bilgi',
  neutral: 'Bilinmiyor',
}

const RANK: Record<AttentionTone, number> = { error: 0, warning: 1, info: 2 }

/** Kırmızı → sarı → bilgi; aynı tonda verilen sıra korunur (kararlı). */
export function rankAttention(items: AttentionItem[]): AttentionItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => RANK[a.item.tone] - RANK[b.item.tone] || a.i - b.i)
    .map((x) => x.item)
}

/** Dikkat listesinden sayfa tonu: kırmızı varsa error, sarı varsa warning; yoksa `calm` (varsayılan success). */
export function toneOf(items: AttentionItem[], calm: VerdictTone = 'success'): VerdictTone {
  if (items.some((i) => i.tone === 'error')) return 'error'
  if (items.some((i) => i.tone === 'warning')) return 'warning'
  return calm
}

/** "1 konu" / "3 konu" — Türkçe sayı biçimi. */
export function countPhrase(n: number, noun: string): string {
  return `${n.toLocaleString('tr-TR')} ${noun}`
}

export interface VerdictInput {
  attention: Array<AttentionItem | null | undefined | false>
  actions?: Array<SuggestedAction | null | undefined | false>
  /** Dikkat listesi boşken (ya da yalnız bilgi varken) özet ve ton. */
  calm: { summary: string; tone?: VerdictTone; badge?: string }
  /** Dikkat varken özet; verilmezse "N konu dikkat istiyor". İlk (en önemli) öğe ve sayaçlarla çağrılır. */
  busy?: (ctx: { top: AttentionItem; errors: number; warnings: number; total: number }) => string
  note?: string
  checks?: string[]
  okTitle?: string
}

/**
 * Tek giriş noktası: boş/yanlış öğeleri atar, sıralar, tonu ve özet cümlesini üretir.
 * Bilgi (`info`) öğeleri tonu bozmaz — sakin sayfa "Sağlıklı" kalır ama maddeyi gösterir.
 */
export function buildVerdict(input: VerdictInput): PageVerdict {
  const attention = rankAttention(input.attention.filter((x): x is AttentionItem => !!x))
  const actions = (input.actions ?? []).filter((x): x is SuggestedAction => !!x)
  const errors = attention.filter((i) => i.tone === 'error').length
  const warnings = attention.filter((i) => i.tone === 'warning').length
  const urgent = errors + warnings
  const extra = { note: input.note, checks: input.checks, okTitle: input.okTitle }
  if (!urgent) {
    const tone = input.calm.tone ?? 'success'
    return { tone, badge: input.calm.badge ?? BADGE[tone], summary: input.calm.summary, attention, actions, ...extra }
  }
  const tone = errors ? 'error' : 'warning'
  // Hüküm kısa ve sayılı (§11.1: "2 konu şimdi müdahale istiyor"); en acil madde ikinci cümlede.
  const summary = input.busy
    ? input.busy({ top: attention[0], errors, warnings, total: urgent })
    : errors
      ? `${countPhrase(errors, 'konu')} şimdi müdahale istiyor`
      : `${countPhrase(urgent, 'konu')} izlenmeli`
  if (!input.note && !input.busy) extra.note = `En önemlisi: ${attention[0].title}.`
  return { tone, badge: BADGE[tone], summary, attention, actions, ...extra }
}

/**
 * Okunamayan kaynak (ilke 7): sayfanın hükmü "sağlıklı" diyemez. Kaynak adı + tekrar dene eylemi olan sarı madde.
 * `stale` (son iyi veri ekranda) ise metin "yenilenemedi" olur.
 */
export function unreadable(id: string, what: string, retry: () => void, stale = false): AttentionItem {
  return {
    id: `unreadable-${id}`,
    tone: 'warning',
    title: stale ? `${what} yenilenemedi` : `${what} okunamadı`,
    impact: stale ? 'Gösterilen veri eski olabilir.' : 'Bu bölüm hakkında hüküm verilemiyor.',
    advice: 'Bağlantıyı denetleyip tekrar deneyin.',
    cta: 'Tekrar dene',
    source: what,
    onSelect: retry,
  }
}
