/**
 * frontend/src/composables/barcode/barcodeScan.ts
 *
 * MOB-03 — barkodla ürün/sipariş bulma (YALNIZ arama; hiçbir kayıt yazılmaz). Saf mantık: motor seçimi,
 * kamera hatası sınıflandırma, okunan kodun temizlenmesi, art arda okuma uzlaşısı. Kamera akışı
 * `useBarcodeScanner.ts`'te; JS yedek okuyucu `zxingDecoder.ts`'te (yalnız gerektiğinde dinamik yüklenir).
 */

/** Ürün etiketleri ve kargo/sipariş etiketlerinde kullanılan 1B biçimler (+ yerelde varsa QR). */
export const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code'] as const

export type ScanEngine = 'native' | 'js'

export interface DetectorLike {
  detect(source: unknown): Promise<{ rawValue?: string }[]>
}
export interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): DetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

/**
 * Tarayıcının yerel `BarcodeDetector`'ı varsa ve en az bir ürün barkodu biçimini (EAN-13 / Code 128)
 * destekliyorsa onu kullanır; yoksa JS okuyucu. (Chrome/Android ve Safari 17+ macOS'ta yerel; iOS ve
 * masaüstü Linux/Windows'ta çoğunlukla JS.)
 */
export async function pickEngine(win: { BarcodeDetector?: BarcodeDetectorCtor } = window as never): Promise<{ engine: ScanEngine; formats: string[] }> {
  const Ctor = win.BarcodeDetector
  if (typeof Ctor !== 'function') return { engine: 'js', formats: [] }
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? []
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f))
    if (formats.includes('ean_13') || formats.includes('code_128')) return { engine: 'native', formats: [...formats] }
  } catch {
    /* getSupportedFormats reddedildi → JS */
  }
  return { engine: 'js', formats: [] }
}

// ---------------------------------------------------------------- kamera durumu

export type CameraProblem = 'denied' | 'no-camera' | 'unsupported' | 'busy' | 'error'

/** getUserMedia hatası → dürüst durum (ham DOMException metni gösterilmez). */
export function classifyCameraError(err: unknown): CameraProblem {
  const name = (err as { name?: string } | null)?.name ?? ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'no-camera'
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy'
  if (name === 'TypeError' || name === 'NotSupportedError') return 'unsupported'
  return 'error'
}

export const CAMERA_MESSAGES: Record<CameraProblem, { title: string; text: string }> = {
  denied: {
    title: 'Kamera izni verilmedi',
    text: 'Barkodu okumak için tarayıcı ayarlarından bu siteye kamera izni verin ya da kodu aşağıya elle yazın.',
  },
  'no-camera': {
    title: 'Kamera bulunamadı',
    text: 'Bu cihazda kullanılabilir bir kamera yok — kodu aşağıya elle yazın.',
  },
  unsupported: {
    title: 'Bu tarayıcı kamerayı açamıyor',
    text: 'Kamera yalnız güvenli bağlantıda (https) ve güncel tarayıcıda açılır — kodu aşağıya elle yazın.',
  },
  busy: {
    title: 'Kamera başka bir uygulamada açık',
    text: 'Kamerayı kullanan uygulamayı kapatıp yeniden deneyin ya da kodu aşağıya elle yazın.',
  },
  error: {
    title: 'Kamera açılamadı',
    text: 'Yeniden deneyin ya da kodu aşağıya elle yazın.',
  },
}

/** Kamera API'si hiç yoksa (güvensiz bağlam, eski tarayıcı) — izin istemeden bilinir. */
export function cameraApiAvailable(nav: { mediaDevices?: { getUserMedia?: unknown } } = navigator): boolean {
  return typeof nav.mediaDevices?.getUserMedia === 'function'
}

// ---------------------------------------------------------------- kod

export const CODE_MAX_LENGTH = 64

/**
 * Okunan/yazılan kodu aramaya uygun hâle getirir: baş/son boşluk, denetim karakterleri, GS1 ayırıcısı (FNC1 →
 * GS, \u001d) kalkar; boş ya da 64 karakterden uzunsa null. (Arama sunucuda kaçışlı "içerir" eşleşmesidir.)
 */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!s || s.length > CODE_MAX_LENGTH) return null
  return s
}

/**
 * Art arda okuma uzlaşısı: aynı kod `needed` kez üst üste okunursa kabul edilir (JS 1B okuyucunun tek
 * karelik yanlış okumalarına karşı). Okunamayan kare (null) seriyi bozmaz; farklı kod seriyi sıfırlar.
 */
export function createConsensus(needed = 2) {
  let last: string | null = null
  let count = 0
  return {
    push(code: string | null): string | null {
      if (code === null) return null
      if (code === last) count++
      else { last = code; count = 1 }
      return count >= needed ? code : null
    },
    reset() { last = null; count = 0 },
  }
}

// ---------------------------------------------------------------- görüntü

/** RGBA → gri (ITU-R BT.601 tamsayı yaklaşımı). JS okuyucu gri tonlu ışıklılık ister. */
export function rgbaToLuma(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8ClampedArray {
  const n = width * height
  const out = new Uint8ClampedArray(n)
  for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8
  return out
}

/** Kareyi okuyucu için küçült: uzun kenar en çok `max` px (1B barkod için 1280 yeterli; CPU tasarrufu). */
export function scanFrameSize(width: number, height: number, max = 1280): { width: number; height: number } {
  const long = Math.max(width, height)
  if (!long || long <= max) return { width, height }
  const k = max / long
  return { width: Math.round(width * k), height: Math.round(height * k) }
}
