<template>
  <div class="bo-stack">
    <BoSection id="bo-redis" title="Redis" description="Yalnız INFO, SCAN ve SLOWLOG okunur. Anahtar aileleri örneklemeyle bulunur; ham anahtar adı gösterilmez." icon="mdi-memory">
      <template #actions>
        <EkRefreshButton quiet-success :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
      </template>
      <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="3" degraded-title="Redis okunamıyor" @retry="res.load()">
        <BoTileGrid v-if="res.data.value" :min="176" dense>
          <BoStat label="Sürüm" :value="d.server.version ?? '—'" :hint="`Çalışma süresi ${formatUptime(d.server.uptimeSeconds)}`" tone="info" />
          <BoStat label="Bellek" :value="formatBytes(d.memory.usedBytes)" :hint="d.memory.maxBytes ? `sınır ${formatBytes(d.memory.maxBytes)}` : 'sınırsız'" :tone="memTone" />
          <BoStat label="İşlem / sn" :value="formatCount(d.stats.opsPerSec)" />
          <BoStat label="İsabet oranı" :value="formatPercent(hitRatio)" :hint="hitRatio === null ? 'henüz ölçüm yok' : 'isabet ÷ (isabet + ıska)'" :tone="hitRatio !== null && hitRatio < 0.8 ? 'warning' : 'success'" />
          <BoStat label="İstemciler" :value="formatCount(d.clients.connected)" :hint="`${formatCount(d.clients.blocked)} engelli`" />
        </BoTileGrid>
      </StateBlock>
    </BoSection>

    <template v-if="res.data.value && res.phase.value === 'ready'">
      <BoTileGrid :cols="2">
        <BoSection title="Bellek kullanımı" icon="mdi-memory" fill>
          <MeterList v-if="d.memory.maxBytes && d.memory.usedBytes !== null" label="Bellek kullanımı" :max="d.memory.maxBytes" :rows="memRows" />
          <p v-else class="bo-muted bo-redis__note">Bellek sınırı tanımlı değil (sınırsız); oran hesaplanamaz. Kullanılan: {{ formatBytes(d.memory.usedBytes) }}, tepe: {{ formatBytes(d.memory.peakBytes) }}.</p>
          <dl class="bo-kv">
            <div><dt>Kullanılan / tepe</dt><dd>{{ formatBytes(d.memory.usedBytes) }} / {{ formatBytes(d.memory.peakBytes) }}</dd></div>
            <div><dt>Parçalanma oranı</dt><dd class="ek-num">{{ formatRatio(d.memory.fragmentationRatio) }}</dd></div>
            <div><dt>Tahliye politikası</dt><dd>{{ d.memory.evictionPolicy ?? '—' }}</dd></div>
            <div><dt>Süresi dolan / tahliye edilen</dt><dd>{{ formatCount(d.stats.expiredKeys) }} / {{ formatCount(d.stats.evictedKeys) }}</dd></div>
            <div><dt>İsabet / ıska</dt><dd>{{ formatCount(d.stats.keyspaceHits) }} / {{ formatCount(d.stats.keyspaceMisses) }}</dd></div>
          </dl>
        </BoSection>

        <BoSection title="Anahtar aileleri" icon="mdi-key-chain-variant" fill>
          <EkAlert v-if="d.keyFamilies.truncated" tone="info" dense title="Sayılar örnektir" :text="`Örnekleme ${formatCount(d.keyFamilies.sampled)} anahtarda durdu; gerçek sayılar daha yüksek olabilir.`" />
          <MeterList v-if="d.keyFamilies.items.length" label="Anahtar aileleri" :rows="familyRows" />
          <p v-else class="bo-muted bo-redis__note">Örneklemede anahtar bulunmadı.</p>
          <ul v-if="d.keyspace.length" class="bo-redis__ks" aria-label="Keyspace">
            <li v-for="k in d.keyspace" :key="k.db"><code class="bo-code">{{ k.db }}</code> <span class="ek-num">{{ formatCount(k.keys) }} anahtar · {{ formatCount(k.expires) }} süreli</span></li>
          </ul>
          <template #footer>
            <span class="bo-redis__foot">Toplam {{ formatCount(d.keyFamilies.sampled) }} anahtar örneklendi{{ d.keyFamilies.truncated ? ' (örnek)' : '' }}. Aile, anahtarın ilk bölümüdür.</span>
          </template>
        </BoSection>
      </BoTileGrid>

      <BoSection title="Yavaş komutlar (slowlog)" description="Yalnız komut adı ve süre; argüman kaydedilmez" icon="mdi-timer-alert-outline" flush>
        <BoDataTable :items="slowRows" :columns="SLOW_COLUMNS" row-key="i" label="Yavaş komutlar" :phase="d.slowlog.length ? 'ready' : 'empty'" empty-title="Yavaş komut yok" empty-message="Slowlog eşiğini aşan komut kaydı bulunmuyor.">
          <template #cell-command="{ item }"><code class="bo-code">{{ item.command }}</code></template>
          <template #cell-duration="{ item }"><span class="ek-num">{{ micros(item.durationMicros as number) }}</span></template>
          <template #cell-at="{ item }"><span class="bo-cell-stack"><span>{{ formatRelative(item.at as string) }}</span><span class="ek-num">{{ formatDateTime(item.at as string) }}</span></span></template>
        </BoDataTable>
      </BoSection>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { EkAlert, EkRefreshButton, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { RedisStatus } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import BoDataTable from '@bo/components/r2/BoDataTable.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import MeterList, { type MeterRow } from '@bo/components/kit/MeterList.vue'
import { formatDateTime, formatRelative } from '@bo/utils/format'
import { formatBytes, formatCount, formatDuration, formatPercent, formatUptime } from '@bo/utils/units'
import '@bo/styles/kit.css'

// Parçalanma oranı (ör. 1,23): tr-TR ondalık virgül, en çok 2 hane; yoksa "—".
const ratioFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })
const formatRatio = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : ratioFormat.format(v))

const SLOW_COLUMNS: EkTableColumn[] = [
  { key: 'command', label: 'Komut' },
  { key: 'duration', label: 'Süre', align: 'end' },
  { key: 'at', label: 'Zaman' },
]
const res = useResource(() => api.call('BackofficeInfraService/getRedisStatus', {}))
onMounted(() => res.load())

const d = computed(() => res.data.value as RedisStatus)
const hitRatio = computed(() => {
  const h = d.value?.stats.keyspaceHits
  const m = d.value?.stats.keyspaceMisses
  if (h === null || h === undefined || m === null || m === undefined || h + m === 0) return null
  return h / (h + m)
})
const memRatio = computed(() => (d.value?.memory.maxBytes && d.value.memory.usedBytes !== null ? d.value.memory.usedBytes! / d.value.memory.maxBytes : null))
const memTone = computed(() => (memRatio.value === null ? 'neutral' : memRatio.value >= 0.9 ? 'critical' : memRatio.value >= 0.75 ? 'warning' : 'success'))
const memRows = computed<MeterRow[]>(() => {
  const m = d.value.memory
  const tone = memRatio.value !== null && memRatio.value >= 0.9 ? 'danger' : memRatio.value !== null && memRatio.value >= 0.75 ? 'warning' : 'success'
  return [
    { key: 'used', label: 'Kullanılan', value: m.usedBytes ?? 0, display: `${formatBytes(m.usedBytes)} · ${formatPercent(memRatio.value)}`, tone },
    ...(m.peakBytes !== null ? [{ key: 'peak', label: 'Tepe', value: m.peakBytes, display: formatBytes(m.peakBytes), tone: 'neutral' as const }] : []),
  ]
})
const familyRows = computed<MeterRow[]>(() => d.value.keyFamilies.items.map((f) => ({ key: f.family, label: f.family, value: f.count, display: formatCount(f.count) })))
const slowRows = computed(() => d.value.slowlog.map((s, i) => ({ ...s, i })) as unknown as Array<Record<string, unknown>>)
const micros = (us: number) => (us < 1000 ? `${us} µs` : formatDuration(us / 1000))
</script>

<style scoped>
.bo-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}
.bo-redis__note {
  margin: 0 0 var(--ek-space-3);
  font-size: var(--ek-type-label-size);
}
.bo-redis__ks {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  margin: var(--ek-space-3) 0 0;
  padding: 0;
  list-style: none;
  font-size: var(--ek-type-label-size);
}
.bo-redis__foot {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

/* BO-LOCAL-01 — keyspace satırları: üstte ince çizgiyle ayrılan sakin liste. */
.bo-redis__ks {
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}
</style>
