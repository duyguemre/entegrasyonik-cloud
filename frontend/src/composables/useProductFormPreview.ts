/**
 * frontend/src/composables/useProductFormPreview.ts
 *
 * FE R5 B — ürün formu rayındaki ÖNİZLEME kartı için türetilmiş, salt okunur değerler (kapak küçük resmi, kategori yolu).
 * Form modeli DEĞİŞTİRİLMEZ; yalnız görüntü. Kategori yolu `categoriesStore` ağacından (kökten yaprağa adlar) bulunur;
 * tek "ana" kök (`isMain`) kullanıcıya gösterilmez (CategorySelectBoxLevelComponent ile aynı kural).
 */
import { computed, type Ref } from 'vue'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useProductImageUrl } from '@/composables/useProductImageUrl'

export interface CategoryNodeLike {
  _id: string
  title: string
  isMain?: boolean
  children?: CategoryNodeLike[]
}

/** Kök listesinden seçili yaprağa giden yolun adları; bulunamazsa boş dizi. */
export function findCategoryTitlePath(roots: CategoryNodeLike[] | undefined, id: unknown): CategoryNodeLike[] {
  if (!id || !Array.isArray(roots)) return []
  const visible = roots.length === 1 && roots[0].isMain ? roots[0].children ?? [] : roots.filter((r) => !r.isMain)
  const walk = (nodes: CategoryNodeLike[], trail: CategoryNodeLike[]): CategoryNodeLike[] | undefined => {
    for (const n of nodes) {
      const next = [...trail, n]
      if (n._id === id) return next
      const found = n.children?.length ? walk(n.children, next) : undefined
      if (found) return found
    }
    return undefined
  }
  return walk(visible, []) ?? []
}

export function categoryRoots(source: unknown): CategoryNodeLike[] {
  if (Array.isArray(source)) return source as CategoryNodeLike[]
  const value = (source as { value?: unknown } | undefined)?.value
  return Array.isArray(value) ? (value as CategoryNodeLike[]) : []
}

export function useProductFormPreview(form: Ref<any>, productId: () => string | undefined) {
  const categoriesStore = useCategoriesStore()
  const productImageUrl = useProductImageUrl()

  const coverSrc = computed<string | undefined>(() => {
    const first = Array.isArray(form.value?.images) ? form.value.images[0] : undefined
    return first ? productImageUrl(first, productId(), { thumbnail: true }) : undefined
  })

  const categoryPath = computed<string[]>(() =>
    findCategoryTitlePath(categoryRoots(categoriesStore.getCategories?.()), form.value?.category).map((n) => n.title),
  )

  return { coverSrc, categoryPath }
}
