/**
 * frontend/src/composables/useSavedViews.ts
 *
 * C2.4 (F-19) — kişisel kayıtlı filtre görünümleri. Backend YOK; yalnız bu tarayıcıda.
 *
 * Görünüm = { ad, screenKey, params }. `params` YALNIZCA `pickUrlParams` çıktısıdır
 * (ADR-0012 Karar 2 URL parametre politikası): ekranın `screens.ts` `urlParams`
 * kaydında bildirilmiş, izinli alanlar. Serbest metin / PII (ör. `globalSearch`)
 * kayıtta olmadığı için buraya ASLA giremez — ekran tüm filtre nesnesini verse bile.
 *
 * Saklama: localStorage `ek.views.v1.<userId>.<tenantId>` (kullanıcı + mağaza kapsamlı).
 * Anahtarda e-posta/kullanıcı adı YOK (yalnız kimlik). localStorage erişilemezse
 * (gizli mod, engelli site verisi, kota) ya da oturum kimliği yoksa `available=false`
 * olur ve özellik gizlenir; hiçbir hata kullanıcıya/konsola taşmaz.
 * Paylaşım YOK. Ekran başına en fazla `SAVED_VIEWS_LIMIT` görünüm.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import useUser from '@/composables/user'
import { useWorkspaceStore } from '@/stores/workspace'
import { buildScreenPath, parseUrlParams, pickUrlParams, resolveScreenByKey, screenKeyForLink } from '@/navigation/screens'

export const SAVED_VIEWS_VERSION = 1
export const SAVED_VIEWS_LIMIT = 20
export const SAVED_VIEW_NAME_MAX = 40

export interface SavedView {
  id: string
  name: string
  screenKey: string
  params: Record<string, string>
  createdAt: string
}

interface SavedViewsFile {
  v: number
  views: SavedView[]
}

export type SaveResult = 'saved' | 'updated' | 'empty' | 'limit' | 'invalid-name' | 'unavailable'

/** `ek.views.v1.<userId>.<tenantId>` — kimliği olmayan oturumda `undefined` (özellik gizlenir). */
export function savedViewsStorageKey(userId: unknown, tenantId: unknown): string | undefined {
  const user = typeof userId === 'string' || typeof userId === 'number' ? String(userId) : ''
  if (!user) return undefined
  const tenant = tenantId === undefined || tenantId === null || tenantId === '' || tenantId === 0 ? 'default' : String(tenantId)
  return `ek.views.v${SAVED_VIEWS_VERSION}.${user}.${tenant}`
}

/**
 * Ham filtre nesnesinden görünüme girebilecek alanları süzer (yalnız `pickUrlParams`).
 * Kayıtsız ekran → boş nesne (hiçbir şey saklanmaz).
 */
export function sanitizeViewParams(screenKey: string, raw: Record<string, any> | undefined): Record<string, string> {
  const screen = resolveScreenByKey(screenKey)
  if (!screen || !raw) return {}
  const flat: Record<string, any> = {}
  for (const [k, v] of Object.entries(raw)) flat[k] = Array.isArray(v) ? v.join(',') : v
  const picked = pickUrlParams(screen, flat)
  // Çoklu değerler sırasız kümedir: karşılaştırma ve tekrar kaydetme için kanonik sıra.
  for (const def of screen.urlParams ?? []) {
    if (def.multi && picked[def.name]) picked[def.name] = picked[def.name].split(',').filter(Boolean).sort().join(',')
  }
  return picked
}

/** Görünüm parametrelerini ekranın gerçekte okuduğu şekle (çoklu → dizi) açar. */
export function expandViewParams(screenKey: string, params: Record<string, string>): Record<string, any> {
  const screen = resolveScreenByKey(screenKey)
  return screen ? parseUrlParams(screen, params) : {}
}

export function sameViewParams(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k])
}

function readFile(key: string): SavedView[] {
  const raw = window.localStorage.getItem(key)
  if (!raw) return []
  const data = JSON.parse(raw) as SavedViewsFile
  if (!data || data.v !== SAVED_VIEWS_VERSION || !Array.isArray(data.views)) return []
  // Diske elle yazılmış/eski biçimli kayıtlar da aynı süzgeçten geçer (savunma derinliği).
  return data.views
    .filter((v) => v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.screenKey === 'string')
    .map((v) => ({ ...v, name: v.name.slice(0, SAVED_VIEW_NAME_MAX), params: sanitizeViewParams(v.screenKey, v.params) }))
}

function writeFile(key: string, views: SavedView[]) {
  const data: SavedViewsFile = { v: SAVED_VIEWS_VERSION, views }
  window.localStorage.setItem(key, JSON.stringify(data))
}

function storageUsable(): boolean {
  try {
    const probe = '__ek.views.probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

function newId(): string {
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function safeRouter() {
  try {
    return useRouter()
  } catch {
    return undefined
  }
}

function safeWorkspace(): any {
  try {
    return useWorkspaceStore()
  } catch {
    return undefined
  }
}

// Aynı anahtarı okuyan tüm ekran örnekleri (ör. sipariş + iade sekmeleri) tek kopyayı paylaşır.
const cache = ref<Record<string, SavedView[]>>({})

export function useSavedViews(screenKey: string) {
  const { getSessionScope } = useUser()

  const storageKey = computed(() => savedViewsStorageKey(getSessionScope.value.userId, getSessionScope.value.tenantId))
  const hasScreenParams = !!resolveScreenByKey(screenKey)?.urlParams?.length
  const usable = typeof window !== 'undefined' && storageUsable()

  const available = computed(() => usable && hasScreenParams && !!storageKey.value)

  function all(): SavedView[] {
    const key = storageKey.value
    if (!key || !usable) return []
    if (!cache.value[key]) {
      try {
        cache.value[key] = readFile(key)
      } catch {
        cache.value[key] = []
      }
    }
    return cache.value[key]
  }

  function commit(next: SavedView[]): boolean {
    const key = storageKey.value
    if (!key) return false
    try {
      writeFile(key, next)
      cache.value[key] = next
      return true
    } catch {
      return false
    }
  }

  const views = computed(() => (available.value ? all().filter((v) => v.screenKey === screenKey) : []))

  /** Aynı adlı görünüm varsa parametreleri güncellenir (ad benzersiz, büyük/küçük harf duyarsız). */
  function save(name: string, rawParams: Record<string, any>): SaveResult {
    if (!available.value) return 'unavailable'
    const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, SAVED_VIEW_NAME_MAX)
    if (!trimmed) return 'invalid-name'
    const params = sanitizeViewParams(screenKey, rawParams)
    if (Object.keys(params).length === 0) return 'empty'
    const list = all()
    const existing = list.find((v) => v.screenKey === screenKey && v.name.toLocaleLowerCase('tr') === trimmed.toLocaleLowerCase('tr'))
    if (existing) {
      return commit(list.map((v) => (v === existing ? { ...v, name: trimmed, params } : v))) ? 'updated' : 'unavailable'
    }
    if (views.value.length >= SAVED_VIEWS_LIMIT) return 'limit'
    const view: SavedView = { id: newId(), name: trimmed, screenKey, params, createdAt: new Date().toISOString() }
    return commit([...list, view]) ? 'saved' : 'unavailable'
  }

  /** Silinen görünümü döndürür ("Geri al" için); yazılamazsa `undefined`. */
  function remove(id: string): SavedView | undefined {
    const list = all()
    const removed = list.find((v) => v.id === id)
    if (!removed) return undefined
    return commit(list.filter((v) => v.id !== id)) ? removed : undefined
  }

  /** "Geri al": silinen görünümü aynı sıraya geri koyar (sınır/ad çakışması yeniden denetlenmez — az önce oradaydı). */
  function restore(view: SavedView, index?: number): boolean {
    const list = all().filter((v) => v.id !== view.id)
    const at = index === undefined ? list.length : Math.min(index, list.length)
    return commit([...list.slice(0, at), view, ...list.slice(at)])
  }

  // Görünüm uygulanınca ekranın kanonik adresi (ADR-0012 Karar 2) görünüm parametreleriyle `replace`
  // ile yazılır (geçmişe yeni girdi açılmaz — geri tuşu listeyi sessizce eski filtreye döndüremez).
  // Sekmenin kalıcı parametresini (`link.parameters`) rota → sekme yönü (workspace `activateOrOpen`)
  // kendisi günceller; tek kaynak orasıdır. Yalnız bu ekran etkin sekmeyken ve yalnız
  // `pickUrlParams` çıktısı yazılır.
  const router = safeRouter()
  const workspace = safeWorkspace()

  function syncRoute(params: Record<string, string>) {
    const screen = resolveScreenByKey(screenKey)
    const link = workspace?.mySelectedTab?.link
    if (!screen || !router || !link || screenKeyForLink(link) !== screenKey) return
    router.replace({ path: buildScreenPath(screen), query: pickUrlParams(screen, params) }).catch(() => {})
  }

  return { available, views, save, remove, restore, syncRoute, limit: SAVED_VIEWS_LIMIT }
}
