/** Önbellek — sayfa hükmü (K51). Saf. Önbellek pod-yereldir; boşaltma güvenli ama guarded (gerekçe + kimlik doğrulaması). */
import type { RouteLocationRaw } from 'vue-router'
import type { CacheMetrics } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatCount, formatPercent } from '@bo/utils/units'

/** İsabet oranı bunun altındaysa sarı (sayfadaki KPI kartıyla aynı). */
export const HIT_RATIO_WARN = 0.8
/** Oran yorumu için asgari sorgu sayısı (isabet + ıska); altı gürültüdür. */
export const MIN_LOOKUPS = 100
/** Anahtar sayısı üst sınırın bu oranına ulaşırsa sarı (tahliye başlamak üzere). */
export const KEYS_WARN = 0.9

/** Aile tablosu (aynı sayfada bağlantı; CacheView kartının kimliği). */
const FAMILIES: RouteLocationRaw = { query: {}, hash: '#bo-cache-families' }

export interface CacheVerdictInput {
  data: CacheMetrics | null
  failed: boolean
  retry: () => void
  /** Güvenli eylem: aile boşaltma diyaloğunu (gerekçe + step-up) açar. */
  flush: (family: string) => void
}

export function cacheVerdict(i: CacheVerdictInput): PageVerdict {
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []
  const d = i.data

  if (i.failed) attention.push(unreadable('cache', 'Önbellek metrikleri', i.retry))
  let weak: CacheMetrics['breakdown'][number] | undefined
  if (d) {
    const lookups = d.hits + d.misses
    const ratio = lookups > 0 ? d.hits / lookups : null
    if (ratio !== null && lookups >= MIN_LOOKUPS && ratio < HIT_RATIO_WARN) {
      weak = d.breakdown.filter((f) => f.hitRatio !== null && f.hit + f.miss >= MIN_LOOKUPS / 10).sort((a, b) => (a.hitRatio ?? 1) - (b.hitRatio ?? 1))[0]
      attention.push({
        id: 'hit-ratio',
        tone: 'warning',
        title: `Önbellek isabet oranı ${formatPercent(ratio)} (hedef %${Math.round(HIT_RATIO_WARN * 100)} ve üzeri)`,
        impact: weak ? `En düşük aile: ${weak.name} (${formatPercent(weak.hitRatio)}); istekler veri kaynağına düşüyor, yanıtlar yavaşlıyor.` : 'İstekler sık sık veri kaynağına düşüyor; yanıtlar yavaşlıyor.',
        advice: 'Aile tablosunda oranı en düşük olanı kontrol edin; bayat veri şüphesi varsa aileyi boşaltın.',
        to: FAMILIES,
        cta: 'Aileleri aç',
      })
    }
    if (d.maxKeys > 0 && d.keys / d.maxKeys >= KEYS_WARN)
      attention.push({ id: 'keys-full', tone: 'warning', title: `Önbellek doluluğu %${Math.round((d.keys / d.maxKeys) * 100)} (${formatCount(d.keys)} / ${formatCount(d.maxKeys)} anahtar)`, impact: 'Üst sınırda eski kayıtlar tahliye edilir; isabet oranı düşebilir.', advice: 'En çok anahtar tutan aileyi kontrol edin.', to: FAMILIES, cta: 'Aileleri aç' })
    if (d.totals.error > 0)
      attention.push({ id: 'cache-errors', tone: 'warning', title: `${formatCount(d.totals.error)} önbellek hatası kaydedildi`, impact: 'Hatalı okumalar veri kaynağına düşer; yanıtlar yavaşlayabilir.', advice: 'Nedeni platform loglarında kontrol edin.', cta: 'Platform loglarını aç', to: { path: '/loglar', query: { category: 'platform', level: 'fatal,error' } } })
    const target = weak ?? (attention.length ? [...d.breakdown].sort((a, b) => b.count - a.count)[0] : undefined)
    if (weak)
      actions.push({ id: 'flush', label: `${weak.name} ailesini boşaltın`, cta: 'Aileyi boşalt', detail: `Yalnız ${d.pod} podunun belleğinden siler; sonraki istekler veriyi yeniden yükler.`, icon: 'mdi-broom', guarded: true, onSelect: () => i.flush(weak!.name) })
    else if (target && d.keys / Math.max(1, d.maxKeys) >= KEYS_WARN)
      actions.push({ id: 'flush', label: `${target.name} ailesini boşaltın`, cta: 'Aileyi boşalt', detail: `En çok anahtar tutan aile; yalnız ${d.pod} podunu etkiler.`, icon: 'mdi-broom', guarded: true, onSelect: () => i.flush(target.name) })
  }

  return buildVerdict({
    attention,
    actions,
    checks: ['İsabet oranı', 'Anahtar doluluğu', 'Önbellek hataları'],
    okTitle: 'Önbellekte müdahale gereken bir şey yok',
    calm: { summary: d && d.hits + d.misses < MIN_LOOKUPS ? 'Önbellek çalışıyor; oran yorumlamak için henüz yeterli sorgu yok.' : 'Önbellek isabet oranı hedefte; doluluk sınırın altında ve hata yok.' },
    busy: ({ total, top }) => (i.failed && !d ? 'Önbellek durumu okunamadı — hüküm verilemiyor; tekrar deneyin.' : `Önbellekte ${total === 1 ? 'bir konu' : `${total} konu`} izlenmeli; en önemlisi: ${top.title}.`),
  })
}
