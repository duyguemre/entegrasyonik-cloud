<template>
  <div class="bo-page">
    <div class="bo-page__head">
      <div>
        <h1 class="bo-page__title">Cache</h1>
        <p class="bo-page__lede">Uygulama içi bellek önbelleğinin isabet oranı ve aile bazında durumu. Ham anahtar ve müşteri numarası gösterilmez.</p>
      </div>
      <div class="bo-page__actions">
        <EkRefreshButton :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
      </div>
    </div>

    <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="3" error-title="Önbellek metrikleri okunamadı" degraded-title="Önbellek metrikleri okunamıyor" @retry="res.load()">
      <div v-if="res.data.value" class="bo-stack">
        <EkAlert tone="info" :title="`Bu değerler yalnız ${d.pod} podunu gösterir`" text="Önbellek pod-yereldir: yük dengeleyici isteği hangi poda düşürürse onun sayaçları görünür ve boşaltma yalnız o podu etkiler. Çok podlu ortamda her pod için yenileyip ayrıca boşaltın." data-testid="pod-band" />

        <div class="bo-cache__kpis">
          <EkMetricCard label="İsabet oranı" :value="formatPercent(hitRatio)" :description="hitRatio === null ? 'henüz ölçüm yok' : `${formatCount(d.hits)} isabet · ${formatCount(d.misses)} ıska`" icon="mdi-target" :tone="hitRatio !== null && hitRatio < 0.8 ? 'warning' : 'success'" />
          <EkMetricCard label="Anahtar" :value="formatCount(d.keys)" :description="`üst sınır ${formatCount(d.maxKeys)} · doluluk ${formatPercent(d.maxKeys ? d.keys / d.maxKeys : null, 0)}`" icon="mdi-key-outline" tone="info" />
          <EkMetricCard label="Yazma (set)" :value="formatCount(d.sets)" icon="mdi-content-save-outline" tone="neutral" />
          <EkMetricCard label="Tahliye" :value="formatCount(d.evictions)" :description="d.evictions ? 'üst sınıra ulaşıldı' : 'sınır aşılmadı'" icon="mdi-delete-sweep-outline" :tone="d.evictions ? 'warning' : 'success'" />
          <EkMetricCard label="Devam eden yükleme" :value="formatCount(d.inflight)" icon="mdi-progress-clock" tone="neutral" />
        </div>

        <EkCard title="Toplam sayaçlar" :subtitle="`Pod ${d.pod} · süreç başlangıcından beri`" icon="mdi-counter">
          <dl class="bo-kv">
            <div v-for="[k, label] in TOTAL_LABELS" :key="k"><dt>{{ label }}</dt><dd>{{ formatCount(d.totals[k]) }}</dd></div>
          </dl>
        </EkCard>

        <EkCard title="Önbellek aileleri" :subtitle="`Pod ${d.pod}`" icon="mdi-lightning-bolt-outline" flush>
          <EkEmptyState v-if="!d.breakdown.length" title="Önbellekte aile yok" message="Bu pod'un önbelleğinde henüz kayıt bulunmuyor." />
          <EkDataTable tabindex="0" v-else :items="rows" :columns="COLUMNS" row-key="name">
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
                <EkButton size="sm" tone="secondary" icon="mdi-broom" :aria-label="`${item.name} ailesini boşalt`" data-testid="flush" @click="flush.open(String(item.name))">Aileyi boşalt</EkButton>
              </span>
            </template>
          </EkDataTable>
        </EkCard>
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
import { computed, onMounted } from 'vue'
import { EkAlert, EkButton, EkCard, EkDataTable, EkEmptyState, EkMetricCard, EkRefreshButton, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { CacheMetrics } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
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
.bo-cache__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ek-space-4);
}
</style>
