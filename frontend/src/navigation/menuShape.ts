/**
 * frontend/src/navigation/menuShape.ts
 *
 * FR2-SHELL madde 7/8 (fe-r2a) — `MenuService` ağacının KABUKTA sunum biçimi (SAF TS, test edilebilir).
 * Menü kaydı ApplicationDB `menus` belgesindedir (bulut kapsamı dışı); erişim kaynağı değişmez (ADR-0015 Karar 2.4):
 * burada ekran EKLENMEZ, yalnız sunum düzeltilir.
 *  - Emekli öğeler (Eğitim Merkezi — Yardım merkezi yerine geçti) gösterilmez.
 *  - Üst seviyeye çıkarılan yapraklar (Uygulama Ayarları) grubundan çıkıp grubun hemen önüne yerleşir; boşalan grup düşer.
 */

/** Kullanıcı kararıyla menüden kaldırılan öğeler (kod ya da başlık anahtarı). */
const RETIRED_CODES = new Set(['EducationView'])
const RETIRED_TITLES = new Set(['educationCenter', 'support_school'])

/** Grubundan çıkarılıp bölümün üst seviyesinde gösterilen ekranlar. */
export const HOISTED_CODES: ReadonlySet<string> = new Set(['SettingListView'])

export function isRetiredLink(link: { code?: string; title?: string } | null | undefined): boolean {
  if (!link) return false
  return RETIRED_CODES.has(String(link.code ?? '')) || RETIRED_TITLES.has(String(link.title ?? ''))
}

/**
 * Bir menü grubunun `links` dizisini kabuk düzenine çevirir (girdi DEĞİŞTİRİLMEZ; düğüm nesneleri aynı kalır —
 * sekme/favori/başlık çözümü aynı bağlantı nesnesiyle çalışır).
 */
export function shapeGroupLinks<T extends { code?: string; title?: string; children?: T[] }>(links: T[] | undefined): T[] {
  const out: T[] = []
  for (const link of links ?? []) {
    if (!link || isRetiredLink(link)) continue
    if (!Array.isArray(link.children) || link.children.length === 0) {
      out.push(link)
      continue
    }
    const kept: T[] = []
    const hoisted: T[] = []
    for (const child of link.children) {
      if (!child || isRetiredLink(child)) continue
      if (HOISTED_CODES.has(String(child.code ?? ''))) hoisted.push(child)
      else kept.push(child)
    }
    // Yukarı alınan yaprak grubun ÖNÜNE gelir (bölümün ilk, en sık kullanılan girişi); grup kendi çocuklarını
    // kaybettiyse (tamamı emekli/yukarı alındı) grup düğümü gösterilmez.
    out.push(...hoisted)
    if (kept.length > 0) out.push(kept.length === link.children.length ? link : ({ ...link, children: kept } as T))
  }
  return out
}
