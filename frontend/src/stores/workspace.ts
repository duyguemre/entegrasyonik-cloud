/**
 * frontend/src/stores/workspace.ts
 *
 * ADR-0012 Karar 3 — Çalışma alanı durumu ve persist. `layouts/SecureLayout.vue`
 * (eski satır 152-373) içindeki sekme mantığını TAŞIR (yeniden YAZMAZ — aynı
 * veri modeli, aynı `tabSelectors` gruplama, aynı "5 ağır liste kapatılınca da
 * monte kalır" istisnası). `SecureLayout.vue` bu store'un görünümüdür.
 *
 * Router entegrasyonu (ADR-0012 Karar 2/4): aktif sekme URL'e yansır
 * (yalnızca `navigation/screens.ts`'te KAYITLI ekranlar için — kayıtsız
 * ekranlar eski davranışla, URL'siz çalışmaya devam eder). Döngü koruması TEK
 * mekanizmaya indirgendi: `syncRouteFromSelection` yalnızca hesapladığı hedef
 * MEVCUT URL'den FARKLIYSA yazar (fixed-point kontrolü) + `activateOrOpen`
 * (route -> store yönü) `mySelectedTab` GERÇEKTEN değişmiyorsa hiç atama
 * yapmaz (watcher hiç tetiklenmez). `forceReplace` bayrağı (kapama/route
 * kaynaklı normalize etme -> `replace`; yeni sekme/geçiş -> `push`, ADR Karar
 * 4 tablosu) her çağrıda tam bir kez tüketilir (asılı kalmaz).
 */
import { computed, nextTick, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'
import { useMenuStore } from '@/stores/site/menu'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { registerStoreReset } from '@/stores/resetRegistry'
import useUser from '@/composables/user'
import {
  RESERVED_FIRST_SEGMENTS,
  buildScreenPath,
  parseUrlParams,
  pickUrlParams,
  resolveScreenByKey,
  resolveScreenPath,
  screenKeyForLink,
} from '@/navigation/screens'

const PERSIST_VERSION = 1

/** Kapatılsa da monte kalan ağır listeler (ADR-0012 Bağlam madde 6 — davranış AYNEN korunur). */
const HEAVY_KEEP_MOUNTED_CODES = ['ProductListView', 'ProductDefinitionView', 'OrderListView', 'MessageListView', 'ClaimListView']

interface PersistedTabEntry {
  key: string
  instanceId?: string
  urlParams?: Record<string, string>
}

interface PersistedWorkspace {
  v: number
  tabs: PersistedTabEntry[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** DS-v2 kabuk — akıllı aramanın "Son açılanlar" grubu için en fazla bu kadar bağlantı tutulur (bellekte, oturum içi). */
const RECENT_LIMIT = 8

/** Kapatılamayan (sabit) sekme: panoda başlayan ana sekme. Eski kural `id != 0` idi; oturumdan geri yüklenen bir sekme id 0 alabildiği için bağlantıya bakılır. */
export function isPinnedLink(link: any): boolean {
  return link?.title === 'dashboard' || link?.code === 'DashboardView'
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const menuStore = useMenuStore()
  const snackbarStore = useSnackbarStore()
  // `activeClientId`/`getUsername`: `useContextStore` (composables/context.ts) bir Pinia store'u
  // DEĞİL (bkz. dosya başı, sabit "admin" adı döndüren bir factory) ve gerçek tenant/kullanıcı
  // kimliği taşımıyor; bu yüzden persist anahtarı için mevcut EN GÜVENİLİR kimlikler kullanıldı:
  // `activeClientId` (süper-yönetici mağaza seçiminde dolduruluyor, `composables/user.ts`) ve
  // `getUsername` (oturum açan kullanıcının e-postası). Tek-mağaza kullanıcılarda `activeClientId`
  // dolmayabilir — bu durumda sabit `'default'` tenant anahtarı kullanılır (aynı tarayıcı
  // sekmesinde tek mağaza olduğu için çakışma riski yok, bkz. ADR-0012 Karar 3 "sessionStorage").
  const { activeClientId, getUsername } = useUser()

  const tabs = ref<any[]>([])
  const tabSelectors = ref<any[]>([])
  const mySelectedTab = ref<any>(undefined)
  const mySelectedTabParameters = ref<any>(undefined)
  /** Geriye dönük uyum: eski kodda `SecureLayout.vue:247-253`, artık kullanılmıyor ama parite için tutuluyor. */
  const menuLinkCode = ref<any>(0)
  /**
   * DS-v2 kabuk — en son etkinleştirilen bağlantılar (en yeni önce, `code` tekil). Akıllı aramanın
   * "Son açılanlar" grubu ve üst bardaki çalışma alanı anahtarı (Genel ↔ seçili kayıt) okur.
   * YALNIZCA bellekte tutulur (PII/serbest metin kalıcılaştırılmaz — ADR-0012 Karar 2/3).
   */
  const recentLinks = ref<any[]>([])

  let tabIdCounter = 0
  let router: Router | undefined
  let destroyHook: ((link: any) => void) | undefined
  /** Bir sonraki route senkronu push yerine replace kullansın (kapama/route-kaynaklı normalize etme). */
  let forceReplace = false
  let routeWatchStarted = false
  let stopRouteWatch: (() => void) | undefined
  /** `persist()`'in en son yazdığı anahtar: açık çıkışta kullanıcı bağlamı sıfırlanmış olsa da (persistKey() 'anon'a düşer) doğru anahtar silinebilsin (R9b/H-01). */
  let lastPersistKey: string | undefined

  function attachRouter(r: Router) {
    router = r
  }

  /** `SecureLayout.vue` mount olduğunda `WrapperComponent`'in `destroyTab`'ını kaydeder (eski `wrapperRef.value.destroyTab` çağrısının yerini alır). */
  function setDestroyHook(fn: (link: any) => void) {
    destroyHook = fn
  }

  function persistKey(): string {
    const tenant = String(activeClientId?.value || 'default')
    const user = getUsername?.value || 'anon'
    return `ek.ws.v1:${tenant}:${user}`
  }

  function persist() {
    try {
      const data: PersistedWorkspace = {
        v: PERSIST_VERSION,
        tabs: tabs.value.map((t: any) => {
          const key = screenKeyForLink(t.link)
          const screen = resolveScreenByKey(key)
          const entry: PersistedTabEntry = { key }
          if (screen?.instanceParam) {
            const instanceId = t.link?.parameters?.[screen.instanceParam]
            if (instanceId) entry.instanceId = String(instanceId)
          }
          if (screen) {
            const params = pickUrlParams(screen, t.link?.parameters)
            if (Object.keys(params).length > 0) entry.urlParams = params
          }
          return entry
        }),
      }
      const key = persistKey()
      lastPersistKey = key
      sessionStorage.setItem(key, JSON.stringify(data))
    } catch {
      // sessionStorage kullanılamıyorsa (gizli mod/kota) sessizce yut — sekme durumu yalnızca bellekte kalır.
    }
  }

  function clearPersist() {
    try {
      sessionStorage.removeItem(persistKey())
      // R9b/H-01: `logout()` kullanıcı bağlamını sıfırladıktan SONRA çağrıldığında `persistKey()` 'anon' anahtarını hedefler;
      // gerçekten yazılmış olan (kullanıcıya ait) anahtar da silinir.
      if (lastPersistKey) sessionStorage.removeItem(lastPersistKey)
    } catch {
      // no-op
    }
  }

  function readPersisted(): PersistedTabEntry[] {
    try {
      const raw = sessionStorage.getItem(persistKey())
      if (!raw) return []
      const parsed = JSON.parse(raw) as PersistedWorkspace
      if (!parsed || parsed.v !== PERSIST_VERSION || !Array.isArray(parsed.tabs)) return []
      return parsed.tabs
    } catch {
      return []
    }
  }

  // --- tabSelectors gruplama (SecureLayout.vue eski satır 159-211, DEĞİŞTİRİLMEDEN taşındı) ---

  const addTabSelector = (tab: any, singleton: any = true) => {
    if (singleton == true) {
      const foundTabSelector = tabSelectors.value.find((tabSelector: any) => tabSelector.link?.id == tab.link.id)
      if (!foundTabSelector) tabSelectors.value.push(tab)
    } else {
      const foundTabSelector = tabSelectors.value.find((tabSelector: any) => tabSelector.id == tab.link.id)
      if (foundTabSelector) {
        const foundTab = foundTabSelector.list.find((item: any) => item.id == tab.id)
        if (foundTab) {
          foundTabSelector.selectedTabSelector = foundTab
        } else {
          foundTabSelector.list.unshift(tab)
          foundTabSelector.selectedTabSelector = tab
        }
      } else {
        tabSelectors.value.push({
          id: tab.link.id,
          selectedTabSelector: tab,
          list: [tab],
        })
      }
    }
  }

  const removeById = <T extends { id: number | string }>(arr: T[], id: number | string) => {
    const index = arr.findIndex((item) => item.id === id)
    if (index !== -1) arr.splice(index, 1)
  }

  const removeTabSelector = (tab: any, singleton: any = true) => {
    if (singleton == true) {
      removeById(tabSelectors.value, tab.id)
    } else {
      const foundTabSelector = tabSelectors.value.find((tabSelector: any) => tabSelector.id == tab.link.id)
      if (foundTabSelector) {
        if (foundTabSelector.list.length == 1) {
          removeById(tabSelectors.value, foundTabSelector.id)
        } else {
          removeById(foundTabSelector.list, tab.id)
          foundTabSelector.selectedTabSelector = foundTabSelector.list[0]
          return foundTabSelector.selectedTabSelector
        }
      }
    }
  }

  // --- açma/kapama (SecureLayout.vue eski satır 286-373, DEĞİŞTİRİLMEDEN taşındı + persist) ---

  const openTab = (link: any, name?: any, parameters?: any) => {
    if (name) {
      link = menuStore.getMenuLinkWithTitle(name)
    }
    if (!link) return

    mySelectedTabParameters.value = undefined
    if (link.parameters != undefined) {
      mySelectedTabParameters.value = JSON.parse(JSON.stringify(link.parameters))
    }
    if (parameters) {
      mySelectedTabParameters.value = JSON.parse(JSON.stringify(parameters))
    }

    let tabIndex = tabs.value.findIndex((item: any) => item.link.code === link.code)
    if (tabIndex > -1) {
      mySelectedTab.value = tabs.value[tabIndex]
      addTabSelector(tabs.value[tabIndex], link.singleton)
      persist()
      return
    }
    if (link.singleton == false) {
      menuStore.tabProcessedMenu.push(link)
    }
    let newTab: any = { id: tabIdCounter++, isRendered: true, componentRef: undefined, link }
    link.isRendered = true

    addTabSelector(newTab, link.singleton)
    tabs.value.push(newTab)
    mySelectedTab.value = newTab
    persist()
  }

  const closeTab = async (tab: any) => {
    if (!tab) return

    if (destroyHook) destroyHook(tab.link)
    await nextTick()
    await sleep(10)

    if (!HEAVY_KEEP_MOUNTED_CODES.includes(tab.link.code)) {
      tab.isRendered = false
      tab.link.isRendered = false
    } else {
      tab.link.isInitialized = false
    }

    if (tab.link.singleton == false) {
      const multiViewIndex = menuStore.tabProcessedMenu.findIndex((obj: any) => obj.code == tab.link.code)
      if (multiViewIndex !== -1) {
        menuStore.tabProcessedMenu.splice(multiViewIndex, 1)
      }
    }

    const selectTab = removeTabSelector(tab, tab.link.singleton)

    let index = tabs.value.findIndex((item: any) => item.id === tab.id)
    tabs.value.splice(index, 1)

    forceReplace = true // ADR-0012 Karar 4: kapama -> replace (yeni aktif sekmenin adresi), geçmişe yazılmaz.
    if (selectTab) {
      mySelectedTab.value = selectTab
    } else if (index > 0) {
      mySelectedTab.value = tabs.value[index - 1]
    } else {
      mySelectedTab.value = tabs.value[0]
    }

    persist()
    await nextTick()
    tab.componentRef = null
    return true
  }

  const clearActiveParameters = () => {
    if (mySelectedTab.value?.link) mySelectedTab.value.link.parameters = undefined
  }

  // --- Router entegrasyonu (ADR-0012 Karar 2/4 — "en riskli nokta") ---

  function syncRouteFromSelection() {
    // `forceReplace` HER ÇAĞRIDA tam olarak bir kez tüketilir (erken `return` olsa bile) — aksi
    // halde "asılı" kalıp SONRAKİ ilgisiz bir kullanıcı etkileşiminin (yeni sekme açma = `push`
    // olmalı) yanlışlıkla `replace`'e dönüşmesine yol açar (ADR-0012 "en riskli nokta").
    const replace = forceReplace
    forceReplace = false
    if (!router) return
    const link = mySelectedTab.value?.link
    if (!link) return
    const key = screenKeyForLink(link)
    const screen = resolveScreenByKey(key)
    if (!screen) return // kayıtsız ekran: URL senkronu yok (ADR-0012 Karar 2 — eski davranış korunur).

    const instanceId = screen.instanceParam ? link.parameters?.[screen.instanceParam] : undefined
    const path = buildScreenPath(screen, instanceId)
    const query = pickUrlParams(screen, link.parameters)
    const target = router.resolve({ path, query })
    // Döngü koruması TEK noktadan: hedef zaten mevcut URL'yse hiçbir şey yapılmaz. Route -> store
    // yönünde etkinleştirilen bir sekme (bkz. `activateOrOpen`) `mySelectedTab` DEĞİŞTİYSE bu
    // watcher'ı tetikler ama hesaplanan hedef genelde zaten mevcut URL'dir (fixed point) — TEK
    // istisna: bilinmeyen/izinsiz query anahtarları (`?foo=bar`) temizlenmesi gerektiğinde hedef
    // FARKLI olur ve bilinçli bir `replace` (`activateOrOpen` bu durumda `forceReplace=true` set eder).
    if (target.fullPath === router.currentRoute.value.fullPath) return

    router[replace ? 'replace' : 'push']({ path, query }).catch(() => {})
  }

  watch(mySelectedTab, (newTab) => {
    menuLinkCode.value = undefined
    if (newTab?.link) {
      recentLinks.value = [newTab.link, ...recentLinks.value.filter((l: any) => l.code !== newTab.link.code)].slice(0, RECENT_LIMIT)
    }
    if (newTab && newTab.link) {
      nextTick(() => {
        menuLinkCode.value = newTab.link.code
      })
      if (newTab.link.isRendered !== true) {
        // Tembel geri yükleme (ADR-0012 Karar 3): oturum-geri-yüklemesinden gelen sekme ilk kez
        // etkinleştiriliyor -> şimdi monte edilir (WrapperComponent -> initialize()).
        newTab.link.isRendered = true
      }
    }
    syncRouteFromSelection()
  })

  /** `menuStore` ağacında `screens.ts` anahtarıyla eşleşen menü düğümünü bulur (kod+parent birleşimiyle — `menuStore.getMenuLinkWithCode` yalnızca `code` alanına bakar, bileşik anahtarı ÇÖZEMEZ). */
  function findLinkByScreenKey(key: string): any {
    const menu = menuStore.getMenu()
    if (!Array.isArray(menu)) return undefined // menü hiç yüklenmedi VEYA hata gövdesi döndü (dizi DEĞİL) — bkz. resolveActiveFromRoute.
    const search = (links: any[]): any => {
      for (const l of links || []) {
        if (l && screenKeyForLink(l) === key) return l
        if (l?.children) {
          const found = search(l.children)
          if (found) return found
        }
      }
      return undefined
    }
    for (const group of menu) {
      const found = search(group.links)
      if (found) return found
    }
    return undefined
  }

  /**
   * `resolveActiveFromRoute`'un (route -> store yönü) tab seçimi. Bu her zaman `forceReplace=true`
   * set eder: URL zaten kaynak olduğu için buradan doğacak herhangi bir yazım (ör. bilinmeyen query
   * temizliği) YENİ bir geçmiş girdisi DEĞİL, mevcut girdinin normalize edilmesidir (`replace`).
   * `mySelectedTab` GERÇEKTEN değişmiyorsa (zaten aktif sekme) hiçbir atama yapılmaz — watcher hiç
   * tetiklenmez, `syncRouteFromSelection` çağrılmaz (döngü koruması, ADR-0012 "en riskli nokta").
   */
  function activateOrOpen(link: any, params: Record<string, any>) {
    const existing = tabs.value.find((t: any) => t.link.code === link.code)
    const hasParams = Object.keys(params).length > 0
    if (existing) {
      if (hasParams) existing.link.parameters = { ...params }
      addTabSelector(existing, link.singleton)
      if (mySelectedTab.value !== existing) {
        mySelectedTabParameters.value = hasParams ? JSON.parse(JSON.stringify(params)) : mySelectedTabParameters.value
        forceReplace = true
        mySelectedTab.value = existing
      }
      return
    }
    // ADR-0012 Karar 2 "Parametre sahipliği": diğer çağıranlarla (`ApplicationBar.vue`
    // `handleSearchSelect`, `ProductListView.vue`) AYNI kural — parametre, `openTab`'a geçirilmeden
    // ÖNCE doğrudan menü düğümüne (`link.parameters`) yazılır. `openTab`'ın kendisi (SecureLayout'tan
    // TAŞINDI, DEĞİŞTİRİLMEDİ) yalnızca `mySelectedTabParameters`'ı doldurur; `link.parameters`
    // sekmenin sonraki `activate()` çağrılarında VE `syncRouteFromSelection`'ın URL'i yeniden
    // kurmasında kullanılan KALICI kaynaktır (bkz. `WrapperComponent.vue` `el.activate(tab.link.parameters)`).
    if (hasParams) link.parameters = params
    forceReplace = true
    openTab(link, undefined, hasParams ? params : undefined)
  }

  /**
   * Route -> store yönü (deep-link + tarayıcı geri/ileri). Bilinmeyen/erişimsiz slug için
   * `/dashboard`'a `replace` + bildirim (ADR-0012 Karar 2 "Çözümleme ve güvenlik").
   * Döner: bir ekran gerçekten etkinleştirildiyse `true`.
   */
  function resolveActiveFromRoute(route: RouteLocationNormalizedLoaded | undefined): boolean {
    if (!route) return false
    const raw = route.params.screen
    const segments = Array.isArray(raw) ? raw.filter(Boolean) : raw ? [String(raw)] : []
    if (segments.length === 0) return false

    const resolved = resolveScreenPath(segments)
    if (!resolved) {
      if (!RESERVED_FIRST_SEGMENTS.includes(segments[0])) {
        snackbarStore.addSnackbar({ text: 'Aradığınız ekran bulunamadı, panoya yönlendirildiniz.', color: 'warning' })
        router?.replace('/dashboard').catch(() => {})
      }
      return false
    }

    const link = findLinkByScreenKey(resolved.screen.key)
    if (!link) {
      // Menü GERÇEKTEN yüklendiyse (dizi + en az 1 grup) ve yine de bulunamadıysa -> kullanıcının bu
      // ekrana erişimi yok / geçersiz bağlantı: bildir + panoya dön. Menü hiç yüklenmemiş/boş/hatalıysa
      // (T1b karakterizasyonu — BACKLOG.md "gizli davranış") SESSİZCE vazgeç: yanıltıcı "erişim yok"
      // mesajı gösterilmez, eski sessiz boş-durum davranışı korunur.
      const menu = menuStore.getMenu()
      if (Array.isArray(menu) && menu.length > 0) {
        snackbarStore.addSnackbar({ text: 'Bu ekrana erişiminiz yok ya da bulunamadı.', color: 'warning' })
        router?.replace('/dashboard').catch(() => {})
      }
      return false
    }

    // Yalnızca kayıtta bildirilmiş, izinli parametreler alınır (bilinmeyen query anahtarları YOK
    // SAYILIR); `multi` alanlar ekranın gerçekte okuduğu DİZİ şekline geri açılır.
    const params: Record<string, any> = parseUrlParams(resolved.screen, route.query as Record<string, any>)
    if (resolved.screen.instanceParam && resolved.instanceId) {
      params[resolved.screen.instanceParam] = resolved.instanceId
    }
    activateOrOpen(link, params)
    return true
  }

  /** Oturum içi kalıcılıktan (sessionStorage) tekil (singleton) sekmeleri, MONTE ETMEDEN (tembel), sekme çubuğuna geri ekler. */
  function restoreFromSession() {
    for (const entry of readPersisted()) {
      const link = menuStore.getMenuLinkWithCode(entry.key)
      // Çok örnekli (singleton==false) sekmeler (ör. ürün düzenleme) ekrana özgü klonlama
      // mantığına bağlı olduğundan bu görevde (T4a, kabuk/gezinme altyapısı) geri
      // YÜKLENMEZ — bilinçli sınır, bkz. BACKLOG.md.
      if (!link || link.singleton === false) continue
      if (tabs.value.some((t: any) => t.link.code === link.code)) continue

      if (entry.urlParams && Object.keys(entry.urlParams).length > 0) {
        link.parameters = { ...entry.urlParams }
      }
      link.isRendered = false
      link.isInitialized = false
      const newTab = { id: tabIdCounter++, isRendered: false, componentRef: undefined, link }
      addTabSelector(newTab, link.singleton)
      tabs.value.push(newTab)
    }
  }

  /**
   * `router.currentRoute` değişimini İZLER (tarayıcı geri/ileri + programatik `router.push`/
   * `replace` — kendi yazdığımız değişiklikler dahil, ama `mySelectedTab` zaten aynı sekmeye
   * işaret ediyorsa `activateOrOpen` watcher'ı tetiklemez, döngü oluşmaz). Yalnızca `init()`
   * İLK çözümlemeyi bizzat yaptıktan SONRA başlatılır — aksi halde bu watcher'ın kendisi
   * `init()`'in henüz menü yüklenmeden yaptığı ilk çözümlemeyle çakışır.
   */
  function startRouteWatch() {
    if (routeWatchStarted || !router) return
    routeWatchStarted = true
    stopRouteWatch = watch(
      () => router!.currentRoute.value.fullPath,
      () => resolveActiveFromRoute(router!.currentRoute.value),
    )
  }

  /** `SecureLayout.vue` `onMounted` içinde çağrılır (eski `init()`, ADR-0012 Karar 2: `sleep(10)` yoklaması yerine `await menuStore.init()`). */
  async function init() {
    await menuStore.init()
    restoreFromSession()

    const activatedFromRoute = resolveActiveFromRoute(router?.currentRoute.value)
    if (!activatedFromRoute) {
      // Eski davranış (SecureLayout.vue eski satır 260-271): menü doluysa dashboard sekmesini aç;
      // menü boş/hatalıysa (T1b karakterizasyonu — BACKLOG.md) sessizce hiçbir şey açılmaz.
      for (const link of menuStore.tabProcessedMenu) {
        if (link.title == 'dashboard') {
          openTab(link)
        }
      }
    }
    startRouteWatch()
  }

  // --- DS-v2 kabuk: sekme şeridi eylemleri (klavye kısayolları + sağ tık menüsü) ---

  /** Sekme şeridinin gösterim sırası (açılış sırası; her örnek kendi sekmesidir). */
  const orderedTabs = computed(() => tabs.value)

  function activateTab(tab: any) {
    if (tab && mySelectedTab.value !== tab) mySelectedTab.value = tab
  }

  /** Ctrl+←/→: etkin sekmenin solundaki/sağındaki sekmeye geçer (uçlarda döner). */
  function activateRelative(delta: number) {
    const list = orderedTabs.value
    if (list.length < 2) return
    const index = list.indexOf(mySelectedTab.value)
    activateTab(list[(index + delta + list.length) % list.length])
  }

  /** Alt+1…9: n. sekmeye (0-tabanlı) geçer; yoksa hiçbir şey yapmaz. */
  function activateIndex(index: number) {
    const tab = orderedTabs.value[index]
    if (tab) activateTab(tab)
  }

  async function closeMany(targets: any[]) {
    for (const tab of targets) {
      if (!isPinnedLink(tab.link) && tabs.value.includes(tab)) await closeTab(tab)
    }
  }

  /** "Diğerlerini kapat": verilen sekme ve sabit (pano) sekme dışındakileri kapatır, verilen sekmeyi etkin bırakır. */
  async function closeOthers(tab: any) {
    await closeMany(tabs.value.filter((t: any) => t !== tab))
    activateTab(tab)
  }

  /** "Sağdakileri kapat": verilen sekmenin sağındaki (kapatılabilir) sekmeleri kapatır. */
  async function closeToRight(tab: any) {
    const index = tabs.value.indexOf(tab)
    if (index < 0) return
    const wasActiveRight = tabs.value.indexOf(mySelectedTab.value) > index
    await closeMany(tabs.value.slice(index + 1))
    if (wasActiveRight) activateTab(tab)
  }

  /** "Tümünü kapat": sabit sekme dışındaki her şey. */
  async function closeAll() {
    await closeMany([...tabs.value])
  }

  /**
   * Üst bar çalışma alanı anahtarı — "seçili kayıt" bağlamı: en son etkinleştirilmiş, HÂLÂ AÇIK,
   * çok örnekli (singleton=false: ürün düzenleme gibi tek bir kayda ait) sekme. Yoksa `undefined`.
   */
  const recordTab = computed(() => {
    for (const link of recentLinks.value) {
      if (link.singleton !== false) continue
      const tab = tabs.value.find((t: any) => t.link === link || t.link.code === link.code)
      if (tab) return tab
    }
    return undefined
  })

  /** "Genel" çalışma alanı: en son etkinleştirilmiş tekil (singleton) sekme, yoksa ilk sekme. */
  function activateGeneral() {
    for (const link of recentLinks.value) {
      if (link.singleton === false) continue
      const tab = tabs.value.find((t: any) => t.link.code === link.code)
      if (tab) return activateTab(tab)
    }
    const first = tabs.value.find((t: any) => t.link.singleton !== false)
    if (first) activateTab(first)
  }

  /**
   * R9b / H-01: yalnızca BELLEKTEKİ çalışma alanı sıfırlanır (önceki kullanıcının açık sekmeleri yeni oturuma taşınmasın).
   * `sessionStorage` kalıcılığına DOKUNMAZ (ADR-0012 Karar 3: oturum süresi dolması sekmeleri silmez; açık çıkış
   * `clearPersist()` ile siler). Route izleyici DURDURULUR: yeni oturumda `init()` onu, kalıcı sekmeler geri yüklendikten
   * SONRA yeniden başlatır (aksi halde eski izleyici, `init()`'ten ÖNCE ilk sekmeyi açıp `persist()` ile kalıcı listeyi ezerdi).
   */
  registerStoreReset('workspace', () => {
    tabs.value = []
    tabSelectors.value = []
    mySelectedTab.value = undefined
    mySelectedTabParameters.value = undefined
    menuLinkCode.value = 0
    recentLinks.value = []
    tabIdCounter = 0
    forceReplace = false
    stopRouteWatch?.()
    stopRouteWatch = undefined
    routeWatchStarted = false
  })

  return {
    tabs,
    tabSelectors,
    mySelectedTab,
    mySelectedTabParameters,
    menuLinkCode,
    attachRouter,
    setDestroyHook,
    openTab,
    closeTab,
    clearActiveParameters,
    recentLinks,
    recordTab,
    activateTab,
    activateRelative,
    activateIndex,
    activateGeneral,
    closeOthers,
    closeToRight,
    closeAll,
    resolveActiveFromRoute,
    init,
    clearPersist,
  }
})
