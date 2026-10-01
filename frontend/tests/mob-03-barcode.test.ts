// MOB-03 — barkodla bulma: motor seçimi, kamera hatası → dürüst durum, kod temizleme, uzlaşı, JS okuyucu
// (gerçek @zxing/library ile sentetik EAN-13), JS okuyucunun yalnız dinamik yüklendiği (ana pakete girmez).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CAMERA_MESSAGES, CODE_MAX_LENGTH, cameraApiAvailable, classifyCameraError, createConsensus, normalizeCode, pickEngine, rgbaToLuma, scanFrameSize,
} from '../src/composables/barcode/barcodeScan'
import { decodeLuma } from '../src/composables/barcode/zxingDecoder'
import { ean13CheckDigit, ean13Modules, renderBarcodeRgba } from '../e2e/fixtures/ean13'

const SRC = join(__dirname, '..', 'src')

describe('pickEngine', () => {
  const ctor = (formats: string[] | Error) => {
    const C = function () { return { detect: async () => [] } } as unknown as { getSupportedFormats: () => Promise<string[]> }
    C.getSupportedFormats = async () => { if (formats instanceof Error) throw formats; return formats }
    return C
  }
  it('BarcodeDetector yok → JS', async () => {
    expect(await pickEngine({})).toEqual({ engine: 'js', formats: [] })
  })
  it('yerel okuyucu ürün barkodunu destekliyorsa yerel; yalnız ortak biçimler istenir', async () => {
    const r = await pickEngine({ BarcodeDetector: ctor(['qr_code', 'ean_13', 'aztec', 'code_128']) as never })
    expect(r.engine).toBe('native')
    expect(r.formats).toEqual(['ean_13', 'code_128', 'qr_code'])
  })
  it('yalnız QR destekleyen ya da biçim listesi alınamayan yerel okuyucu → JS', async () => {
    expect((await pickEngine({ BarcodeDetector: ctor(['qr_code']) as never })).engine).toBe('js')
    expect((await pickEngine({ BarcodeDetector: ctor(new Error('x')) as never })).engine).toBe('js')
  })
})

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'denied'], ['SecurityError', 'denied'], ['PermissionDeniedError', 'denied'],
    ['NotFoundError', 'no-camera'], ['OverconstrainedError', 'no-camera'],
    ['NotReadableError', 'busy'], ['AbortError', 'busy'],
    ['TypeError', 'unsupported'], ['Weird', 'error'],
  ])('%s → %s', (name, expected) => {
    expect(classifyCameraError({ name })).toBe(expected)
  })
  it('null/undefined → error; her durumun dürüst metni var ve elle girişi gösterir', () => {
    expect(classifyCameraError(null)).toBe('error')
    for (const m of Object.values(CAMERA_MESSAGES)) {
      expect(m.title.length).toBeGreaterThan(5)
      expect(m.text).toMatch(/elle|yeniden/i)
    }
  })
  it('cameraApiAvailable: mediaDevices yok (güvensiz bağlam) → false', () => {
    expect(cameraApiAvailable({})).toBe(false)
    expect(cameraApiAvailable({ mediaDevices: {} })).toBe(false)
    expect(cameraApiAvailable({ mediaDevices: { getUserMedia: () => 0 } })).toBe(true)
  })
})

describe('normalizeCode', () => {
  it('boşluk ve denetim karakterlerini (GS1 FNC1) temizler', () => {
    expect(normalizeCode('  8690000000012 \n')).toBe('8690000000012')
    expect(normalizeCode('\u001d0108690000000012\u001d10ABC')).toBe('0108690000000012' + '10ABC')
  })
  it('boş, metin olmayan ya da çok uzun → null', () => {
    expect(normalizeCode('   ')).toBeNull()
    expect(normalizeCode(undefined)).toBeNull()
    expect(normalizeCode(42)).toBeNull()
    expect(normalizeCode('x'.repeat(CODE_MAX_LENGTH + 1))).toBeNull()
    expect(normalizeCode('x'.repeat(CODE_MAX_LENGTH))).toHaveLength(CODE_MAX_LENGTH)
  })
})

describe('createConsensus', () => {
  it('aynı kod art arda 2 kez → kabul; okunamayan kare seriyi bozmaz; farklı kod sıfırlar', () => {
    const c = createConsensus(2)
    expect(c.push('A')).toBeNull()
    expect(c.push(null)).toBeNull()
    expect(c.push('B')).toBeNull()
    expect(c.push('A')).toBeNull()
    expect(c.push('A')).toBe('A')
    c.reset()
    expect(c.push('A')).toBeNull()
  })
  it('yerel okuyucu için 1 okuma yeterli', () => {
    expect(createConsensus(1).push('X')).toBe('X')
  })
})

describe('görüntü yardımcıları', () => {
  it('rgbaToLuma: siyah 0, beyaz 255', () => {
    const l = rgbaToLuma(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1)
    expect(Array.from(l)).toEqual([0, 255])
  })
  it('scanFrameSize: uzun kenar 1280', () => {
    expect(scanFrameSize(1920, 1080)).toEqual({ width: 1280, height: 720 })
    expect(scanFrameSize(640, 480)).toEqual({ width: 640, height: 480 })
  })
})

describe('JS okuyucu (@zxing/library, yalnız 1B)', () => {
  it('sentetik EAN-13 görüntüsünü okur', () => {
    const code = '869' + '123456789'
    const full = code + ean13CheckDigit(code)
    const img = renderBarcodeRgba(ean13Modules(full))
    expect(decodeLuma(rgbaToLuma(img.data, img.width, img.height), img.width, img.height)).toBe(full)
  })
  it('barkodsuz kare → null (hata fırlatmaz)', () => {
    const w = 200, h = 100
    expect(decodeLuma(new Uint8ClampedArray(w * h).fill(255), w, h)).toBeNull()
  })
})

// ---------------------------------------------------------------- paket sınırı (lazy-load)

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|vue)$/.test(n) ? [p] : []
  })
}

describe('JS okuyucu ana pakete girmez', () => {
  const files = walk(SRC).map((p) => ({ rel: relative(SRC, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }))
  it('@zxing yalnız composables/barcode/zxingDecoder.ts içinde ve yalnız derin (1B) yollardan', () => {
    const users = files.filter((f) => /from ['"]@zxing\//.test(f.text)).map((f) => f.rel)
    expect(users).toEqual(['composables/barcode/zxingDecoder.ts'])
    const zx = files.find((f) => f.rel === 'composables/barcode/zxingDecoder.ts')!.text
    expect(zx).not.toMatch(/from ['"]@zxing\/library['"]/)
  })
  it('zxingDecoder yalnız dinamik import() ile yüklenir', () => {
    const staticImports = files.filter((f) => /import\s[^(]*from\s+['"][^'"]*zxingDecoder['"]/.test(f.text)).map((f) => f.rel)
    expect(staticImports).toEqual([])
    const dynamic = files.filter((f) => /import\(\s*['"][^'"]*zxingDecoder['"]\s*\)/.test(f.text)).map((f) => f.rel)
    expect(dynamic).toEqual(['composables/barcode/useBarcodeScanner.ts'])
  })
})
