<template>
  <section class="bo-panel" aria-labelledby="bo-mongo-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-mongo-title" class="bo-panel__title">MongoDB</h2>
        <p class="bo-panel__hint">Sunucu sayaçları ve izinli veritabanlarının boyutu. Belge içeriği okunmaz.</p>
      </div>
      <EkRefreshButton :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
    </header>

    <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="3" degraded-title="MongoDB okunamıyor" @retry="res.load()">
      <div v-if="res.data.value" class="bo-stack">
        <EkAlert v-if="!d.server" tone="info" title="Sunucu sayaçları için yetki yok" text="Uygulama kullanıcısı serverStatus okuyamıyor; bağlantı, işlem sayacı ve önbellek bilgisi gösterilemiyor. Veritabanı boyutları aşağıda yine de listelenir." />
        <template v-else>
          <div class="bo-mongo__kpis">
            <EkMetricCard label="Sürüm" :value="d.server.version" :description="`Çalışma süresi ${formatUptime(d.server.uptimeSeconds)}`" icon="mdi-server" tone="info" />
            <EkMetricCard label="Bağlantılar" :value="formatCount(d.server.connections.current)" :description="`${formatCount(d.server.connections.available)} boşta · toplam açılan ${formatCount(d.server.connections.totalCreated)}`" icon="mdi-lan-connect" tone="neutral" />
            <EkMetricCard label="WiredTiger önbelleği" :value="formatPercent(d.server.cache.fillRatio, 0)" :description="`${formatBytes(d.server.cache.usedBytes)} / ${formatBytes(d.server.cache.maxBytes)}`" icon="mdi-memory" :tone="fill >= 0.95 ? 'warning' : 'success'" />
            <EkMetricCard label="Havuzlar" :value="`${d.pools.appPoolSize} + ${d.pools.openTenantHandles}`" description="uygulama havuzu + açık müşteri bağlantısı" icon="mdi-water-outline" tone="neutral" />
          </div>
          <div class="bo-grid-2">
            <EkCard title="İşlem sayaçları" subtitle="Sunucu başlangıcından beri" icon="mdi-counter">
              <MeterList label="İşlem sayaçları" :rows="opRows" />
            </EkCard>
            <EkCard title="WiredTiger önbelleği" icon="mdi-memory">
              <MeterList label="Önbellek doluluk oranı" :max="1" :rows="[{ key: 'fill', label: 'Dolu', value: fill, display: formatPercent(d.server.cache.fillRatio, 0), tone: fill >= 0.95 ? 'warning' : 'success' }]" />
              <dl class="bo-kv bo-mongo__kv">
                <div><dt>Kullanılan</dt><dd>{{ formatBytes(d.server.cache.usedBytes) }}</dd></div>
                <div><dt>Üst sınır</dt><dd>{{ formatBytes(d.server.cache.maxBytes) }}</dd></div>
                <div><dt>Yazılmamış (dirty)</dt><dd>{{ formatBytes(d.server.cache.dirtyBytes) }}</dd></div>
              </dl>
            </EkCard>
          </div>
        </template>

        <EkCard title="Veritabanları" subtitle="Koleksiyonları görmek için bir satır seçin" icon="mdi-database-outline" flush>
          <EkDataTable :items="dbRows" :columns="DB_COLUMNS" row-key="key">
            <template #cell-label="{ item }">
              <button v-if="item.available" type="button" class="bo-link-btn bo-mongo__pick" :aria-pressed="selectedKey === item.key" :data-db="item.key" @click="pick(item as unknown as DbRow)">{{ item.label }}</button>
              <span v-else class="bo-cell-stack"><span>{{ item.label }}</span><EkStatusChip tone="warning" label="Okunamadı" title="Bu veritabanının istatistiği alınamadı" /></span>
            </template>
            <template #cell-collections="{ item }"><span class="ek-num">{{ item.available ? formatCount(item.collections as number) : '—' }}</span></template>
            <template #cell-objects="{ item }"><span class="ek-num">{{ item.available ? formatCount(item.objects as number) : '—' }}</span></template>
            <template #cell-dataSize="{ item }"><span class="ek-num">{{ item.available ? formatBytes(item.dataSize as number) : '—' }}</span></template>
            <template #cell-storageSize="{ item }"><span class="ek-num">{{ item.available ? formatBytes(item.storageSize as number) : '—' }}</span></template>
            <template #cell-indexes="{ item }"><span class="ek-num">{{ item.available ? `${formatCount(item.indexes as number)} · ${formatBytes(item.indexSize as number)}` : '—' }}</span></template>
          </EkDataTable>
          <p v-if="d.skippedNotAllowlisted > 0" class="bo-mongo__skipped" data-testid="skipped">
            <v-icon icon="mdi-shield-lock-outline" size="small" aria-hidden="true" />
            {{ d.skippedNotAllowlisted }} veritabanı izinli listede olmadığı için okunmadı ve adı gösterilmez. Bu bilinçli bir güvenlik kısıtıdır.
          </p>
        </EkCard>

        <MongoCollections v-if="selected" :key="selectedKey ?? ''" :db="selected.db" :title="selected.label" @close="selectedKey = null" />
      </div>
    </StateBlock>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { EkAlert, EkCard, EkDataTable, EkMetricCard, EkRefreshButton, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { MongoDbStats, MongoStatus } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import MeterList, { type MeterRow } from '@bo/components/kit/MeterList.vue'
import MongoCollections from './MongoCollections.vue'
import { formatBytes, formatCount, formatPercent, formatUptime } from '@bo/utils/units'
import '@bo/styles/kit.css'

interface DbRow extends MongoDbStats {
  key: string
  db: 'app' | number
}
const DB_COLUMNS: EkTableColumn[] = [
  { key: 'label', label: 'Veritabanı' },
  { key: 'collections', label: 'Koleksiyon', align: 'end' },
  { key: 'objects', label: 'Belge', align: 'end' },
  { key: 'dataSize', label: 'Veri boyutu', align: 'end' },
  { key: 'storageSize', label: 'Depolama', align: 'end' },
  { key: 'indexes', label: 'İndeks (adet · boyut)', align: 'end' },
]
const OPS: Array<[keyof NonNullable<MongoStatus['server']>['opcounters'], string]> = [
  ['query', 'Okuma (query)'],
  ['command', 'Komut'],
  ['update', 'Güncelleme'],
  ['insert', 'Ekleme'],
  ['getmore', 'Getmore'],
  ['delete', 'Silme'],
]

const res = useResource(() => api.call('BackofficeInfraService/getMongoStatus', {}))
onMounted(() => res.load())
const selectedKey = ref<string | null>(null)

const d = computed(() => res.data.value as MongoStatus)
const fill = computed(() => d.value?.server?.cache.fillRatio ?? 0)
const opRows = computed<MeterRow[]>(() => (d.value.server ? OPS.map(([k, label]) => ({ key: k, label, value: d.value.server!.opcounters[k], display: formatCount(d.value.server!.opcounters[k]) })) : []))
const dbRows = computed<DbRow[]>(() =>
  (d.value?.databases ?? []).map((x) => ({ ...x, key: x.scope === 'app' ? 'app' : String(x.tenantId), db: x.scope === 'app' ? 'app' : (x.tenantId as number) })),
)
const selected = computed(() => dbRows.value.find((r) => r.key === selectedKey.value) ?? null)
function pick(r: DbRow) {
  selectedKey.value = selectedKey.value === r.key ? null : r.key
}
</script>

<style scoped>
.bo-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}
.bo-mongo__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: var(--ek-space-4);
}
.bo-mongo__kv {
  margin-top: var(--ek-space-4);
}
.bo-mongo__pick {
  font-weight: var(--ek-font-weight-semibold);
}
.bo-mongo__pick[aria-pressed='true'] {
  color: var(--ek-color-action-emphasis);
  text-decoration: underline;
}
.bo-mongo__skipped {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}
</style>
