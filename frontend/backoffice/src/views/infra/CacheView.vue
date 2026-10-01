<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="res.loadedAt.value ?? undefined" :stale="res.stale.value">
      <template #actions>
        <BoAction kind="refresh" :loading="res.refreshing.value || res.phase.value === 'loading'" data-page-refresh @click="res.load()" />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="3" error-title="Önbellek metrikleri okunamadı" degraded-title="Önbellek metrikleri okunamıyor" @retry="res.load()">
      <div v-if="res.data.value" class="bo-stack">
        <EkAlert tone="info" :title="`Bu değerler yalnız ${d.pod} podunu gösterir`" text="Önbellek pod-yereldir: yük dengeleyici isteği hangi poda düşürürse onun sayaçları görünür ve boşaltma yalnız o podu etkiler. Çok podlu ortamda her pod için yenileyip ayrıca boşaltın." data-testid="pod-band" />

        <BoTileGrid :min="176" dense>
          <BoStat label="İsabet oranı" :value="formatPercent(hitRatio)" :hint="hitRatio === null ? 'henüz ölçüm yok' : `${formatCount(d.hits)} isabet · ${formatCount(d.misses)} ıska`" :tone="hitRatio !== null && hitRatio < 0.8 ? 'warning' : 'success'" />
          <BoStat label="Anahtar" :value="formatCount(d.keys)" :hint="`üst sınır ${formatCount(d.maxKeys)}`" :info="`Doluluk ${formatPercent(d.maxKeys ? d.keys / d.maxKeys : null, 0)}`" tone="info" />
          <BoStat label="Yazma (set)" :value="formatCount(d.sets)" />
          <BoStat label="Tahliye" :value="formatCount(d.evictions)" :hint="d.evictions ? 'üst sınıra ulaşıldı' : 'sınır aşılmadı'" :tone="d.evictions ? 'warning' : 'success'" />
          <BoStat label="Devam eden yükleme" :value="formatCount(d.inflight)" />
        </BoTileGrid>

        <BoSection id="bo-cache-families" title="Önbellek aileleri" :description="`Pod ${d.pod}`" icon="mdi-lightning-bolt-outline" flush>
            <BoDataTable tabindex="0" :items="rows" :columns="COLUMNS" row-key="name" label="Önbellek aileleri" :phase="d.breakdown.length ? 'ready' : 'empty'" empty-title="Önbellekte aile yok" empty-message="Bu pod'un önbelleğinde henüz kayıt bulunmuyor.">
              <template #cell-name="{ item }"><code class="bo-code">{{ item.name }}</code></template>
              <template #cell-count="{ item }"><span class="ek-num">{{ formatCount(item.count as number) }}</span></template>
              <template #cell-hit="{ item }"><span class="ek-num">{{ formatCount(item.hit as number) }}</span></template>
              <template #cell-miss="{ item }"><span class="ek-num">{{ formatCount(item.miss as number) }}</span></template>
              <template #cell-hitRatio="{ item }">
                <EkStatusChip v-if="item.hitRatio !== null" :tone="(item.hitRatio as number) >= 0.8 ? 'success' : (item.hitRatio as number) >= 0.5 ? 'warning' : 'danger'" :label="formatPercent(item.hitRatio as number)" dot />
                <span v-else class="bo-muted">—</span>
              </template>
              <template #cell-actions="{ item }">
                <span class="bo-row-actions">
                  <BoAction kind="flush" label="Aileyi boşalt" icon-only size="sm" :aria-label="`${item.name} ailesini boşalt`" :title="`${item.name} ailesini boşalt`" data-testid="flush" @click="flush.open(String(item.name))" />
                </span>
              </template>
            </BoDataTable>
        </BoSection>

        <BoSection title="Toplam sayaçlar" :description="`Pod ${d.pod} · süreç başlangıcından beri`" icon="mdi-counter">
          <dl class="bo-kv">
            <div v-for="[k, label] in TOTAL_LABELS" :key="k"><dt>{{ label }}</dt><dd>{{ formatCount(d.totals[k]) }}</dd></div>
          </dl>
        </BoSection>
      </div>
    </StateBlock>

    <GuardedDialog
      :action="flush"
      title="Önbellek ailesi boşaltılsın mı?"
      :description="flush.context.value ? `${flush.context.value} · pod ${res.data.value?.pod ?? ''}` : ''"
      :items="['Aile içindeki tüm kayıtlar yalnız bu podun belleğinden silinir; diğer podlara dokunulmaz.', 'Sonraki istekler veriyi yeniden yükler; kısa süreli yavaşlama olabilir.', 'Gerekçe ve sonuç denetim kaydına yazılır.']"
      confirm-label="Aileyi boşalt"
      confirm-icon="mdi-broom"
      danger
    />
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { cacheVerdict } from './cacheVerdict'
import { computed, onMounted } from 'vue'
import { EkAlert, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { CacheMetrics } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import BoDataTable from '@bo/components/r2/BoDataTable.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import { notify } from '@bo/utils/toast'
import { formatCount, formatPercent } from '@bo/utils/units'
import '@bo/styles/kit.css'

const COLUMNS: EkTableColumn[] = [
  { key: 'name', label: 'Aile' },
  { key: 'count', label: 'Anahtar', align: 'end' },
  { key: 'hit', label: 'İsabet', align: 'end' },
  { key: 'miss', label: 'Iska', align: 'end' },
  { key: 'hitRatio', label: 'İsabet oranı' },
  { key: 'actions', label: '', type: 'actions' },
]
const TOTAL_LABELS: Array<[keyof CacheMetrics['totals'], string]> = [
  ['hit', 'İsabet'],
  ['miss', 'Iska'],
  ['set', 'Yazma'],
  ['error', 'Hata'],
  ['skip', 'Atlanan'],
  ['join', 'Birleşen yükleme'],
  ['evict', 'Tahliye'],
  ['invalidated', 'Geçersiz kılınan'],
]

const res = useResource(() => api.call('BackofficeInfraService/getCacheMetrics', {}))
onMounted(() => res.load())
const d = computed(() => res.data.value as CacheMetrics)
const hitRatio = computed(() => (d.value && d.value.hits + d.value.misses > 0 ? d.value.hits / (d.value.hits + d.value.misses) : null))
const verdict = computed(() =>
  res.phase.value === 'loading' && !res.data.value
    ? null
    : cacheVerdict({
        data: res.data.value,
        failed: !res.data.value,
        retry: () => res.load(),
        flush: (family) => flush.open(family),
      }),
)
const rows = computed(() => d.value.breakdown as unknown as Array<Record<string, unknown>>)

const flush = useGuardedAction(
  async (family: string, reason) => {
    try {
      return await api.call('BackofficeInfraService/flushCacheFamily', { family, reason })
    } catch (e) {
      // Bilinmeyen aile (başka bir işlemle kalkmış olabilir): güncel listeyi de getir.
      if ((e as { status?: number }).status === 404) void res.load()
      throw e
    }
  },
  (r) => {
    notify('success', `${r.removed} anahtar silindi (pod ${r.pod})`)
    void res.load()
  },
)
</script>

<style scoped>
.bo-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}
</style>
