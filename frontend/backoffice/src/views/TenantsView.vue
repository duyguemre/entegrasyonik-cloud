<template>
  <div class="bo-page">
    <div class="bo-page__head">
      <div>
        <h1 class="bo-page__title">Müşteriler</h1>
        <p class="bo-page__lede">Mağaza hesapları. İş verisi (ürün, sipariş, müşteri kişisel verisi) burada gösterilmez — gerekirse denetimli geçici erişim kullanılır.</p>
      </div>
    </div>

    <div class="bo-tenants__bar">
      <v-text-field
        v-model="search"
        class="bo-tenants__search"
        label="Mağaza adı ya da numarası"
        prepend-inner-icon="mdi-magnify"
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
          {{ opt.label }} <span class="bo-seg__count ek-num">{{ countOf(opt.value) }}</span>
        </button>
      </div>
    </div>

    <EkSkeleton v-if="loading && !clients.length" type="table" :rows="8" />
    <EkEmptyState v-else-if="error" variant="error" title="Müşteriler yüklenemedi" :message="error" show-action action-text="Tekrar dene" action-icon="mdi-refresh" @action="load" />
    <EkEmptyState v-else-if="!visible.length" variant="no-results" title="Eşleşen müşteri yok" message="Aramayı ya da durum filtresini değiştirin." />
    <EkDataTable v-else :items="visible" :columns="COLUMNS" row-key="clientId" class="bo-tenants__table">
      <template #cell-title="{ item }">
        <RouterLink :to="`/musteriler/${item.clientId}`" class="bo-tenants__name">
          <span>{{ item.title }}</span>
          <span class="bo-tenants__tid ek-num">#{{ item.clientId }}</span>
        </RouterLink>
      </template>
      <template #cell-status="{ item }">
        <EkStatusChip :tone="item.status === 'ACTIVE' ? 'success' : 'neutral'" :label="item.status === 'ACTIVE' ? 'Aktif' : 'Pasif'" dot />
      </template>
      <template #cell-integrations="{ item }">
        <span v-if="item.integrations?.length" class="bo-tenants__channels">
          <EkChannelDot v-for="i in item.integrations" :key="i.integrationCode" :code="i.integrationCode" :name="CHANNEL[i.integrationCode] ?? i.integrationCode" :show-name="false" />
          <span class="bo-muted ek-num">{{ item.integrations.length }}</span>
        </span>
        <span v-else class="bo-muted">Bağlantı yok</span>
      </template>
      <template #cell-lastSuccessfulOrderSync="{ item }">
        <span class="ek-num">{{ item.lastSuccessfulOrderSync ? formatRelative(item.lastSuccessfulOrderSync) : '—' }}</span>
      </template>
    </EkDataTable>
    <p v-if="clients.length" class="bo-muted bo-tenants__foot">{{ visible.length }} / {{ total }} müşteri · kaynak: AdminService/getClients</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { EkChannelDot, EkDataTable, EkEmptyState, EkSkeleton, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { AdminApiError } from '@bo/api/client'
import type { ClientDto } from '@bo/api/contract'
import { CHANNEL } from '@bo/utils/labels'
import { formatRelative } from '@bo/utils/format'

const COLUMNS: EkTableColumn[] = [
  { key: 'title', label: 'Mağaza' },
  { key: 'status', label: 'Durum' },
  { key: 'integrations', label: 'Kanallar' },
  { key: 'lastSuccessfulOrderSync', label: 'Son sipariş eşitleme', align: 'end' },
  { key: 'createdAt', label: 'Kayıt', type: 'date' },
]
const STATUS_OPTIONS = [
  { value: 'all', label: 'Tümü' },
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'PASSIVE', label: 'Pasif' },
] as const

const search = ref('')
const status = ref<(typeof STATUS_OPTIONS)[number]['value']>('all')
const clients = ref<ClientDto[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.call('AdminService/getClients', { search: search.value?.trim() || undefined, limit: 200, sortField: 'order', sortOrder: 1 })
    clients.value = res.clients
    total.value = res.total
  } catch (e) {
    error.value = e instanceof AdminApiError ? e.message : 'Beklenmeyen hata'
  } finally {
    loading.value = false
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
function debouncedLoad() {
  clearTimeout(timer)
  timer = setTimeout(load, 250)
}
onMounted(load)

const visible = computed(() => (status.value === 'all' ? clients.value : clients.value.filter((c) => c.status === status.value)))
const countOf = (value: string) => (value === 'all' ? clients.value.length : clients.value.filter((c) => c.status === value).length)
</script>

<style scoped>
.bo-tenants__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.bo-tenants__search {
  flex: 1 1 280px;
  max-width: 420px;
}

.bo-seg {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}

.bo-seg__opt {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: 32px;
  padding: 0 var(--ek-space-3);
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-muted);
  font: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
}

.bo-seg__opt[aria-checked='true'] {
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  box-shadow: var(--ek-shadow-sm);
}

.bo-seg__opt:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 1px;
}

.bo-seg__count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-tenants__table {
  background: var(--ek-color-surface);
}

.bo-tenants__name {
  display: inline-flex;
  align-items: baseline;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: none;
}

.bo-tenants__name:hover span:first-child {
  color: var(--ek-color-action-emphasis);
  text-decoration: underline;
}

.bo-tenants__name:focus-visible {
  border-radius: var(--ek-radius-sm);
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

.bo-tenants__tid {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-regular);
}

.bo-tenants__channels {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.bo-tenants__foot {
  margin: 0;
  font-size: var(--ek-type-caption-size);
}
</style>
