/**
 * frontend/src/composables/useUnsavedChanges.ts
 *
 * FE R4 C1 (K61) — kaydedilmemiş değişiklik kaydı (kirli form uyarısı). Bir ekran `useUnsavedChanges(() => isDirty)` ile
 * kaynak kaydeder; `main.ts` `window.onbeforeunload` uygulamayı unmount ETMEDEN önce `hasUnsavedChanges()`'e danışır:
 * değişiklik varsa tarayıcı onayı istenir ve uygulama ayakta kalır (kullanıcı "Kal" derse veri kaybolmaz).
 * Bileşen içi `beforeunload` dinleyicisi yetmez: `onbeforeunload` daha önce kaydedildiği için önce çalışır ve unmount
 * dinleyiciyi kaldırır (fe-r4c.spec.ts ile doğrulandı).
 */
import { onBeforeUnmount } from 'vue'

type DirtySource = () => boolean
const sources = new Set<DirtySource>()

/** Kayıtlı kaynaklardan biri kirli mi? (main.ts ve testler) */
export function hasUnsavedChanges(): boolean {
  for (const s of sources) {
    try {
      if (s()) return true
    } catch {
      /* kaynak hatası uyarıyı engellemez */
    }
  }
  return false
}

/** Kaynağı kaydeder; bileşen kapanınca (ya da dönen işlevle) kaldırılır. */
export function registerUnsavedSource(source: DirtySource): () => void {
  sources.add(source)
  return () => { sources.delete(source) }
}

/** Bileşen içi kullanım: kayıt + unmount'ta otomatik kaldırma. */
export function useUnsavedChanges(source: DirtySource): void {
  const off = registerUnsavedSource(source)
  onBeforeUnmount(off)
}
