// A8 — filtre paneli başlığının saf mantığı (EkFilterPanel + EkActiveFilters compact; testler aynı kaynağı kullanır).

/** Başlık düğmesinin ekran okuyucu eki: ", 2 aktif filtre" / ", aktif filtre yok". */
export function filterCountText(activeCount: number): string {
  return activeCount > 0 ? `${activeCount} aktif filtre` : 'aktif filtre yok'
}

/** "+n" taşma düğmesi: görünür metin + erişilebilir ad. */
export function overflowLabel(hidden: number, expanded: boolean): { text: string; aria: string } {
  return expanded ? { text: 'Daha az', aria: 'Filtre özetini daralt' } : { text: `+${hidden}`, aria: `${hidden} filtre daha göster` }
}

/**
 * Tek satıra sığan çip sayısı. Hepsi sığıyorsa tümü; sığmıyorsa "+n" düğmesine (`moreW`) yer bırakılarak
 * soldan sığanlar — en az 1 (dar kapta tek çip kendi içinde üç noktayla kısalır). `avail <= 0` → hepsi (ölçüm yok).
 */
export function fitChipCount(widths: readonly number[], avail: number, gap: number, moreW: number): number {
  if (avail <= 0 || !widths.length) return widths.length
  const total = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, widths.length - 1)
  if (total <= avail) return widths.length
  let used = 0
  let n = 0
  for (const w of widths) {
    const next = used + (n ? gap : 0) + w
    if (next + gap + moreW > avail) break
    used = next
    n += 1
  }
  return Math.max(1, n)
}
