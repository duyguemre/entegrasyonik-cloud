<!--
  frontend/src/components/page/ListCountDashboard.vue

  FE-LOCAL-1047 — özel istatistik ucu olmayan listelerin ORTAK "Özet" görünümü (Liste | Özet anahtarıyla listenin
  yerine açılır). Ekran yalnız GRUPLARI (ör. "Duruma göre", "Önceliğe göre") ve bir sayım işlevi verir; her hücrenin
  sayısı liste ucundan `limit: 1` ile alınır (bkz. `useStatusCounts`). Her grup: hücre şeridi (+ istenirse dağılım
  kartı). Hücre / satır tıklanınca `select(grup, anahtar)` → ekran listeyi süzer ve listeye döner.
-->
<template>
  <div class="lcd">
    <template v-for="g in loaded" :key="g.group.id">
      <ListDashSection :label="g.group.label">
        <ListSummaryStrip :cells="g.cells" :loading="g.counts.loading.value" :label="g.group.label" @select="(k) => emit('select', g.group.id, k)" />
      </ListDashSection>
      <ListDashSection v-if="g.group.distribution" :label="g.group.distribution.section ?? 'Dağılım'">
        <ListDistributionCard :title="g.group.distribution.title" :subtitle="g.group.distribution.subtitle" :icon="g.group.distribution.icon"
          :unit="unit" :rows="g.rows" :loading="g.counts.loading.value" clickable :empty-text="emptyText"
          @select="(k) => emit('select', g.group.id, k)" />
      </ListDashSection>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { EkTone } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import ListDashSection from './ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from './ListSummaryStrip.vue'
import ListDistributionCard, { type ListDistributionRow } from './ListDistributionCard.vue'
import { useStatusCounts } from './useStatusCounts'

export interface ListCountItem {
  key: string
  label: string
  icon: string
  tone: EkTone
  hint?: string
}

export interface ListCountGroup {
  id: string
  /** Bölüm başlığı ("Duruma göre talepler"). */
  label: string
  items: ListCountItem[]
  /** Verilirse grubun altında toplam + oran çubuğu kartı çizilir. */
  distribution?: { title: string; subtitle?: string; icon?: string; section?: string }
}

const props = withDefaults(
  defineProps<{
    groups: ListCountGroup[]
    /** Bir hücrenin kayıt sayısı (liste ucu, o süzmeyle, `limit: 1`); bilinmiyorsa null. */
    fetchCount: (groupId: string, key: string) => Promise<number | null>
    /** Listede uygulanmış süzme: grup → etkin anahtar. */
    active?: Record<string, string | null | undefined>
    /** Toplamın birimi ("talep", "kayıt" …). */
    unit?: string
    emptyText?: string
  }>(),
  { active: () => ({}), unit: 'kayıt', emptyText: 'Henüz kayıt yok.' },
)
const emit = defineEmits<{ select: [groupId: string, key: string] }>()

// Gruplar kurulumda sabitlenir (sayım durumu grup başına tutulur).
const states = props.groups.map((group) => ({
  group,
  counts: useStatusCounts(group.items.map((i) => i.key), (key) => props.fetchCount(group.id, key)),
}))

const loaded = computed(() =>
  states.map(({ group, counts }) => ({
    group,
    counts,
    cells: group.items.map((i): ListSummaryCell => {
      const n = counts.counts.value[i.key]
      return {
        key: i.key, label: i.label, hint: i.hint, icon: i.icon, tone: i.tone,
        value: n === null || n === undefined ? '—' : formatNumber(n), zero: !n, clickable: true, active: props.active[group.id] === i.key,
      }
    }),
    rows: group.items.map((i): ListDistributionRow => ({ key: i.key, label: i.label, count: counts.counts.value[i.key] ?? 0, tone: i.tone })),
  })),
)

const refresh = () => states.forEach((s) => s.counts.load())
onMounted(refresh)
defineExpose({ refresh })
</script>

<style scoped>
.lcd {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}
</style>
