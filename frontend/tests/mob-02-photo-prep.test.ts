// MOB-02 — kamera fotoğrafı hazırlama: EXIF/GPS silme, uzun kenar ve bayt sınırı, hata durumları.
// Gerçek tuval yeniden kodlaması Playwright'ta (e2e/specs/mob-02-camera-photo.spec.ts) doğrulanır; burada
// tarayıcı API'leri sahte `deps` ile verilir.
import { describe, expect, it } from 'vitest'
import {
  PHOTO_PREP, PHOTO_PREP_MESSAGES, PhotoPrepError, cameraFileName, fitWithin, hasExif, hasMetadata, preparePhoto, stripJpegMetadata,
  type DecodedImage, type PhotoPrepDeps,
} from '../src/components/productDefinitions/images/photoPrep'

const seg = (marker: number, payload: number[]) => {
  const len = payload.length + 2
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload]
}
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))

/** SOI · APP0 JFIF · APP1 Exif (GPS etiketiyle) · APP1 XMP · APP2 ICC · APP13 IPTC · COM · DQT · SOS · veri · EOI */
function jpegWithMetadata(): Uint8Array {
  const exif = [...ascii('Exif'), 0, 0, ...ascii('MM'), 0, 42, 0, 0, 0, 8, ...ascii('GPSLatitude=41.0082;GPSLongitude=28.9784')]
  return new Uint8Array([
    0xff, 0xd8,
    ...seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...seg(0xe1, exif),
    ...seg(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<x:xmpmeta>konum</x:xmpmeta>')]),
    ...seg(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, 9, 9]),
    ...seg(0xed, [...ascii('Photoshop 3.0'), 0, 1, 2, 3]),
    ...seg(0xfe, ascii('Kamera: Telefon X')),
    ...seg(0xdb, [0, ...new Array(64).fill(1)]),
    0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0,
    0x12, 0x34, 0xff, 0x00, 0x56,
    0xff, 0xd9,
  ])
}

const text = (b: Uint8Array) => String.fromCharCode(...b)

describe('stripJpegMetadata', () => {
  it('Exif (GPS), XMP, IPTC ve yorumu siler; JFIF, ICC, tablo ve görüntü verisini korur', () => {
    const src = jpegWithMetadata()
    expect(hasExif(src)).toBe(true)
    const out = stripJpegMetadata(src)
    expect(hasExif(out)).toBe(false)
    expect(hasMetadata(out)).toBe(false)
    const s = text(out)
    expect(s).not.toContain('GPS')
    expect(s).not.toContain('xmpmeta')
    expect(s).not.toContain('Photoshop')
    expect(s).not.toContain('Telefon X')
    expect(s).toContain('JFIF')
    expect(s).toContain('ICC_PROFILE')
    // SOS'tan sonrası (entropi verisi + EOI) bayt bayt aynı
    const tail = (b: Uint8Array) => b.subarray(b.findIndex((x, i) => x === 0xff && b[i + 1] === 0xda))
    expect(Array.from(tail(out))).toEqual(Array.from(tail(src)))
    expect(out[0]).toBe(0xff)
    expect(out[1]).toBe(0xd8)
  })

  it('meta verisiz JPEG ve JPEG olmayan girdi aynen döner; bozuk yapı çözülmeye çalışılmaz', () => {
    const clean = stripJpegMetadata(jpegWithMetadata())
    expect(stripJpegMetadata(clean)).toBe(clean)
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])
    expect(stripJpegMetadata(png)).toBe(png)
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2])
    expect(stripJpegMetadata(broken)).toBe(broken)
    expect(hasExif(broken)).toBe(false)
  })
})

describe('fitWithin', () => {
  it('uzun kenarı sınıra indirir, oranı korur, büyütmez', () => {
    expect(fitWithin(4000, 3000, 2400)).toEqual({ width: 2400, height: 1800 })
    expect(fitWithin(3000, 4000, 2400)).toEqual({ width: 1800, height: 2400 })
    expect(fitWithin(1200, 900, 2400)).toEqual({ width: 1200, height: 900 })
    expect(fitWithin(10000, 1, 2400)).toEqual({ width: 2400, height: 1 })
  })
})

// ---------------------------------------------------------------- preparePhoto (sahte tarayıcı)

interface FakeOpts {
  width?: number
  height?: number
  decodeError?: boolean
  encodeError?: boolean
  /** Kodlanan baytı belirler (varsayılan: küçük, meta verili JPEG). */
  bytesFor?: (w: number, h: number, q: number) => number
  calls?: { w: number; h: number; q: number }[]
}

function fakeDeps(o: FakeOpts = {}): PhotoPrepDeps & { closed: () => boolean } {
  let closed = false
  return {
    closed: () => closed,
    async decode() {
      if (o.decodeError) throw new Error('DOMException: The source image could not be decoded.')
      return { width: o.width ?? 4000, height: o.height ?? 3000, source: {}, close: () => { closed = true } } as DecodedImage
    },
    async encode(_img, w, h, q) {
      o.calls?.push({ w, h, q })
      if (o.encodeError) throw new Error('toBlob boş')
      // Tarayıcı kodlayıcısı meta veri yazsa bile (güvence testi) çıktıdan silinmeli.
      const base = jpegWithMetadata()
      const size = o.bytesFor ? o.bytesFor(w, h, q) : base.length
      const out = new Uint8Array(Math.max(size, base.length))
      out.set(base.subarray(0, base.length - 2))
      out.set([0xff, 0xd9], out.length - 2)
      return new Blob([out], { type: 'image/jpeg' })
    },
  }
}

const photo = (bytes: Uint8Array | number = jpegWithMetadata(), type = 'image/jpeg', name = 'image.jpg') =>
  new File([typeof bytes === 'number' ? new Uint8Array(bytes) : (bytes as BlobPart)], name, { type })

describe('preparePhoto', () => {
  it('telefon fotoğrafı (4000×3000, EXIF/GPS) → 2400×1800 JPEG, Exif yok, okunur ad', async () => {
    const calls: FakeOpts['calls'] = []
    const deps = fakeDeps({ calls })
    const r = await preparePhoto(photo(), deps, 'kamera-20261001-120000.jpg')
    expect(r.width).toBe(2400)
    expect(r.height).toBe(1800)
    expect(r.originalWidth).toBe(4000)
    expect(r.exifRemoved).toBe(true)
    expect(r.file.type).toBe('image/jpeg')
    expect(r.file.name).toBe('kamera-20261001-120000.jpg')
    const out = new Uint8Array(await r.file.arrayBuffer())
    expect(hasExif(out)).toBe(false)
    expect(text(out)).not.toContain('GPS')
    expect(calls).toEqual([{ w: 2400, h: 1800, q: PHOTO_PREP.qualities[0] }])
    expect(deps.closed()).toBe(true)
  })

  it('küçük fotoğraf büyütülmez; Exif yoksa exifRemoved=false', async () => {
    const r = await preparePhoto(photo(stripJpegMetadata(jpegWithMetadata())), fakeDeps({ width: 1200, height: 1600 }))
    expect([r.width, r.height]).toEqual([1200, 1600])
    expect(r.exifRemoved).toBe(false)
  })

  it('10 MB tavanı: önce kalite, sonra boyut düşer; sonuç tavanın altında', async () => {
    const calls: FakeOpts['calls'] = []
    // 0,7 kalitede bile 2400 px'te tavan aşılır; 1920 px'te 0,88 yeterli olur.
    const bytesFor = (w: number, _h: number, q: number) => (w >= 2400 ? PHOTO_PREP.maxBytes + 4096 : q > 0.85 ? 4_000_000 : 3_000_000)
    const r = await preparePhoto(photo(), fakeDeps({ calls, bytesFor }))
    expect(r.file.size).toBeLessThanOrEqual(PHOTO_PREP.maxBytes)
    expect(calls.map((c) => [c.w, c.q])).toEqual([[2400, 0.88], [2400, 0.8], [2400, 0.7], [1920, 0.88]])
    expect(r.width).toBe(1920)
  })

  it('hiçbir kademede sığmazsa too-large-output', async () => {
    await expect(preparePhoto(photo(), fakeDeps({ bytesFor: () => PHOTO_PREP.maxBytes + 4096 }))).rejects.toMatchObject({ code: 'too-large-output' })
  })

  it.each([
    ['not-image', () => preparePhoto(photo(new Uint8Array([1, 2, 3]), 'application/pdf', 'fatura.pdf'), fakeDeps())],
    ['not-image', () => preparePhoto(photo(0), fakeDeps())],
    ['too-large-input', () => preparePhoto(photo(PHOTO_PREP.maxInputBytes + 1), fakeDeps())],
    ['decode-failed', () => preparePhoto(photo(), fakeDeps({ decodeError: true }))],
    ['too-many-pixels', () => preparePhoto(photo(), fakeDeps({ width: 10000, height: 6000 }))],
    ['encode-failed', () => preparePhoto(photo(), fakeDeps({ encodeError: true }))],
  ] as const)('%s → PhotoPrepError + kullanıcı metni', async (code, run) => {
    const err = await run().catch((e) => e)
    expect(err).toBeInstanceOf(PhotoPrepError)
    expect(err.code).toBe(code)
    expect(err.message).toBe(PHOTO_PREP_MESSAGES[code])
    // "<ne oldu> — <ne yapılmalı>" biçimi; ham hata metni sızmaz
    expect(err.message).toContain(' — ')
    expect(err.message).not.toMatch(/DOMException|toBlob/)
  })

  it('türü boş gelen kamera dosyası çözümlemeye bırakılır', async () => {
    const r = await preparePhoto(photo(jpegWithMetadata(), ''), fakeDeps())
    expect(r.file.type).toBe('image/jpeg')
  })

  it('çözümleme hatasında bile kaynak kapatılır (too-many-pixels)', async () => {
    const deps = fakeDeps({ width: 9000, height: 9000 })
    await expect(preparePhoto(photo(), deps)).rejects.toBeInstanceOf(PhotoPrepError)
    expect(deps.closed()).toBe(true)
  })
})

describe('cameraFileName', () => {
  it('yerel saatle kamera-YYYYAAGG-SSDDss.jpg', () => {
    expect(cameraFileName(new Date(2026, 9, 1, 9, 5, 7))).toBe('kamera-20261001-090507.jpg')
  })
})
