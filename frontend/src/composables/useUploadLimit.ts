/**
 * frontend/src/composables/useUploadLimit.ts
 *
 * FE-CFG-1 — görsel yükleme bayt tavanı tek kaynaktan: `env.images.uploadMaxBytes` (backend `IMAGE_UPLOAD_MAX_BYTES`,
 * `stores/publicConfig`). Önceden üç bileşende kullanılmayan `maxSize: 2000000` sabiti vardı ve yükleme yolları
 * boyutu HİÇ denetlemiyordu (büyük dosya sunucuda reddedilince kullanıcı nedenini göremiyordu). Artık sınırı aşan
 * dosya seçiminde yükleme başlamaz, hangi dosyanın aştığı ve sınır bildirilir.
 */
import { computed } from 'vue'
import { usePublicConfigStore } from '@/stores/publicConfig'
import { useToast } from '@/composables/useToast'

/** Bayt → "2 MB" / "850 KB" (tr-TR, en çok 1 ondalık; 1 MB = 1.000.000 bayt, mevcut dosya boyutu gösterimiyle aynı). */
export function formatUploadBytes(bytes: number): string {
  const fmt = (n: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(n)
  if (bytes >= 1_000_000) return `${fmt(bytes / 1_000_000)} MB`
  if (bytes >= 1000) return `${fmt(bytes / 1000)} KB`
  return `${bytes} B`
}

/** Tavanı aşan dosyaların adları (sıra korunur). */
export function filesOverLimit(files: ArrayLike<{ name: string; size: number }> | null | undefined, maxBytes: number): string[] {
  if (!files) return []
  return Array.from(files).filter((f) => f.size > maxBytes).map((f) => f.name)
}

export function useUploadLimit() {
  const publicConfig = usePublicConfigStore()
  const { showToast } = useToast()
  const maxBytes = computed(() => publicConfig.uploadMaxBytes)

  /** Seçim yüklenebilir mi? Değilse bildirim gösterir ve `false` döner. */
  function accept(files: ArrayLike<{ name: string; size: number }> | null | undefined): boolean {
    const over = filesOverLimit(files, maxBytes.value)
    if (!over.length) return true
    const names = over.length > 2 ? `${over.slice(0, 2).join(', ')} ve ${over.length - 2} dosya daha` : over.join(', ')
    showToast({
      tone: 'warning',
      title: 'Dosya çok büyük',
      message: `${names} yüklenmedi. Görsel başına en çok ${formatUploadBytes(maxBytes.value)} yüklenebilir.`,
    })
    return false
  }

  return { maxBytes, accept }
}
