<template>
  <div class="bo-stack">
    <BoSection id="bo-mongo" title="MongoDB" description="Sunucu sayaçları ve izinli veritabanlarının boyutu. Belge içeriği okunmaz." icon="mdi-database-outline">
      <template #actions>
        <EkRefreshButton quiet-success :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
      </template>
      <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="3" degraded-title="MongoDB okunamıyor" @retry="res.load()">
        <template v-if="res.data.value">
          <EkAlert v-if="!d.server" tone="info" title="Sunucu sayaçları için yetki yok" text="Uygulama kullanıcısı serverStatus okuyamıyor; bağlantı, işlem sayacı ve önbellek bilgisi gösterilemiyor. Veritabanı boyutları aşağıda yine de listelenir." />
          <BoTileGrid v-else :min="190" dense>
            <BoStat label="Sürüm" :value="d.server.version" :hint="`Çalışma süresi ${formatUptime(d.server.uptimeSeconds)}`" tone="info" />
            <BoStat label="Bağlantılar" :value="formatCount(d.server.connections.current)" :hint="`${formatCount(d.server.connections.available)} boşta`" :info="`Toplam açılan bağlantı: ${formatCount(d.server.connections.totalCreated)}`" />
            <BoStat label="WiredTiger önbelleği" :value="formatPercent(d.server.cache.fillRatio, 0)" :hint="`${formatBytes(d.server.cache.usedBytes)} / ${formatBytes(d.server.cache.maxBytes)}`" :tone="fill >= 0.95 ? 'warning' : 'success'" />
            <BoStat label="Havuzlar" :value="`${d.pools.appPoolSize} + ${d.pools.openTenantHandles}`" hint="uygulama + müşteri bağlantısı" info="Uygulama havuzu + açık müşteri bağlantısı" />
          </BoTileGrid>
        </template>
      </StateBlock>
    </BoSection>

    <template v-if="res.data.value && res.phase.value === 'ready'">
      <BoTileGrid v-if="d.server" :cols="2">
        <BoSection title="İşlem sayaçları" description="Sunucu başlangıcından beri" icon="mdi-counter" fill>
          <MeterList label="İşlem sayaçları" :rows="opRows" />
        </BoSection>
        <BoSection title="WiredTiger önbelleği" icon="mdi-memory" fill>
          <MeterList label="Önbellek doluluk oranı" :max="1" :rows="[{ key: 'fill', label: 'Dolu', value: fill, display: formatPercent(d.server.cache.fillRatio, 0), tone: fill >= 0.95 ? 'warning' : 'success' }]" />
          <dl class="bo-kv">
            <div><dt>Kullanılan</dt><dd>{{ formatBytes(d.server.cache.usedBytes) }}</dd></div>
            <div><dt>Üst sınır</dt><dd>{{ formatBytes(d.server.cache.maxBytes) }}</dd></div>
            <div><dt>Yazılmamış (dirty)</dt><dd>{{ formatBytes(d.server.cache.dirtyBytes) }}</dd></div>
          </dl>
        </BoSection>
      </BoTileGrid>

      <BoSection title="Veritabanları" description="Koleksiyonları görmek için bir satır seçin" icon="mdi-database-outline" flush>
        <BoDataTable :items="dbRows as unknown as Array<Record<string, unknown>>" :columns="DB_COLUMNS" row-key="key" label="Veritabanları">
          <template #cell-label="{ item }">
              <button v-if="item.available" type="button" class="bo-link-btn bo-mongo__pick" :aria-pressed="selectedKey === item.key" :data-db="item.key" @click="pick(item as unknown as DbRow)">{{ item.label }}</button>
              <span v-else class="bo-cell-stack"><span>{{ item.label }}</span><EkStatusChip tone="warning" label="Okunamadı" title="Bu veritabanının istatistiği alınamadı" /></span>
            </template>
            <template #cell-collections="{ item }"><span class="ek-num">{{ item.available ? formatCount(item.collections as number) : '—' }}</span></template>
            <template #cell-objects="{ item }"><span class="ek-num">{{ item.available ? formatCount(item.objects as number) : '—' }}</span></template>
            <template #cell-dataSize="{ item }"><span class="ek-num">{{ item.available ? formatBytes(item.dataSize as number) : '—' }}</span></template>
            <template #cell-storageSize="{ item }"><span class="ek-num">{{ item.available ? formatBytes(item.storageSize as number) : '—' }}</span></template>
            <template #cell-indexes="{ item }"><span class="ek-num">{{ item.available ? `${formatCount(item.indexes as number)} · ${formatBytes(item.indexSize as number)}` : '—' }}</span></template>
          </BoDataTable>
        <template v-if="d.skippedNotAllowlisted > 0" #footer>
          <p class="bo-mongo__skipped" data-testid="skipped">
            <v-icon icon="mdi-shield-lock-outline" size="small" aria-hidden="true" />
            {{ d.skippedNotAllowlisted }} veritabanı izinli listede olmadığı için okunmadı ve adı gösterilmez. Bu bilinçli bir güvenlik kısıtıdır.
          </p>
        </template>
      </BoSection>

      <MongoCollections v-if="selected" :key="selectedKey ?? ''" :db="selected.db" :title="selected.label" @close="selectedKey = null" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { EkAlert, EkRefreshButton, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { MongoDbStats, MongoStatus } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import BoDataTable from '@bo/components/r2/BoDataTable.vue'
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
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* BO-LOCAL-01 — seçili veritabanı: alt çizgi yerine eylem renginin açık tonunda köşeli etiket. */
.bo-mongo__pick {
  padding: 2px var(--ek-space-2);
  border: 1px solid transparent;
  border-radius: var(--ek-radius-md);
}

.bo-mongo__pick[aria-pressed='true'] {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  text-decoration: none;
}
</style>
