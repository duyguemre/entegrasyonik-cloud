<!--
  frontend/src/components/layout/ShellSearch.vue

  DS-v2 Aşama 2 — üst barın BİRLEŞİK akıllı araması (eski "Akıllı Arama" alanı +
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
-->
<template>
  <EkSmartSearch
    ref="searchRef"
    v-model="query"
    class="ek-shell-search"
    :groups="groups"
    :loading="showSkeleton"
    :placeholder="placeholder"
    label="Akıllı arama"
    open-on-focus
    :empty-text="emptyText"
    @select="onSelect"
    @dismiss="$emit('dismiss')"
  />
</template>

<script lang="ts" setup>
import { computed, inject, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDebounceFn } from '@vueuse/core'
import EkSmartSearch, { type EkSearchGroup, type EkSearchItem } from '@/components/ds/EkSmartSearch.vue'
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { formatDate, formatMoney, formatNumber } from '@/composables/format'
import { useWorkspaceStore } from '@/stores/workspace'
import { screenKeyForLink } from '@/navigation/screens'
import { useShellMenu } from './useShellMenu'
import { useHelpNavigation } from '@/help/useHelpNavigation'

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

const placeholder = computed(() => `${t('common.smartsearch')} — sipariş no, ürün, müşteri, ekran`)

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

const groups = computed<EkSearchGroup[]>(() => {
  if (!q.value) return recentGroup.value.items.length ? [recentGroup.value] : []
  return [screenGroup.value, ...(q.value.length >= MIN_REMOTE_LENGTH ? [...recordGroups.value, helpGroup.value] : [])]
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
  if (kind === 'screen' || kind === 'recent') eventBus?.emit('openTab', ref)
  else if (kind === 'help') helpNav.openHelp(ref)
  else if (kind === 'order') openWith('orderList', { globalSearch: ref.orderNumber })
  else if (kind === 'product') openWith('productUpdate', { productId: ref._id })
  else if (kind === 'customer') openWith('customerList', { globalSearch: fullName(ref.firstName, ref.lastName) })
  else if (kind === 'claim') openWith('claimList', { filter: { globalSearch: ref.externalClaimId || ref.externalOrderId } })
}

defineExpose({ focus: () => searchRef.value?.focus() })
</script>

<style scoped>
.ek-shell-search {
  max-width: 600px;
}
</style>
