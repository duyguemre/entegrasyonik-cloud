<!--
  BoTabs — SAYFA SEKMELERİ (BO2-70). Uzun sayfayı bölmenin birinci aracı. Ortak paketin `EkPageTabs` sunumu + URL eşlemesi
  (`?sekme=`; paylaşılan bağlantı aynı sekmeyi açar, varsayılan sekme URL'e yazılmaz). Sekme paneli yalnız etkin sekmeyi
  çizer (`v-if` — sayfa kendi panelini koşullu çizer ya da `#default="{ tab }"` yuvasını kullanır).

    <BoTabs v-model="tab" :tabs="TABS" label="Motor bölümleri" />            ← useTabQuery ile sayfada eşleme
    <BoTabs :tabs="TABS" query="sekme" fallback="kuyruklar" label="…" v-slot="{ tab }">…</BoTabs>
-->
<template>
  <div class="bo-tabs" data-bo-tabs>
    <EkPageTabs :model-value="current" :tabs="tabs" :label="label" @update:model-value="set" />
    <div v-if="$slots.default" class="bo-tabs__panel"><slot :tab="current" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkPageTabs, type EkPageTab } from '@entegrasyonik/ui/components'

const props = withDefaults(defineProps<{ tabs: EkPageTab[]; label: string; modelValue?: string; query?: string; fallback?: string }>(), { query: 'sekme' })
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
const route = useRoute()
const router = useRouter()

const fallbackValue = computed(() => props.fallback ?? String(props.tabs[0]?.value ?? ''))
const current = computed(() => {
  if (props.modelValue !== undefined) return props.modelValue
  const v = route.query[props.query]
  return typeof v === 'string' && props.tabs.some((t) => t.value === v) ? v : fallbackValue.value
})

function set(v: string | number) {
  const value = String(v)
  if (props.modelValue !== undefined) return emit('update:modelValue', value)
  void router.replace({ query: { ...route.query, [props.query]: value === fallbackValue.value ? undefined : value } })
}
</script>

<style scoped>
.bo-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}

.bo-tabs__panel {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}
</style>
