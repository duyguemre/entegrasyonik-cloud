<!--
  frontend/src/components/productDefinitions/definitions/DefinitionGroupsDashboard.vue

  FE-LOCAL-1052 — Seçenek grupları ve Etiketler ekranlarının ORTAK "Özet" görünümü (Liste | Özet anahtarıyla listenin
  yerine açılır). Liste zaten tamamı bellekte olduğu için sayılar o veriden hesaplanır (ek istek yok, tahmin yok).
    1) Özet şeridi — ekranın verdiği hücreler (toplam grup, toplam değer …)
    2) Gruplara göre dağılım — grup başına değer sayısı; satıra tıklayınca liste o gruba süzülü açılır
-->
<template>
  <div class="dgd">
    <ListDashSection label="Özet">
      <ListSummaryStrip :cells="cells" :loading="loading" label="Özet" />
    </ListDashSection>
    <ListDashSection :label="`Gruplara göre ${valueNoun}`">
      <ListDistributionCard :title="`${groupNoun} dağılımı`" :subtitle="`Her gruptaki ${valueNoun} sayısı — gruba tıklayınca listede açılır`" :icon="icon"
        :unit="valueNoun" :rows="rows" :loading="loading" clickable :empty-text="emptyText" @select="(key) => emit('select', key)" />
    </ListDashSection>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EkTone } from '@entegrasyonik/ui/components'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import ListDistributionCard, { type ListDistributionRow } from '@/components/page/ListDistributionCard.vue'

const props = withDefaults(
  defineProps<{
    cells: ListSummaryCell[]
    /** Gruplar: `key` listede aranacak metin (grup adı), `count` gruptaki değer sayısı. */
    groups: Array<{ key: string; label: string; count: number }>
    /** "Seçenek grubu" / "Etiket grubu". */
    groupNoun: string
    /** "seçenek" / "etiket". */
    valueNoun: string
    icon?: string
    loading?: boolean
    emptyText?: string
  }>(),
  { icon: 'mdi-shape-outline', loading: false, emptyText: 'Henüz grup yok.' },
)
const emit = defineEmits<{ select: [key: string] }>()

// Dağılım çubuğunda gruplar sırayla ton alır (anlam taşımaz; yalnız ayırt edici — ad ve sayı her satırda yazılı).
const TONES: EkTone[] = ['action', 'info', 'success', 'warning', 'error', 'neutral']
const rows = computed<ListDistributionRow[]>(() =>
  [...props.groups].sort((a, b) => b.count - a.count).map((g, i) => ({ key: g.key, label: g.label, count: g.count, tone: TONES[i % TONES.length] })),
)
</script>

<style scoped>
.dgd {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}
</style>
