/**
 * Vuetify'ın `parseColor`/`RGBtoHex` (node_modules/vuetify/lib/util/colorUtils.js)
 * ile AYNI mantığı taşıyan, bağımsız küçük bir normalize yardımcısı
 * (ADR-0011 Karar 4 / Bağlam 15 — "aynı mantığı taşıyan küçük bir yardımcı yaz").
 *
 * Amaç: tema characterization testinde `#E53935` ile `E53935` (baştaki `#`
 * eksik) veya `444` ile `444444` (3 haneli kısaltma) gibi Vuetify'ın çalışma
 * anında eşdeğer saydığı değerleri TEK bir normalize biçime indirip
 * karşılaştırmak — ADR Bağlam madde 1'in belirttiği gibi bu farklar çalışma
 * anında görsel bir kırığa yol açmıyor, dolayısıyla normalize sonrası
 * anlık görüntüde fark ÜRETMEMELİ.
 *
 * Yalnızca hex(a) girdi biçimini destekler (bu proje temasında yalnızca hex
 * literal kullanılıyor; rgb()/hsl() yok — grep ile doğrulandı).
 */
export function normalizeHexColor(input: string): string {
  let hex = input.startsWith('#') ? input.slice(1) : input
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('')
  }
  if (hex.length !== 6 && hex.length !== 8) {
    throw new Error(`normalizeHexColor: beklenmeyen hex uzunluğu: "${input}"`)
  }
  const bytes = hex.match(/.{2}/g) ?? []
  const toHex = (v: number) => v.toString(16).padStart(2, '0').toUpperCase()
  return `#${bytes.map((b) => toHex(parseInt(b, 16))).join('')}`
}

/** Bir renk haritasındaki (Record<string,string>) her değeri normalize eder. */
export function normalizeColorMap(colors: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(colors)) {
    result[key] = typeof value === 'string' ? normalizeHexColor(value) : String(value)
  }
  return result
}
