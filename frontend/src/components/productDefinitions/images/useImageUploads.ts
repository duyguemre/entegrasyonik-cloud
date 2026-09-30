/**
 * frontend/src/components/productDefinitions/images/useImageUploads.ts
 *
 * Faz 3 B2 — galeri yükleme kuyruğu: dosya başına AYRI istek (aynı `ImageApi/upload` sözleşmesi; uç nokta tek
 * istekte çok dosyayı zaten kabul ediyor, tek dosyalık istek de geçerli) → kart başına ilerleme, hata ve
 * "Tekrar dene". En çok `concurrency` yükleme aynı anda sürer. Yerel önizleme `URL.createObjectURL` ile
 * (yükleme bitince/kaldırılınca serbest bırakılır).
 */
import { onBeforeUnmount, ref } from 'vue'
import useRestApi from '@/composables/restapi'
import { checkFiles, uploadErrorText, type UploadItem } from './galleryModel'

export interface UploadEntry extends UploadItem {
  file: File
  previewUrl: string
}

export interface UseImageUploadsOptions {
  /** Yüklemenin bağlanacağı ürün formu (`_id`, `tempId`). */
  product: () => { _id?: string; tempId?: string }
  /** Varyant paneli: yüklenen görsel bu varyanta da bağlanır (sözleşmedeki `variantId`). */
  variantId?: () => string | undefined
  /** Her başarılı yüklemede backend'in döndürdüğü ürün görselleri + yüklenen dosya adı. */
  onUploaded: (images: any[] | undefined, fileName: string) => void
  concurrency?: number
}

let seq = 0

export function useImageUploads(opts: UseImageUploadsOptions) {
  const restApi = useRestApi() as any
  const items = ref<UploadEntry[]>([])
  const concurrency = opts.concurrency ?? 3

  const find = (id: string) => items.value.find((x) => x.id === id)

  function release(entry: UploadEntry) {
    try { URL.revokeObjectURL(entry.previewUrl) } catch { /* jsdom / eski tarayıcı */ }
  }

  function remove(id: string) {
    const i = items.value.findIndex((x) => x.id === id)
    if (i === -1) return
    const [entry] = items.value.splice(i, 1)
    release(entry)
  }

  async function start(entry: UploadEntry) {
    entry.status = 'uploading'
    entry.progress = 0
    entry.error = undefined
    const product = opts.product()
    const form: Record<string, unknown> = { productId: product._id, tempProductId: product.tempId }
    const variantId = opts.variantId?.()
    if (variantId !== undefined) form.variantId = variantId
    const data = new FormData()
    data.append('uploadImageForm', JSON.stringify(form))
    data.append('files', entry.file)
    const resp: any = await restApi.postImageUpload(data, (p: number) => {
      const live = find(entry.id)
      if (live) live.progress = Math.min(99, p)
    })
    const live = find(entry.id)
    if (!live) return pump()
    if (!resp || resp instanceof Error || resp.result === false || resp.result === undefined) {
      live.status = 'error'
      live.progress = 0
      live.error = uploadErrorText(resp?.response?.status)
    } else {
      remove(entry.id)
      opts.onUploaded(Array.isArray(resp.result) ? resp.result : undefined, entry.name)
    }
    pump()
  }

  function pump() {
    const running = items.value.filter((x) => x.status === 'uploading').length
    const free = Math.max(0, concurrency - running)
    items.value.filter((x) => x.status === 'queued').slice(0, free).forEach((x) => { void start(x) })
  }

  /** Dosyaları kuyruğa ekler; reddedilenleri (tür/adet) döner. */
  function add(files: readonly File[]) {
    const { accepted, rejected } = checkFiles(files)
    for (const file of accepted) {
      items.value.push({ id: `up-${++seq}`, name: file.name, status: 'queued', progress: 0, file, previewUrl: URL.createObjectURL(file) })
    }
    pump()
    return rejected
  }

  function retry(id: string) {
    const entry = find(id)
    if (!entry || entry.status !== 'error') return
    entry.status = 'queued'
    entry.error = undefined
    pump()
  }

  function retryAll() {
    items.value.filter((x) => x.status === 'error').forEach((x) => { x.status = 'queued'; x.error = undefined })
    pump()
  }

  onBeforeUnmount(() => items.value.forEach(release))

  return { items, add, retry, retryAll, remove }
}
