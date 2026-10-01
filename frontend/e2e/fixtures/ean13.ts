// MOB-03 test yardımcısı — EAN-13 kodlayıcı (sahte kamera görüntüsü ve birim testi için; üretim kodunda kullanılmaz).
// Saf fonksiyonlar; Playwright `addInitScript`'e `ean13Modules.toString()` ile değil, modül dizisi olarak verilir.

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

export function ean13CheckDigit(first12: string): number {
  const sum = first12.split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10
}

/** 13 haneli kod → 95 modül (1 = siyah). */
export function ean13Modules(code: string): number[] {
  if (!/^\d{13}$/.test(code)) throw new Error('EAN-13: 13 hane')
  if (ean13CheckDigit(code.slice(0, 12)) !== Number(code[12])) throw new Error('EAN-13: sağlama hanesi')
  const d = code.split('').map(Number)
  const parity = PARITY[d[0]]
  let bits = '101'
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? L : G)[d[i]]
  bits += '01010'
  for (let i = 7; i <= 12; i++) bits += R[d[i]]
  bits += '101'
  return bits.split('').map(Number)
}

/** Modülleri RGBA görüntüye çizer (beyaz zemin, sessiz bölge 12 modül). */
export function renderBarcodeRgba(modules: number[], moduleWidth = 3, height = 120): { data: Uint8ClampedArray; width: number; height: number } {
  const quiet = 12
  const width = (modules.length + quiet * 2) * moduleWidth
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let m = 0; m < modules.length; m++) {
    if (!modules[m]) continue
    for (let x = (quiet + m) * moduleWidth; x < (quiet + m + 1) * moduleWidth; x++) {
      for (let y = 0; y < height; y++) {
        const o = (y * width + x) * 4
        data[o] = data[o + 1] = data[o + 2] = 0
      }
    }
  }
  return { data, width, height }
}
