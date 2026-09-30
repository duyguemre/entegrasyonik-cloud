<template>
  <div class="bo-page">
    <BoPageHeader />

    <div class="bo-toolbar">
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
      <div class="bo-seg" role="radiogroup" aria-label="Durum">
        <button
          v-for="opt in STATUS_OPTIONS"
          :key="opt.value"
          type="button"
          role="radio"
          class="bo-seg__opt"
          :aria-checked="status === opt.value"
          @click="status = opt.value"
        >
          {{ opt.label }} <span class="bo-seg__count">{{ countOf(opt.value) }}</span>
        </button>
      </div>
    </div>

    <div v-if="state !== 'ready'" class="bo-tenants__panel">
      <BoPanelState
        :state="state"
        skeleton="table"
        :rows="8"
        :error="error"
        error-text="Müşteri listesi yüklenemedi"
        empty-icon="mdi-storefront-remove-outline"
        :empty-title="search || status !== 'all' ? 'Eşleşen müşteri yok' : 'Henüz müşteri yok'"
        :empty-text="search || status !== 'all' ? 'Aramayı ya da durum filtresini değiştirin.' : 'Kayıt olan mağazalar burada listelenir.'"
        :retrying="loading"
        @retry="load"
      />
    </div>
    <div v-else class="bo-table-wrap" :aria-busy="loading || undefined">
      <table class="bo-table">
        <caption class="ek-sr-only">Müşteriler — {{ visible.length }} kayıt</caption>
        <thead>
          <tr>
            <th scope="col">Mağaza</th>
            <th scope="col">Durum</th>
            <th scope="col" class="bo-hide-sm">Kanallar</th>
            <th scope="col" class="is-num"><span class="bo-hide-sm">Son sipariş eşitleme</span><span class="bo-show-sm">Son eşitleme</span></th>
            <th scope="col" class="is-num bo-hide-sm">Kayıt</th>
          </tr>
        </thead>
        <tbody>
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
              <span v-if="c.integrations?.length" class="bo-tenants__channels" :aria-label="c.integrations.map((i) => CHANNEL[i.integrationCode] ?? i.integrationCode).join(', ')">
                <EkChannelDot v-for="i in c.integrations" :key="i.integrationCode" :code="i.integrationCode" :name="CHANNEL[i.integrationCode] ?? i.integrationCode" :show-name="false" />
                <span class="bo-tenants__channel-names">{{ c.integrations.map((i) => CHANNEL[i.integrationCode] ?? i.integrationCode).join(', ') }}</span>
              </span>
              <span v-else class="bo-muted">Bağlantı yok</span>
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
        </tbody>
      </table>
    </div>
    <p v-if="state === 'ready'" class="bo-table-foot">
      <span><span class="ek-num">{{ visible.length }}</span> / <span class="ek-num">{{ total }}</span> müşteri · kaynak: AdminService/getClients</span>
      <span class="bo-inline-note"><v-icon icon="mdi-alert" aria-hidden="true" />24 saattir eşitleme yoksa uyarı</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { EkChannelDot, EkCopyButton, EkRelativeTime, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatDate } from '@entegrasyonik/ui/format'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoPanelState, { type PanelState } from '@bo/components/shell/BoPanelState.vue'
import { api } from '@bo/api'
import type { ClientDto } from '@bo/api/contract'
import { CHANNEL } from '@bo/utils/labels'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tümü' },
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'PASSIVE', label: 'Pasif' },
] as const

const search = ref('')
const status = ref<(typeof STATUS_OPTIONS)[number]['value']>('all')
const clients = ref<ClientDto[]>([])
const total = ref(0)
const loaded = ref(false)
const loading = ref(false)
const error = ref<unknown>(null)
const router = useRouter()

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api.call('AdminService/getClients', { search: search.value?.trim() || undefined, limit: 200, sortField: 'order', sortOrder: 1 })
    clients.value = res.clients
    total.value = res.total
    loaded.value = true
  } catch (e) {
    error.value = e
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
  timer = setTimeout(load, 250)
}
onMounted(load)

const visible = computed(() => (status.value === 'all' ? clients.value : clients.value.filter((c) => c.status === status.value)))
const state = computed<PanelState>(() => (!loaded.value ? (error.value ? 'error' : 'loading') : error.value ? 'error' : visible.value.length ? 'ready' : 'empty'))
const countOf = (value: string) => (value === 'all' ? clients.value.length : clients.value.filter((c) => c.status === value).length)
</script>

<style scoped>
.bo-tenants__search {
  flex: 1 1 280px;
  max-width: 420px;
}

.bo-tenants__panel {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  padding: var(--ek-space-4);
}

.bo-tenants__name-cell {
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

.bo-tenants__channel-names {
  overflow: hidden;
  margin-left: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-tenants__stale {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-warning-emphasis);
  font-weight: var(--ek-font-weight-medium);
}
</style>
