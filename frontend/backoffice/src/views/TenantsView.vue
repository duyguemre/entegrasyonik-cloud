<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="updatedAt" :stale="stale">
      <template #actions>
        <CopyViewLink />
        <BoAction kind="refresh" :loading="loading" data-page-refresh @click="load" />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <BoFilterBar :active="activeFilters" label="Müşteri süzgeçleri" @clear="clearFilters">
      <template #search>
        <v-text-field
          v-model="search"
          class="bo-tenants__search"
          label="Mağaza adı ya da numarası"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          clearable
          hide-details
          @update:model-value="debouncedLoad"
        />
      </template>
      <BoSegmented v-model="status" :options="segmentOptions" label="Durum" />
    </BoFilterBar>

    <BoSection id="musteri-listesi" title="Müşteriler" description="Mağaza sağlığı, abonelik ve kanallar; satıra tıklayınca müşteri ayrıntısı açılır" :flush="state === 'ready'">
      <BoPanelState
        v-if="state !== 'ready'"
        :state="state"
        skeleton="table"
        :rows="8"
        :error="error"
        :error-text="sorunluUnknown ? 'Sorun özeti okunamadı — sorunlu müşteri olup olmadığı bilinmiyor' : 'Müşteri listesi yüklenemedi'"
        empty-icon="mdi-storefront-remove-outline"
        :empty-title="filtered ? 'Eşleşen müşteri yok' : 'Henüz müşteri yok'"
        :empty-text="filtered ? (status === 'sorunlu' ? 'Açık sorunu, başarısız işi ya da son 24 saatte hatası olan müşteri yok.' : 'Aramayı ya da durum filtresini değiştirin.') : 'Kayıt olan mağazalar burada listelenir.'"
        :retrying="loading"
        @retry="load"
      />
      <BoTableFrame v-else label="Müşteriler" :aria-busy="loading || undefined">
        <template #head>
          <tr>
              <th scope="col" :aria-sort="ariaSort('magaza')">
                <button type="button" class="bo-tenants__sort" data-sort="magaza" @click="toggleSort('magaza')">Mağaza<v-icon :icon="sortIcon('magaza')" aria-hidden="true" /></button>
              </th>
              <th scope="col">Durum</th>
              <th scope="col" class="bo-hide-sm">Plan ve abonelik</th>
              <th scope="col" class="bo-hide-sm">Kanallar</th>
              <th scope="col" class="is-num" :aria-sort="ariaSort('acikSorun')">
                <button type="button" class="bo-tenants__sort" data-sort="acikSorun" title="Açık sorun grubu sayısı; yaklaşıktır" @click="toggleSort('acikSorun')">Açık sorun <span aria-hidden="true">~</span><span class="ek-sr-only">(yaklaşık)</span><v-icon :icon="sortIcon('acikSorun')" aria-hidden="true" /></button>
              </th>
              <th scope="col" class="is-num" :aria-sort="ariaSort('basarisizIs')">
                <button type="button" class="bo-tenants__sort" data-sort="basarisizIs" @click="toggleSort('basarisizIs')">
                  <span class="bo-hide-sm">Başarısız iş (24 sa)</span><span class="bo-show-sm">Başarısız iş</span><v-icon :icon="sortIcon('basarisizIs')" aria-hidden="true" />
                </button>
              </th>
              <th scope="col" class="is-num bo-hide-sm" :aria-sort="ariaSort('sonHata')">
                <button type="button" class="bo-tenants__sort" data-sort="sonHata" @click="toggleSort('sonHata')">Son hata<v-icon :icon="sortIcon('sonHata')" aria-hidden="true" /></button>
              </th>
              <th scope="col" class="is-num" :aria-sort="ariaSort('sonEsitleme')">
                <button type="button" class="bo-tenants__sort" data-sort="sonEsitleme" @click="toggleSort('sonEsitleme')">
                  <span class="bo-hide-sm">Son sipariş eşitleme</span><span class="bo-show-sm">Son eşitleme</span><v-icon :icon="sortIcon('sonEsitleme')" aria-hidden="true" />
                </button>
              </th>
              <th scope="col" class="is-num bo-hide-sm" :aria-sort="ariaSort('kayit')">
                <button type="button" class="bo-tenants__sort" data-sort="kayit" @click="toggleSort('kayit')">Kayıt<v-icon :icon="sortIcon('kayit')" aria-hidden="true" /></button>
              </th>
          </tr>
        </template>
          <!-- Satırın tamamı tıklanır (fare); klavye erişimi satırdaki birincil bağlantıyla (tek sekme durağı). -->
          <tr v-for="c in visible" :key="c.clientId" class="is-link" @click="open(c.clientId, $event)">
            <th scope="row">
              <span class="bo-tenants__name-cell">
                <RouterLink :to="`/musteriler/${c.clientId}`" class="bo-tenants__name">{{ c.title }}</RouterLink>
                <span class="bo-tenants__tid"><span class="ek-num">#{{ c.clientId }}</span><EkCopyButton :value="c.clientId" label="Mağaza numarası" /></span>
              </span>
            </th>
            <td><EkStatusChip :tone="c.status === 'ACTIVE' ? 'success' : 'neutral'" :label="c.status === 'ACTIVE' ? 'Aktif' : 'Pasif'" dot /></td>
            <td class="bo-hide-sm">
              <template v-if="opsOf(c.clientId)?.subscriptionStatus">
                <span class="bo-tenants__plan">{{ planLabel(opsOf(c.clientId)!.planCode) }}</span>
                <EkStatusChip :tone="SUB_STATUS[opsOf(c.clientId)!.subscriptionStatus!].tone" :label="SUB_STATUS[opsOf(c.clientId)!.subscriptionStatus!].label" dot />
              </template>
              <span v-else-if="unread('subscriptions', c.clientId)" class="bo-muted">okunamadı</span>
              <span v-else class="bo-muted">Abonelik yok</span>
            </td>
            <td class="bo-hide-sm">
              <!-- Rolsüz span'e aria-label verilmez: her rozet kendi adını ekran okuyucuya söyler. -->
              <span v-if="c.integrations?.length" class="bo-tenants__channels">
                <EkChannelDot v-for="i in c.integrations" :key="i.integrationCode" :code="i.integrationCode" :name="CHANNEL[i.integrationCode] ?? i.integrationCode" :show-name="false" />
                
              </span>
              <span v-else class="bo-muted">Bağlantı yok</span>
            </td>
            <td class="is-num" data-col="open-issues">
              <span v-if="unread('openIssues', c.clientId)" class="bo-muted">okunamadı</span>
              <span v-else-if="opsOf(c.clientId)" :title="'Yaklaşık: kova eşleşmesiyle sayılır'" :class="{ 'bo-tenants__hot': opsOf(c.clientId)!.openIssues > 0 }">~<span class="ek-num">{{ opsOf(c.clientId)!.openIssues }}</span></span>
            </td>
            <td class="is-num" data-col="failed-jobs">
              <span v-if="unread('failedJobs', c.clientId, true)" class="bo-muted" :title="'Kuyruk okunamadı; yalnız ölü mektup sayısı gösteriliyor'">en az <span class="ek-num">{{ opsOf(c.clientId)?.failedJobs24h ?? 0 }}</span></span>
              <span v-else-if="opsOf(c.clientId)" :class="{ 'bo-tenants__hot': opsOf(c.clientId)!.failedJobs24h > 0 }"><span class="ek-num">{{ opsOf(c.clientId)!.failedJobs24h }}</span></span>
            </td>
            <td class="is-num bo-hide-sm">
              <span v-if="unread('lastErrorAt', c.clientId)" class="bo-muted">okunamadı</span>
              <EkRelativeTime v-else-if="opsOf(c.clientId)?.lastErrorAt" :value="opsOf(c.clientId)!.lastErrorAt!" />
              <span v-else class="bo-muted">—</span>
            </td>
            <td class="is-num">
              <span v-if="c.lastSuccessfulOrderSync" :class="{ 'bo-tenants__stale': isStale(c.lastSuccessfulOrderSync) }">
                <v-icon v-if="isStale(c.lastSuccessfulOrderSync)" icon="mdi-alert" size="14" aria-hidden="true" />
                <EkRelativeTime :value="c.lastSuccessfulOrderSync" />
              </span>
              <span v-else class="bo-muted">—</span>
            </td>
            <td class="is-num is-muted bo-hide-sm">{{ formatDate(c.createdAt) }}</td>
          </tr>
      </BoTableFrame>
      <template v-if="state === 'ready'" #footer>
        <BoPagination :count="visible.length" :total="total" :has-more="false" source="AdminService/getClients + BackofficeTenantService/listTenants" />
        <p class="bo-inline-note bo-tenants__note"><v-icon icon="mdi-alert" aria-hidden="true" />24 saattir eşitleme yoksa uyarı · açık sorun sayısı yaklaşıktır (~)</p>
      </template>
    </BoSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkChannelDot, EkCopyButton, EkRelativeTime, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatDate } from '@entegrasyonik/ui/format'
import CopyViewLink from '@bo/components/CopyViewLink.vue'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoFilterBar from '@bo/components/r2/BoFilterBar.vue'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoSegmented from '@bo/components/r2/BoSegmented.vue'
import BoTableFrame from '@bo/components/r2/BoTableFrame.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import BoPanelState, { type PanelState } from '@bo/components/shell/BoPanelState.vue'
import { api } from '@bo/api'
import type { ClientDto, GetClientsRequest } from '@bo/api/contract'
import type { ListTenantsRequest, TenantOps, TenantOpsRow, TenantOpsSection, TenantSortBy } from '@bo/api/contracts/ops'
import { CHANNEL, SUB_STATUS, planLabel } from '@bo/utils/labels'
import { SEGMENT_SLUG, SLUG_SEGMENT, inSegment, tenantsVerdict, type TenantSegment } from './tenantsVerdict'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tümü' },
  { value: 'sorunlu', label: 'Sorunlu müşteriler' },
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'PASSIVE', label: 'Pasif' },
  { value: 'stale', label: 'Eşitleme eski' },
  { value: 'nochannel', label: 'Kanalsız' },
] as const satisfies ReadonlyArray<{ value: TenantSegment; label: string }>

/** `?sira=` anahtarı → `getClients` sortField (kanal bilgisi ve kayıt tarihi bu uçtan). */
const SORT_FIELD = { magaza: 'title', sonEsitleme: 'lastSuccessfulOrderSync', kayit: 'createdAt' } as const
/** `?sira=` anahtarı → BE-01 `listTenants` sortBy (operasyon sütunları sunucuda sıralanır). */
const OPS_SORT: Record<string, TenantSortBy> = { acikSorun: 'openIssues', basarisizIs: 'failedJobs24h', sonHata: 'lastErrorAt' }
type SortKey = keyof typeof SORT_FIELD | keyof typeof OPS_SORT
/** Tarih/sayı sütunlarında ilk tıklama "en çok / en yeni önce", mağazada A→Z. */
const FIRST_DIR: Record<SortKey, 1 | -1> = { magaza: 1, sonEsitleme: -1, kayit: -1, acikSorun: -1, basarisizIs: -1, sonHata: -1 }

const route = useRoute()
const router = useRouter()

function setQuery(patch: Record<string, string | undefined>) {
  router.replace({ query: { ...route.query, ...patch } })
}

// --- URL durumu: ?q= ?durum= ?sira=
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
// Genel bakış (getAttention) `?hasIssues=1` ile gelir → "Sorunlu müşteriler" segmenti (BO_UI_PATTERNS §11.6).
const status = computed<TenantSegment>({
  get: () => SLUG_SEGMENT[String(route.query.durum ?? '')] ?? (route.query.hasIssues === '1' || route.query.hasIssues === 'true' ? 'sorunlu' : 'all'),
  set: (v) => setQuery({ durum: SEGMENT_SLUG[v], hasIssues: undefined }),
})
const sort = computed<{ key: SortKey; dir: 1 | -1 } | null>(() => {
  const raw = typeof route.query.sira === 'string' ? route.query.sira : ''
  const dir = raw.startsWith('-') ? -1 : 1
  const key = raw.replace(/^-/, '') as SortKey
  return key in SORT_FIELD || key in OPS_SORT ? { key, dir } : null
})
function toggleSort(key: SortKey) {
  const cur = sort.value
  const dir = cur?.key === key ? ((cur.dir * -1) as 1 | -1) : FIRST_DIR[key]
  setQuery({ sira: `${dir === -1 ? '-' : ''}${key}` })
}
const ariaSort = (key: SortKey) => (sort.value?.key === key ? (sort.value.dir === 1 ? 'ascending' : 'descending') : 'none')
const sortIcon = (key: SortKey) => (sort.value?.key === key ? (sort.value.dir === 1 ? 'mdi-arrow-up' : 'mdi-arrow-down') : 'mdi-unfold-more-horizontal')

// --- Veri: süzgeçsiz tam liste (hüküm + sayaçlar) ve aramalıysa sunucu aramalı liste
const all = ref<ClientDto[] | null>(null)
const found = ref<ClientDto[] | null>(null)
const total = ref(0)
// BE-01: satır başına operasyon özeti. `opsAll` süzgeçsiz tam liste (sayaç + hüküm), `opsOrder` sorunlu segment / operasyon
// sıralaması için sunucunun verdiği sıra (aynıysa null).
const opsAll = ref<TenantOpsRow[] | null>(null)
const opsDegraded = ref<TenantOpsSection[]>([])
const opsOrder = ref<number[] | null>(null)
const opsFailed = ref(false)
const loading = ref(false)
const error = ref<unknown>(null)
const stale = ref(false)
const updatedAt = ref<number | undefined>()

function request(searchText?: string): GetClientsRequest {
  const s = sort.value
  const field = s && s.key in SORT_FIELD ? SORT_FIELD[s.key as keyof typeof SORT_FIELD] : 'order'
  return { search: searchText || undefined, limit: 200, sortField: field, sortOrder: s && s.key in SORT_FIELD ? s.dir : 1 }
}
/** Sunucu sırası gereken istek: sorunlu segment (hasIssues + varsayılan açık sorun sırası) ya da operasyon sütunu sıralaması. */
function orderedOpsRequest(): ListTenantsRequest | null {
  const s = sort.value
  const sorunlu = status.value === 'sorunlu'
  const opsKey = s ? OPS_SORT[s.key] : undefined
  if (!sorunlu && !opsKey) return null
  return { limit: 200, ...(sorunlu ? { hasIssues: true } : {}), sortBy: opsKey ?? 'openIssues', sortDir: s && opsKey ? (s.dir === 1 ? 'asc' : 'desc') : 'desc' }
}

async function load() {
  loading.value = true
  error.value = null
  const q = search.value?.trim() ?? ''
  try {
    const orderedReq = orderedOpsRequest()
    const [full, hit, ops, ordered] = await Promise.all([
      api.call('AdminService/getClients', request()),
      q ? api.call('AdminService/getClients', request(q)) : Promise.resolve(null),
      api.call('BackofficeTenantService/listTenants', { limit: 200 }).catch(() => null),
      orderedReq ? api.call('BackofficeTenantService/listTenants', orderedReq).catch(() => null) : Promise.resolve(null),
    ])
    // Operasyon özeti okunamazsa liste yine çizilir; sütunlar "okunamadı" der, hüküm "sağlıklı" demez.
    opsFailed.value = ops === null || (!!orderedReq && ordered === null)
    opsAll.value = ops ? ops.items : null
    opsDegraded.value = ops?.opsDegraded ?? []
    opsOrder.value = ordered ? ordered.items.map((r) => r.tid) : null
    all.value = full.clients
    total.value = full.total
    found.value = hit ? hit.clients : null
    stale.value = false
    updatedAt.value = Date.now()
  } catch (e) {
    error.value = e
    stale.value = all.value !== null
  } finally {
    loading.value = false
  }
}

function open(tid: number, e: MouseEvent) {
  // Bağlantı ya da kopyala düğmesi kendi işini yapar; metin seçimi satırı açmaz.
  if ((e.target as HTMLElement).closest('a, button') || window.getSelection()?.toString()) return
  router.push(`/musteriler/${tid}`)
}

const STALE_MS = 24 * 3_600_000
const isStale = (iso: string) => Date.now() - Date.parse(iso) > STALE_MS
let timer: ReturnType<typeof setTimeout> | undefined
function debouncedLoad() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    setQuery({ q: search.value?.trim() || undefined })
  }, 250)
}
onMounted(load)
onBeforeUnmount(() => clearTimeout(timer))
// URL (arama ya da sıra) değişince — başka sekmeden paylaşılan bağlantı, geri/ileri — yeniden oku.
watch(
  () => [route.query.q, route.query.sira, status.value === 'sorunlu'],
  () => {
    const q = typeof route.query.q === 'string' ? route.query.q : ''
    if (q !== (search.value ?? '')) search.value = q
    void load()
  },
)

const clients = computed(() => (search.value?.trim() && found.value ? found.value : (all.value ?? [])))
const opsMap = computed(() => new Map((opsAll.value ?? []).map((r) => [r.tid, r.ops] as const)))
const opsOf = (tid: number): TenantOps | undefined => opsMap.value.get(tid)
/** Bölüm okunamadıysa (ya da tüm ops okunamadıysa) hücre "okunamadı" der; `partial`: DLQ gibi kısmi sayı varken "en az". */
function unread(section: TenantOpsSection, tid: number, partial = false) {
  if (partial) return opsDegraded.value.includes(section) && !!opsOf(tid)
  return opsFailed.value || opsDegraded.value.includes(section) || !opsOf(tid)
}
const visible = computed(() => {
  const list = clients.value.filter((c) => inSegment(c, status.value, Date.now(), opsOf) && (status.value !== 'sorunlu' || !opsOrder.value || opsOrder.value.includes(c.clientId)))
  const order = opsOrder.value
  if (!order) return list
  const at = new Map(order.map((tid, i) => [tid, i] as const))
  return [...list].sort((a, b) => (at.get(a.clientId) ?? 1e9) - (at.get(b.clientId) ?? 1e9))
})
const segmentOptions = computed(() => STATUS_OPTIONS.map((o) => ({ value: o.value as TenantSegment, label: o.label, count: countOf(o.value) })))
const activeFilters = computed(() => (search.value?.trim() ? 1 : 0) + (status.value !== 'all' ? 1 : 0))
function clearFilters() {
  search.value = ''
  setQuery({ q: undefined, durum: undefined, hasIssues: undefined })
}
const filtered = computed(() => !!search.value?.trim() || status.value !== 'all')
const loaded = computed(() => all.value !== null)
// Sorunlu segmentte operasyon özeti okunamadıysa boş liste "sorun yok" demek olur — hata göster.
const sorunluUnknown = computed(() => status.value === 'sorunlu' && opsFailed.value)
const state = computed<PanelState>(() => (!loaded.value ? (error.value ? 'error' : 'loading') : sorunluUnknown.value ? 'error' : visible.value.length ? 'ready' : 'empty'))
const countOf = (value: TenantSegment) => (value === 'sorunlu' && (opsFailed.value || !opsAll.value) ? '?' : (all.value ?? []).filter((c) => inSegment(c, value, Date.now(), opsOf)).length)

const verdict = computed(() =>
  loaded.value || error.value
    ? tenantsVerdict({
        clients: all.value,
        total: total.value,
        failed: !!error.value && !loaded.value,
        stale: stale.value,
        retry: load,
        ops: opsAll.value,
        opsDegraded: opsDegraded.value,
        opsFailed: opsFailed.value,
        segmentTo: (seg) => ({ query: { ...route.query, durum: SEGMENT_SLUG[seg] } }),
      })
    : null,
)
</script>

<style scoped>
.bo-tenants__search {
  flex: 1 1 280px;
  max-width: 420px;
}

.bo-tenants__note {
  margin: var(--ek-space-2) 0 0;
  font-size: var(--ek-type-caption-size);
}

.bo-tenants__sort {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}

.bo-tenants__sort .v-icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

th[aria-sort='ascending'] .bo-tenants__sort .v-icon,
th[aria-sort='descending'] .bo-tenants__sort .v-icon {
  color: var(--ek-color-action-emphasis);
}

.bo-tenants__sort:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-tenants__name-cell {
  min-width: 200px;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 var(--ek-space-2);
}

.bo-tenants__name {
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
  text-decoration: none;
}

tr:hover .bo-tenants__name {
  color: var(--ek-color-action-emphasis);
}

.bo-tenants__name:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-tenants__tid {
  display: inline-flex;
  align-items: center;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-tenants__channels {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  max-width: 280px;
}

.bo-tenants__plan {
  margin-right: var(--ek-space-2);
  color: var(--ek-color-content-default);
}

.bo-tenants__hot {
  color: var(--ek-color-warning-emphasis);
  font-weight: var(--ek-font-weight-medium);
}

.bo-tenants__stale {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-warning-emphasis);
  font-weight: var(--ek-font-weight-medium);
}
</style>
