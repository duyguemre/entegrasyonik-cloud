<!--
  frontend/src/components/layout/ShellSearch.vue

  DS-v2 Aşama 2 — üst barın BİRLEŞİK akıllı araması (eski "Akıllı arama" alanı +
  komut paleti tek yerde; Ctrl+K buraya odaklanır). Sunum `EkSmartSearch`;
  veri kaynakları GERÇEK:
    - Boş sorgu (odakta): "Son açılanlar" — bu oturumda etkinleştirilen sekmeler
      (`workspace.recentLinks`, yalnızca bellekte).
    - Sorgu: "Ekranlar" — menüde erişilebilir ekranlar (istemci filtresi, anında);
      ≥2 karakterde `SmartService/unifiedSearch` → Siparişler / Ürünler /
      Müşteriler / İadeler ve talepler (sunucu en çok 10'ar kayıt döndürür) +
      "Yardım makaleleri" (istemcide, `help/` kaydı; ilk aramada tembel yüklenir).
  Seçim davranışı eski `ApplicationBar.handleSearchSelect` ile AYNI: ilgili liste
  sekmesi açılır, arama değeri sekme PARAMETRESİ olarak geçer (URL'ye YAZILMAZ —
  ADR-0012 Karar 2 PII kuralı; screens.ts urlParams'ta yok).
  FE-R4 A5: sonuç listesi `appearance="refined"` (sakin komut paleti satırı, geniş panel) + satır BAĞLAM MENÜSÜ
  (sağ tık / Shift+F10 / ⋯): türüne göre "aç" (Enter ile aynı iş), ikincil gezinme (ör. iadenin siparişi) ve
  "kopyala" eylemleri. Kopyalama yalnız panoya yazar (log/URL yok); sonuç toast ile bildirilir. Menü açıkken
  sonuçlar açık kalır; Esc menüyü kapatıp odağı aramaya döndürür.
-->
<template>
  <v-tooltip
    :open-on-focus="false"
    :open-on-click="false"
    :disabled="inUse"
    aria-label="Akıllı arama kısayolu: Ctrl+K"
    location="bottom"
    :open-delay="600"
    transition="fade-transition"
  >
    <template #activator="{ props: tip }">
      <EkSmartSearch
        v-bind="tip"
        :id="TOUR_ANCHOR_ID"
        ref="searchRef"
        v-model="query"
        class="ek-shell-search"
        :groups="groups"
        :loading="showSkeleton"
        :placeholder="placeholder"
        label="Akıllı arama"
        aria-keyshortcuts="Control+K"
        open-on-focus
        :empty-text="emptyText"
        appearance="refined"
        item-menu
        :hold-open="ctxOpen"
        :panel-max-width="640"
        @select="onSelect"
        @dismiss="$emit('dismiss')"
        @item-menu="onItemMenu"
        @focusin="inUse = true"
        @focusout="onSearchFocusOut"
      />
      <!-- FE-R4 A5: satır bağlam menüsü (konum = sağ tık / satır noktası; içerik teleport edilir). -->
      <v-menu v-model="ctxOpen" :target="ctxPoint" location="bottom start" :offset="4" :close-on-content-click="false">
        <EkMenuPanel autofocus class="ek-shell-search__menu" :groups="ctxGroups" :title="ctxTitle" label="Sonuç işlemleri"
          @select="onCtxSelect" @close="closeCtx(true)" />
      </v-menu>
    </template>
    <span class="ek-shell-search__tip">Ara <EkKbd :keys="['Ctrl', 'K']" tone="inverse" /></span>
  </v-tooltip>
</template>

<script lang="ts" setup>
import { computed, inject, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDebounceFn } from '@vueuse/core'
import { EkKbd, EkSmartSearch, EkMenuPanel, type EkSearchGroup, type EkSearchItem, type EkMenuGroup, type EkMenuItem } from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { formatDate, formatMoney, formatNumber } from '@entegrasyonik/ui/format'
import { useWorkspaceStore } from '@/stores/workspace'
import { buildScreenPath, resolveScreenByKey, screenKeyForLink } from '@/navigation/screens'
import { FAVORITES_SECTION_ID, useShellMenu } from './useShellMenu'
import { useHelpNavigation } from '@/help/useHelpNavigation'
import { CHAT_ICON, CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import { useOtopilotStore } from '@/chat/otopilotStore'

defineEmits<{ dismiss: [] }>()

const MIN_REMOTE_LENGTH = 2
const SCREEN_LIMIT = 6
const RECENT_LIMIT = 6

const { t, locale } = useI18n({ useScope: 'global' })
const eventBus: any = inject('eventBus')
const restApi = useRestApi()
const workspace = useWorkspaceStore()
const { model, titleOf, menuStore } = useShellMenu()

const searchRef = ref<InstanceType<typeof EkSmartSearch> | null>(null)
const query = ref('')
const remote = ref<{ orders: any[]; products: any[]; customers: any[]; claims: any[] }>({ orders: [], products: [], customers: [], claims: [] })
const remoteLoading = ref(false)
const remoteFailed = ref(false)
let requestSeq = 0

const placeholder = computed(() => 'Ara…')

const norm = (value: unknown) => String(value ?? '').toLocaleLowerCase('tr-TR')
const q = computed(() => query.value.trim())

// --- Kaynak 1: son açılanlar (boş sorgu) ---
const recentGroup = computed<EkSearchGroup>(() => {
  const openCodes = new Set(workspace.tabs.map((tab: any) => tab.link?.code))
  const items = workspace.recentLinks.slice(0, RECENT_LIMIT).map((link: any) => {
    const entry = model.value.entries.find((e) => e.key === screenKeyForLink(link))
    return {
      id: `recent:${link.code}`,
      title: titleOf(link),
      icon: link.icon ?? entry?.icon ?? 'mdi-history',
      tone: 'neutral' as const,
      typeLabel: openCodes.has(link.code) ? 'AÇIK' : undefined,
      meta: entry?.sectionLabel || entry?.parentTitle ? [{ label: 'Bölüm', value: entry?.parentTitle ?? entry?.sectionLabel ?? '' }] : undefined,
      __kind: 'recent',
      __ref: link,
    }
  })
  return { key: 'recent', label: 'Son açılanlar', icon: 'mdi-history', items }
})

// --- Kaynak 1b: favoriler (boş sorgu; FR3 madde 2) — menünün Favoriler bölümüyle AYNI kayıt ve sıra ---
const favoriteGroup = computed<EkSearchGroup>(() => {
  const fav = model.value.sections.find((sec) => sec.id === FAVORITES_SECTION_ID)
  const items = (fav?.items ?? []).map((item) => {
    const entry = model.value.entries.find((e) => e.key === item.key)
    return {
      id: `favorite:${item.key}`,
      title: item.label,
      icon: item.icon ?? 'mdi-star-outline',
      tone: 'neutral' as const,
      meta: entry?.parentTitle || entry?.sectionLabel ? [{ label: 'Bölüm', value: entry?.parentTitle ?? entry?.sectionLabel ?? '' }] : undefined,
      __kind: 'recent',
      __ref: entry?.link,
    }
  }).filter((i) => !!i.__ref)
  return { key: 'favorites', label: t('shell.section.favorites'), icon: 'mdi-star-outline', items }
})

// --- Kaynak 2: ekranlar (menü, istemci filtresi) ---
const screenGroup = computed<EkSearchGroup>(() => {
  const needle = norm(q.value)
  const items = model.value.entries
    .filter((e) => norm(e.title).includes(needle) || norm(e.parentTitle).includes(needle))
    .slice(0, SCREEN_LIMIT)
    .map((e) => ({
      id: `screen:${e.key}`,
      title: e.title,
      icon: e.icon ?? 'mdi-compass-outline',
      tone: 'action' as const,
      meta: e.parentTitle || e.sectionLabel ? [{ label: 'Bölüm', value: e.parentTitle ?? e.sectionLabel ?? '' }] : undefined,
      __kind: 'screen',
      __ref: e.link,
    }))
  return { key: 'screens', label: 'Ekranlar', icon: 'mdi-compass-outline', items }
})

// --- Kaynak 2b: yardım makaleleri (istemci, ≥2 karakter). İçerik ilk aramada tembel yüklenir (ana paketi büyütmez). ---
const HELP_LIMIT = 4
const helpNav = useHelpNavigation()
const helpModule = shallowRef<typeof import('@/help') | null>(null)
const helpGroup = computed<EkSearchGroup>(() => {
  const mod = helpModule.value
  if (!mod || q.value.length < MIN_REMOTE_LENGTH) return { key: 'help', label: 'Yardım', icon: 'mdi-book-open-page-variant-outline', items: [] }
  const items = mod.searchHelpArticles(q.value, String(locale.value), HELP_LIMIT).map((r) => ({
    id: `help:${r.article.id}`,
    title: r.article.title,
    icon: 'mdi-book-open-page-variant-outline',
    tone: 'info' as const,
    typeLabel: 'YARDIM',
    meta: [{ label: 'Konu', value: mod.helpCategory(r.article.category)?.title[mod.normalizeLocale(String(locale.value))] ?? '' }],
    __kind: 'help',
    __ref: r.article.id,
  }))
  return { key: 'help', label: 'Yardım makaleleri', icon: 'mdi-book-open-page-variant-outline', items }
})

// --- Kaynak 3: kayıtlar (SmartService/unifiedSearch) ---
const fullName = (first?: string, last?: string) => [first, last].filter(Boolean).join(' ')
const platformOf = (code?: string) => (code ? { name: code.charAt(0).toLocaleUpperCase('tr-TR') + code.slice(1), code } : undefined)

const recordGroups = computed<EkSearchGroup[]>(() => {
  const r = remote.value
  return [
    {
      key: 'orders',
      label: 'Siparişler',
      icon: 'mdi-cart-outline',
      items: r.orders.map((o: any) => {
        const name = fullName(o.billingAddress?.firstName, o.billingAddress?.lastName)
        const meta = [] as Array<{ label: string; value: string }>
        if (o.dates?.orderDate) meta.push({ label: 'Tarih', value: formatDate(o.dates.orderDate) })
        if (name) meta.push({ label: 'Müşteri', value: name })
        return { id: `order:${o._id}`, title: String(o.orderNumber ?? ''), icon: 'mdi-cart-outline', tone: 'action' as const, platform: platformOf(o.integrationCode), meta, __kind: 'order', __ref: o }
      }),
    },
    {
      key: 'products',
      label: 'Ürünler',
      icon: 'mdi-tag-outline',
      items: r.products.map((p: any) => {
        const meta = [] as Array<{ label: string; value: string }>
        if (p.brand) meta.push({ label: 'Marka', value: String(p.brand) })
        if (p.price != null) meta.push({ label: 'Fiyat', value: formatMoney(p.price) })
        if (p.stock != null) meta.push({ label: 'Stok', value: formatNumber(p.stock) })
        return { id: `product:${p._id}`, title: String(p.title ?? ''), icon: 'mdi-tag-outline', tone: 'success' as const, meta, __kind: 'product', __ref: p }
      }),
    },
    {
      key: 'customers',
      label: 'Müşteriler',
      icon: 'mdi-account-outline',
      items: r.customers.map((c: any) => {
        const meta = [] as Array<{ label: string; value: string }>
        if (c.phone) meta.push({ label: 'Telefon', value: String(c.phone) })
        if (c.email) meta.push({ label: 'E-posta', value: String(c.email) })
        return { id: `customer:${c._id}`, title: fullName(c.firstName, c.lastName) || String(c.email ?? ''), tone: 'info' as const, meta, __kind: 'customer', __ref: c }
      }),
    },
    {
      key: 'claims',
      label: 'İadeler ve talepler',
      icon: 'mdi-undo-variant',
      items: r.claims.map((c: any) => {
        const meta = [] as Array<{ label: string; value: string }>
        const name = fullName(c.customer?.firstName, c.customer?.lastName)
        if (c.externalOrderId && c.externalClaimId) meta.push({ label: 'Sipariş', value: String(c.externalOrderId) })
        if (name) meta.push({ label: 'Müşteri', value: name })
        if (c.type) meta.push({ label: 'Tür', value: String(c.type) })
        return { id: `claim:${c._id}`, title: String(c.externalClaimId || c.externalOrderId || ''), icon: 'mdi-undo-variant', tone: 'warning' as const, platform: platformOf(c.integrationCode), meta, __kind: 'claim', __ref: c }
      }),
    },
  ]
})

// --- Kaynak 0: "Otopilot'a sor: «…»" (ADR-0034 / CHAT_UI_CONTRACT §7.1) — yazılan sorgu için EN ÜSTTE; Enter panelde
// açar ve metni gönderir. Otopilot kapalıysa (DISABLED) ya da sorgu < 2 karakterse gösterilmez.
const otopilot = useOtopilotStore()
const askGroup = computed<EkSearchGroup | null>(() => {
  if (!otopilot.available || q.value.length < MIN_REMOTE_LENGTH) return null
  const t = otopilot.getController().t
  return {
    key: 'otopilot',
    label: t('entry.askGroup'),
    icon: CHAT_ICON,
    items: [{ id: 'otopilot:ask', title: t('entry.ask', { query: q.value.slice(0, 120) }), icon: CHAT_ICON, tone: 'action' as const, __kind: 'ask', __ref: q.value } as EkSearchItem],
  }
})

const groups = computed<EkSearchGroup[]>(() => {
  if (!q.value) return [favoriteGroup.value, recentGroup.value].filter((g) => g.items.length)
  const ask = askGroup.value ? [askGroup.value] : []
  return [...ask, screenGroup.value, ...(q.value.length >= MIN_REMOTE_LENGTH ? [...recordGroups.value, helpGroup.value] : [])]
})

/** İskelet yalnızca GÖSTERİLECEK hiçbir şey yokken (ekran eşleşmesi varsa önce onlar görünür, kayıtlar gelince eklenir). */
const showSkeleton = computed(() => remoteLoading.value && !groups.value.some((g) => g.items.length))

const emptyText = computed(() => {
  if (!q.value) return 'Henüz açılan ekran yok — aramaya yazmaya başlayın.'
  if (remoteFailed.value) return `"${q.value}" için ekran bulunamadı; kayıt araması şu an yapılamadı.`
  if (q.value.length < MIN_REMOTE_LENGTH) return 'Kayıt aramak için en az 2 karakter yazın.'
  return `"${q.value}" için sonuç yok — sipariş no, ürün adı, müşteri veya ekran adı deneyin.`
})

const runRemote = useDebounceFn(async (text: string) => {
  const seq = ++requestSeq
  try {
    const response: any = await restApi.post('SmartService/unifiedSearch', { query: text })
    if (seq !== requestSeq) return
    remote.value = {
      orders: Array.isArray(response?.orders) ? response.orders : [],
      products: Array.isArray(response?.products) ? response.products : [],
      customers: Array.isArray(response?.customers) ? response.customers : [],
      claims: Array.isArray(response?.claims) ? response.claims : [],
    }
    remoteFailed.value = false
  } catch (error) {
    if (seq !== requestSeq) return
    remoteFailed.value = true
    logger.warn('Akıllı arama: kayıt araması başarısız', { error: String(error) })
  } finally {
    if (seq === requestSeq) remoteLoading.value = false
  }
}, 250)

watch(q, (text) => {
  if (text.length >= MIN_REMOTE_LENGTH && !helpModule.value) {
    import('@/help').then((m) => (helpModule.value = m)).catch((error) => logger.warn('Yardım araması yüklenemedi', { error: String(error) }))
  }
  remote.value = { orders: [], products: [], customers: [], claims: [] }
  remoteFailed.value = false
  if (text.length < MIN_REMOTE_LENGTH) {
    requestSeq++
    remoteLoading.value = false
    return
  }
  remoteLoading.value = true
  runRemote(text)
})

function openWith(title: string, parameters: Record<string, unknown>) {
  const link = menuStore.getMenuLinkWithTitle(title)
  if (!link) return
  link.parameters = parameters
  eventBus?.emit('openTab', link)
}

function onSelect(item: EkSearchItem) {
  const { __kind: kind, __ref: ref } = item as EkSearchItem & { __kind: string; __ref: any }
  query.value = ''
  if (kind === 'ask') otopilot.open({ via: 'palette', text: String(ref) })
  else if (kind === 'screen' || kind === 'recent') eventBus?.emit('openTab', ref)
  else if (kind === 'help') helpNav.openHelp(ref)
  else if (kind === 'order') openWith('orderList', { globalSearch: ref.orderNumber })
  else if (kind === 'product') openWith('productUpdate', { productId: ref._id })
  else if (kind === 'customer') openWith('customerList', { globalSearch: fullName(ref.firstName, ref.lastName) })
  else if (kind === 'claim') openWith('claimList', { filter: { globalSearch: ref.externalClaimId || ref.externalOrderId } })
}

// --- FE-R4 A5: sonuç bağlam menüsü ---
type SearchEntry = EkSearchItem & { __kind: string; __ref: any }
const { showToast } = useToast()
const ctxOpen = ref(false)

/**
 * FE-R4-INT: tur/ipucu çapası aramanın KENDİSİNDE (kök `v-tooltip` olduğu için `id` önceden ipucu katmanına düşüyordu →
 * axe `aria-tooltip-name`, tur hedefi görünmez katman). "Ara Ctrl+K" ipucu arama kullanılırken (odak/sonuç paneli/bağlam
 * menüsü) açılmaz — sonuç panelinin başlığını örtüyordu.
 */
const TOUR_ANCHOR_ID = 'tour-homepage-smartsearch'
const inUse = ref(false)
function onSearchFocusOut(e: FocusEvent) {
  const next = e.relatedTarget as Node | null
  if (next && (e.currentTarget as HTMLElement | null)?.contains(next)) return
  inUse.value = ctxOpen.value
}
watch(ctxOpen, (open) => {
  if (!open && !searchRef.value?.$el?.contains?.(document.activeElement)) inUse.value = false
})
const ctxPoint = ref<[number, number]>([0, 0])
const ctxItem = shallowRef<SearchEntry | null>(null)
const ctxTitle = computed(() => ctxItem.value?.title ?? '')

const OPEN_LABEL: Record<string, { label: string; icon: string }> = {
  screen: { label: 'Ekranı aç', icon: 'mdi-arrow-right' },
  recent: { label: 'Ekranı aç', icon: 'mdi-arrow-right' },
  help: { label: 'Makaleyi aç', icon: 'mdi-book-open-page-variant-outline' },
  order: { label: 'Siparişi aç', icon: 'mdi-cart-outline' },
  product: { label: 'Ürünü düzenle', icon: 'mdi-pencil-outline' },
  customer: { label: 'Müşteri listesinde göster', icon: 'mdi-account-outline' },
  claim: { label: 'İadeyi aç', icon: 'mdi-undo-variant' },
  ask: { label: `${CHAT_PRODUCT.name}'a sor`, icon: CHAT_ICON },
}

/** Ekran sonucunun kanonik adresi (yalnız slug; parametre/PII taşımaz). */
function screenUrl(link: any): string {
  const screen = link ? resolveScreenByKey(screenKeyForLink(link)) : undefined
  return screen ? `${window.location.origin}${buildScreenPath(screen)}` : ''
}

const ctxGroups = computed<EkMenuGroup[]>(() => {
  const item = ctxItem.value
  if (!item) return []
  const ref = item.__ref ?? {}
  const open = OPEN_LABEL[item.__kind] ?? { label: 'Aç', icon: 'mdi-arrow-right' }
  const primary: EkMenuItem[] = [{ key: 'open', label: open.label, icon: open.icon, shortcut: 'Enter' }]
  if (item.__kind === 'claim' && ref.externalOrderId) primary.push({ key: 'claimOrder', label: 'İlgili siparişi aç', icon: 'mdi-cart-arrow-right' })
  if (item.__kind === 'order' && fullName(ref.billingAddress?.firstName, ref.billingAddress?.lastName)) {
    primary.push({ key: 'customerOrders', label: 'Müşterinin siparişleri', icon: 'mdi-account-search-outline' })
  }
  const copy: EkMenuItem[] = []
  if (item.__kind === 'order' && ref.orderNumber) copy.push({ key: 'copy:orderNumber', label: 'Sipariş numarasını kopyala', icon: 'mdi-content-copy' })
  if (item.__kind === 'product' && ref.title) copy.push({ key: 'copy:title', label: 'Ürün adını kopyala', icon: 'mdi-content-copy' })
  if (item.__kind === 'customer' && ref.email) copy.push({ key: 'copy:email', label: 'E-postayı kopyala', icon: 'mdi-email-outline' })
  if (item.__kind === 'customer' && ref.phone) copy.push({ key: 'copy:phone', label: 'Telefonu kopyala', icon: 'mdi-phone-outline' })
  if (item.__kind === 'claim' && (ref.externalClaimId || ref.externalOrderId)) copy.push({ key: 'copy:claim', label: 'Talep numarasını kopyala', icon: 'mdi-content-copy' })
  if ((item.__kind === 'screen' || item.__kind === 'recent') && screenUrl(ref)) copy.push({ key: 'copy:link', label: 'Bağlantıyı kopyala', icon: 'mdi-link-variant' })
  return copy.length ? [{ items: primary }, { label: 'Kopyala', items: copy }] : [{ items: primary }]
})

function onItemMenu(item: EkSearchItem, point: { x: number; y: number }) {
  ctxItem.value = item as SearchEntry
  ctxPoint.value = [point.x, point.y]
  ctxOpen.value = true
}

function closeCtx(refocus: boolean) {
  ctxOpen.value = false
  if (refocus) searchRef.value?.focus()
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast({ tone: 'success', message: `${what} panoya kopyalandı.` })
  } catch {
    showToast({ tone: 'warning', message: 'Kopyalanamadı — tarayıcı pano erişimine izin vermedi.' })
  }
}

function onCtxSelect(action: EkMenuItem) {
  const item = ctxItem.value
  ctxOpen.value = false
  if (!item) return
  const ref = item.__ref ?? {}
  if (action.key === 'open') {
    searchRef.value?.blur()
    onSelect(item)
  } else if (action.key === 'claimOrder') {
    query.value = ''
    searchRef.value?.blur()
    openWith('orderList', { globalSearch: ref.externalOrderId })
  } else if (action.key === 'customerOrders') {
    query.value = ''
    searchRef.value?.blur()
    openWith('orderList', { globalSearch: fullName(ref.billingAddress?.firstName, ref.billingAddress?.lastName) })
  } else if (action.key === 'copy:orderNumber') copyText(String(ref.orderNumber), 'Sipariş numarası').then(() => searchRef.value?.focus())
  else if (action.key === 'copy:title') copyText(String(ref.title), 'Ürün adı').then(() => searchRef.value?.focus())
  else if (action.key === 'copy:email') copyText(String(ref.email), 'E-posta').then(() => searchRef.value?.focus())
  else if (action.key === 'copy:phone') copyText(String(ref.phone), 'Telefon').then(() => searchRef.value?.focus())
  else if (action.key === 'copy:claim') copyText(String(ref.externalClaimId || ref.externalOrderId), 'Talep numarası').then(() => searchRef.value?.focus())
  else if (action.key === 'copy:link') copyText(screenUrl(ref), 'Bağlantı').then(() => searchRef.value?.focus())
}

defineExpose({ focus: () => searchRef.value?.focus() })
</script>

<style scoped>
.ek-shell-search {
  max-width: 600px;
}

/* Kısayol görünür rozet değil, tooltip'te (kullanıcı geri bildirimi). */
.ek-shell-search :deep(.ek-search__hint) {
  display: none;
}

.ek-shell-search__menu {
  min-width: 240px;
}
</style>
