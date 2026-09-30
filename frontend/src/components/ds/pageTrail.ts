/**
 * frontend/src/components/ds/pageTrail.ts
 *
 * DS-v2 A7 — sayfa yolu (breadcrumb) MODELİ. `EkPageBar` bunu çizer; kural burada, saf TS (vitest korur).
 *
 *   kök (bölüm, modül ikonu) / ara öğeler / SON öğe = sayfa başlığı (H1, aria-current=page) [· kayıt kimliği]
 *
 * - Kök = kayıt defterindeki bölüm adı; tıklanabilir DEĞİL (ADR-0015 Karar 2.3 — bölüm bir ekran değildir).
 * - Ara öğe = gerçek bir üst ekran (ör. "Entegrasyonlar" listesi); `onSelect` verilirse bağlantıdır.
 * - Katlama (geniş): ara öğe sayısı > MAX_VISIBLE_MIDDLE (2) ise son ikisi kalır, öncekiler '…' menüsüne; yol
 *   satıra sığmazsa (EkPageBar ölçer) önce 1'e sonra 0'a iner — ara öğe asla "E…" gibi anlamsız kısalmaz.
 * - Dar (< 560px KAP): düzen CSS kap sorgusundadır (EkPageBar `@container ek-page-bar`) — iki satır, [geri oku] [ebeveyn]
 *   üstte, başlık altta; kök (ebeveyn varken), '…' ve diğer ara öğeler gizli. Ebeveyn = son görünen ara öğe. Ebeveyn = son ara öğe,
 *   yoksa kök. Geri oku, tıklanabilir en yakın ata varsa çıkar (yoksa gösterilmez — ölü düğme yok).
 */

export interface EkCrumb {
  label: string
  /** mdi ikon (yalnız menüde gösterilir; satırda ara öğeler ikonsuz — sakin). */
  icon?: string
  /** Verilirse öğe bağlantıdır (üst ekranı açar). */
  onSelect?: () => void
}

export interface EkRecordRef {
  /** Kısa, kopyalanabilir kimlik (sipariş no, stok kodu, entegrasyon kodu). */
  code: string
  /** Kanal kodu (`design/channels.ts`) → kanal rengi noktası. */
  channel?: string | null
  /** Ekran okuyucu / ipucu adı (ör. "Stok kodu"). */
  label?: string
}

export const MAX_VISIBLE_MIDDLE = 2

export interface TrailView {
  /** Kök (bölüm) görünür mü? */
  showRoot: boolean
  /** Satırda görünen ara öğeler. */
  middle: EkCrumb[]
  /** '…' menüsüne katlanan ara öğeler (kök sonrası, görünen ara öğelerden önce). */
  folded: EkCrumb[]
  /** Dar görünümde geri okunun hedefi (en yakın bağlantılı ata). */
  back: EkCrumb | null
}

/**
 * `keep`: satırda kalacak ara öğe sayısı üst sınırı (varsayılan MAX_VISIBLE_MIDDLE). `EkPageBar` yol sığmadığında
 * (bir ara öğe kısalmak zorunda kalınca) bunu 1'e, sonra 0'a indirir — kısaltılmış anlamsız "E…" yerine '…' menüsü.
 */
export function buildTrail(trail: readonly EkCrumb[] | undefined, opts: { hasRoot: boolean; keep?: number }): TrailView {
  const all = [...(trail ?? [])].filter((c) => c && c.label)
  const back = [...all].reverse().find((c) => c.onSelect) ?? null
  const keep = Math.max(0, Math.min(opts.keep ?? MAX_VISIBLE_MIDDLE, MAX_VISIBLE_MIDDLE))
  if (all.length > keep) {
    return { showRoot: opts.hasRoot, middle: keep ? all.slice(-keep) : [], folded: keep ? all.slice(0, -keep) : all, back }
  }
  return { showRoot: opts.hasRoot, middle: all, folded: [], back }
}
