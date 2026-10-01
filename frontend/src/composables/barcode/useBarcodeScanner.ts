/**
 * frontend/src/composables/barcode/useBarcodeScanner.ts
 *
 * MOB-03 — arka kamera akışından barkod okur. Motor: yerel `BarcodeDetector` (varsa) ya da yalnız gerektiğinde
 * dinamik yüklenen JS okuyucu (`zxingDecoder.ts`, ayrı parça). Kamera izni reddedilir/yoksa dürüst durum döner;
 * elle giriş her durumda açıktır (diyalogda). Okunan kod yalnız arama için yayılır — hiçbir şey yazılmaz.
 * Akış durdurulunca (bulundu, kapat, bileşen söküldü) kamera izleri kapatılır (kamera ışığı söner).
 */
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import {
  cameraApiAvailable, classifyCameraError, createConsensus, normalizeCode, pickEngine, rgbaToLuma, scanFrameSize,
  type BarcodeDetectorCtor, type CameraProblem, type DetectorLike, type ScanEngine,
} from './barcodeScan'

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'problem'

/** Kareler arası bekleme (ms): pil/CPU için tam kare hızında değil. */
const SCAN_INTERVAL_MS = 160

export function useBarcodeScanner(onCode: (code: string) => void) {
  const state = ref<ScannerState>('idle')
  const problem = ref<CameraProblem | null>(null)
  const engine = ref<ScanEngine | null>(null)

  const stream = shallowRef<MediaStream | null>(null)
  let video: HTMLVideoElement | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let run = 0
  let native: DetectorLike | null = null
  let decodeLuma: ((l: Uint8ClampedArray, w: number, h: number) => string | null) | null = null
  let canvas: HTMLCanvasElement | null = null
  let consensus = createConsensus(2)

  function fail(p: CameraProblem) {
    stop()
    problem.value = p
    state.value = 'problem'
  }

  async function prepareEngine(): Promise<boolean> {
    if (engine.value) return true
    const picked = await pickEngine()
    if (picked.engine === 'native') {
      const Ctor = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector
      native = new Ctor({ formats: picked.formats })
      consensus = createConsensus(1) // yerel okuyucu sağlama toplamını kendisi doğrular
    } else {
      try {
        decodeLuma = (await import('./zxingDecoder')).decodeLuma
      } catch {
        return false // parça yüklenemedi (çevrimdışı vb.)
      }
      consensus = createConsensus(2)
    }
    engine.value = picked.engine
    return true
  }

  async function readFrame(v: HTMLVideoElement): Promise<string | null> {
    if (native) {
      const found = await native.detect(v)
      return normalizeCode(found[0]?.rawValue)
    }
    if (!decodeLuma || !v.videoWidth) return null
    const { width, height } = scanFrameSize(v.videoWidth, v.videoHeight)
    canvas ??= document.createElement('canvas')
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(v, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    return normalizeCode(decodeLuma(rgbaToLuma(data, width, height), width, height))
  }

  function schedule(id: number) {
    timer = setTimeout(async () => {
      if (id !== run || !video) return
      let code: string | null = null
      try {
        if (video.readyState >= 2) code = consensus.push(await readFrame(video))
      } catch {
        code = null // tek kare hatası taramayı durdurmaz
      }
      if (id !== run) return
      if (code) {
        stop()
        onCode(code)
        return
      }
      schedule(id)
    }, SCAN_INTERVAL_MS)
  }

  async function start(el: HTMLVideoElement) {
    stop()
    const id = ++run
    video = el
    problem.value = null
    state.value = 'starting'
    if (!cameraApiAvailable()) return fail('unsupported')
    if (!(await prepareEngine())) return fail('error')
    if (id !== run) return
    let s: MediaStream
    try {
      s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
    } catch (err) {
      if (id === run) fail(classifyCameraError(err))
      return
    }
    if (id !== run) {
      s.getTracks().forEach((t) => t.stop()) // bu arada kapatıldı
      return
    }
    stream.value = s
    el.muted = true
    el.setAttribute('playsinline', '')
    el.srcObject = s
    try {
      await el.play()
    } catch {
      /* otomatik oynatma reddi: kareler yine de okunabilir (muted + playsinline) */
    }
    if (id !== run) return
    consensus.reset()
    state.value = 'scanning'
    schedule(id)
  }

  function stop() {
    run++
    if (timer) clearTimeout(timer)
    timer = null
    stream.value?.getTracks().forEach((t) => t.stop())
    stream.value = null
    if (video) video.srcObject = null
    if (state.value !== 'problem') state.value = 'idle'
  }

  function reset() {
    stop()
    problem.value = null
    state.value = 'idle'
  }

  onBeforeUnmount(reset)

  return { state, problem, engine, start, stop: reset }
}
