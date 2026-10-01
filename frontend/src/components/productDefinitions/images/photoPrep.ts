/**
 * frontend/src/components/productDefinitions/images/photoPrep.ts
 *
 * MOB-02 — kamerayla çekilen ürün fotoğrafını yüklemeden önce istemcide hazırlar:
 *   1. Çözümle (`createImageBitmap`, EXIF yönü görüntüye işlenir — `imageOrientation: 'from-image'`).
 *   2. Uzun kenar `PHOTO_PREP.maxLongEdge`'i aşıyorsa orantılı küçült (büyütme yok).
 *   3. Tuval üzerinden JPEG olarak YENİDEN KODLA → EXIF/GPS/XMP/IPTC tuvale hiç taşınmaz.
 *   4. Güvence: çıktıda kalan meta veri bölütleri (APP1 Exif/XMP, APP13 IPTC, COM) bayt düzeyinde de silinir.
 *   5. Bayt tavanı (`maxBytes`: public-config `env.images.uploadMaxBytes`, yoksa sözleşmedeki 10 MB) aşılırsa kalite, sonra boyut kademeli düşürülür.
 *
 * Sınırlar (docs/IMAGE_UPLOAD_CONTRACT.md): tür izin listesi jpeg/png/webp(/avif), tavan 10 MB, ≤ 50 MP. Sözleşmede
 * uzun kenar piksel sınırı YOK; 2400 px seçildi — önerilen kısa kenar (IMAGE_GUIDE.recommendedPx = 1200) 2:1'e kadar
 * her oranda korunur, telefon fotoğrafı (4000×3000, 3–6 MB) ~2400×1800 / 0,4–1 MB'a iner.
 *
 * Tarayıcı API'leri `deps` ile verilebilir (birim testleri düğüm ortamında koşar; gerçek tuval Playwright'ta).
 */
import { semanticColorsLight } from '@entegrasyonik/ui/tokens'

export const PHOTO_PREP = {
  /** Uzun kenar üst sınırı (px). */
  maxLongEdge: 2400,
  /**
   * Yedek bayt tavanı (IMAGE_UPLOAD_CONTRACT: varsayılan 10 MB). FE-CFG-1: çağıran yer `preparePhoto(..., maxBytes)` ile
   * backend ortam değerini (`env.images.uploadMaxBytes`, `stores/publicConfig`) geçirir; bu değer yalnız verilmezse kullanılır.
   */
  maxBytes: 10 * 1024 * 1024,
  /** Girdi dosyası bunun üstündeyse çözümlemeye bile girişilmez (telefon belleği). */
  maxInputBytes: 40 * 1024 * 1024,
  /** Çözümlenen görüntü bu piksel sayısını aşamaz (sözleşme: ≤ 50 MP). */
  maxInputPixels: 50_000_000,
  /** Sırayla denenen JPEG kaliteleri. */
  qualities: [0.88, 0.8, 0.7] as readonly number[],
  /** Kalite yetmezse boyut bu oranla küçültülür (en çok 3 kez). */
  shrinkStep: 0.8,
  outputType: 'image/jpeg',
} as const

export type PhotoPrepErrorCode = 'not-image' | 'too-large-input' | 'decode-failed' | 'too-many-pixels' | 'encode-failed' | 'too-large-output'

/** Kullanıcıya gösterilen metin (ham hata gösterilmez): "<ne oldu> — <ne yapılmalı>". */
export const PHOTO_PREP_MESSAGES: Record<PhotoPrepErrorCode, string> = {
  'not-image': 'Bu dosya bir fotoğraf değil — kamerayla yeniden çekin ya da JPG/PNG seçin',
  'too-large-input': 'Fotoğraf dosyası çok büyük (40 MB üstü) — kamera ayarlarından daha düşük çözünürlükle çekin',
  'decode-failed': 'Fotoğraf bu tarayıcıda açılamadı — JPG olarak kaydedip "Görsel ekle" ile yükleyin',
  'too-many-pixels': 'Fotoğraf çözünürlüğü çok yüksek (50 MP üstü) — daha düşük çözünürlükle çekin',
  'encode-failed': 'Fotoğraf hazırlanamadı — yeniden çekmeyi deneyin',
  'too-large-output': 'Fotoğraf küçültüldüğü hâlde yükleme sınırını aşıyor — daha düşük çözünürlükle çekin',
}

export class PhotoPrepError extends Error {
  constructor(public readonly code: PhotoPrepErrorCode) {
    super(PHOTO_PREP_MESSAGES[code])
    this.name = 'PhotoPrepError'
  }
}

// ---------------------------------------------------------------- boyut

/** Uzun kenarı `maxLongEdge`'e sığdırır (orantılı, büyütmez, en az 1 px). */
export function fitWithin(width: number, height: number, maxLongEdge: number): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= maxLongEdge) return { width, height }
  const k = maxLongEdge / long
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

// ---------------------------------------------------------------- JPEG meta veri

const SOI = 0xd8
const SOS = 0xda
const APP1 = 0xe1
const APP13 = 0xed
const COM = 0xfe

/** Meta veri taşıyan bölütler: APP1 (Exif, XMP), APP13 (IPTC/Photoshop), COM (yorum). APP0 (JFIF) ve APP2 (ICC renk profili) kalır. */
const STRIPPED = new Set([APP1, APP13, COM])

function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === SOI
}

/** JPEG başlık bölütlerini (SOS'a kadar) dolaşır; bozuk yapı → null. */
function segments(b: Uint8Array): { marker: number; start: number; end: number }[] | null {
  if (!isJpeg(b)) return null
  const out: { marker: number; start: number; end: number }[] = []
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    if (marker === 0xff) { i++; continue } // dolgu baytı
    if (marker === SOS) return out
    if (marker >= 0xd0 && marker <= 0xd7) { i += 2; continue } // RSTn (başlıkta beklenmez)
    const len = (b[i + 2] << 8) | b[i + 3]
    if (len < 2 || i + 2 + len > b.length) return null
    out.push({ marker, start: i, end: i + 2 + len })
    i += 2 + len
  }
  return null
}

/** Dosyada Exif (APP1 "Exif\0\0") bölütü var mı? (Test ve doğrulama için.) */
export function hasExif(b: Uint8Array): boolean {
  const segs = segments(b)
  if (!segs) return false
  return segs.some((s) => s.marker === APP1 && b[s.start + 4] === 0x45 && b[s.start + 5] === 0x78 && b[s.start + 6] === 0x69 && b[s.start + 7] === 0x66)
}

/** Herhangi bir meta veri bölütü (APP1/APP13/COM) var mı? */
export function hasMetadata(b: Uint8Array): boolean {
  const segs = segments(b)
  return !!segs && segs.some((s) => STRIPPED.has(s.marker))
}

/**
 * APP1/APP13/COM bölütlerini çıkarır; görüntü verisine (SOS sonrası) dokunmaz. JPEG değilse ya da yapı
 * çözülemezse girdiyi aynen döner (yeniden kodlanmış tuval çıktısı zaten meta verisizdir; bu bir güvencedir).
 */
export function stripJpegMetadata(b: Uint8Array): Uint8Array {
  const segs = segments(b)
  if (!segs || !segs.some((s) => STRIPPED.has(s.marker))) return b
  const keep: Uint8Array[] = [b.subarray(0, 2)]
  for (const s of segs) if (!STRIPPED.has(s.marker)) keep.push(b.subarray(s.start, s.end))
  const tailStart = segs.length ? segs[segs.length - 1].end : 2
  keep.push(b.subarray(tailStart))
  const total = keep.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of keep) { out.set(p, o); o += p.length }
  return out
}

// ---------------------------------------------------------------- hazırlama

export interface DecodedImage {
  width: number
  height: number
  /** Kaynak (ImageBitmap) — `encode`'a aynen verilir. */
  source: unknown
  close?: () => void
}

export interface PhotoPrepDeps {
  decode: (file: Blob) => Promise<DecodedImage>
  /** Kaynağı verilen boyuta çizip JPEG olarak kodlar. */
  encode: (img: DecodedImage, width: number, height: number, quality: number) => Promise<Blob>
}

export interface PreparedPhoto {
  file: File
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  /** Kaynakta Exif vardı ve silindi. */
  exifRemoved: boolean
}

async function blobBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer())
}

/** Dosya adı: "kamera-20261001-142530.jpg" (telefonun verdiği "image.jpg" yerine okunur ad; yerel saat). */
export function cameraFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `kamera-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`
}

export async function preparePhoto(
  file: File,
  deps: PhotoPrepDeps = browserDeps(),
  name = cameraFileName(),
  maxBytes: number = PHOTO_PREP.maxBytes,
): Promise<PreparedPhoto> {
  // Kamera bazen türü boş verir (bazı Android sürümleri); boşsa çözümlemeye bırakılır.
  if (file.type && !file.type.startsWith('image/')) throw new PhotoPrepError('not-image')
  if (file.size > PHOTO_PREP.maxInputBytes) throw new PhotoPrepError('too-large-input')
  if (file.size === 0) throw new PhotoPrepError('not-image')

  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer())
  const exifRemoved = hasExif(head)

  let img: DecodedImage
  try {
    img = await deps.decode(file)
  } catch {
    throw new PhotoPrepError('decode-failed')
  }
  try {
    if (!img.width || !img.height) throw new PhotoPrepError('decode-failed')
    if (img.width * img.height > PHOTO_PREP.maxInputPixels) throw new PhotoPrepError('too-many-pixels')

    let size = fitWithin(img.width, img.height, PHOTO_PREP.maxLongEdge)
    for (let shrink = 0; shrink <= 3; shrink++) {
      for (const q of PHOTO_PREP.qualities) {
        let blob: Blob
        try {
          blob = await deps.encode(img, size.width, size.height, q)
        } catch {
          throw new PhotoPrepError('encode-failed')
        }
        if (!blob || !blob.size) throw new PhotoPrepError('encode-failed')
        const bytes = stripJpegMetadata(await blobBytes(blob))
        if (!isJpeg(bytes)) throw new PhotoPrepError('encode-failed')
        if (bytes.length <= maxBytes) {
          return {
            file: new File([bytes as BlobPart], name, { type: PHOTO_PREP.outputType, lastModified: Date.now() }),
            width: size.width,
            height: size.height,
            originalWidth: img.width,
            originalHeight: img.height,
            exifRemoved,
          }
        }
      }
      size = { width: Math.max(1, Math.round(size.width * PHOTO_PREP.shrinkStep)), height: Math.max(1, Math.round(size.height * PHOTO_PREP.shrinkStep)) }
    }
    throw new PhotoPrepError('too-large-output')
  } finally {
    img.close?.()
  }
}

/** Tarayıcı uygulaması: createImageBitmap (EXIF yönü uygulanır) + 2B tuval + toBlob(JPEG). */
export function browserDeps(): PhotoPrepDeps {
  return {
    async decode(file) {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { width: bmp.width, height: bmp.height, source: bmp, close: () => bmp.close() }
    },
    encode(img, width, height, quality) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return Promise.reject(new Error('2d context yok'))
      // Saydam PNG → JPEG'de siyah zemin olmasın: açık tema yüzey rengi = beyaz (pazaryeri görsel önerisi de beyaz zemin).
      ctx.fillStyle = semanticColorsLight.surface
      ctx.fillRect(0, 0, width, height)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img.source as CanvasImageSource, 0, 0, width, height)
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          canvas.width = 0
          canvas.height = 0
          if (b) resolve(b)
          else reject(new Error('toBlob boş'))
        }, PHOTO_PREP.outputType, quality)
      })
    },
  }
}
