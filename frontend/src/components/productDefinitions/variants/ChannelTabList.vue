<!--
  DS-v2 A6a — varyant özellik panellerinde kanal seçimi (eski: ad/etiketi olmayan logo kutuları, fare ile tıklanan
  v-sheet). Dikey sekme listesi: kanal adı + kanal işareti (EkPlatformMark, renk tek başına anlam taşımaz),
  grup başlıkları (Pazaryeri / E-ticaret / ERP), ↑↓ Home End ile gezinme, Enter/Space seçer.
-->
<template>
  <div class="ctl" role="tablist" aria-orientation="vertical" :aria-label="label" @keydown="onKeydown">
    <template v-for="g in groups" :key="g.key">
      <div v-if="g.items.length" class="ctl__group" aria-hidden="true">{{ g.label }}</div>
      <button v-for="ch in g.items" :key="ch.code" ref="tabRefs" type="button" role="tab" class="ctl__tab"
        :class="{ 'is-on': ch.code === modelValue }" :aria-selected="ch.code === modelValue" :data-code="ch.code"
        :tabindex="ch.code === focusCode ? 0 : -1" @click="select(ch)">
        <EkPlatformMark :name="title(ch)" :code="ch.code" />
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue'
import { useIntegrationStore } from '@/stores/integrationStore'

const props = withDefaults(defineProps<{ modelValue?: string; label?: string }>(), { label: 'Kanallar' })
const emit = defineEmits<{ select: [channel: any] }>()
const integrationStore = useIntegrationStore()

const groups = computed(() => [
  { key: 'mp', label: 'Pazaryeri', items: (integrationStore.getClientMarketplaces() || []).filter((x: any) => x?.type?.code === 'marketplace') },
  { key: 'ec', label: 'E-ticaret', items: integrationStore.getClientECommerces() || [] },
  { key: 'erp', label: 'ERP', items: integrationStore.getClientErps() || [] },
])
const flat = computed(() => groups.value.flatMap((g) => g.items))
const focusCode = computed(() => props.modelValue || flat.value[0]?.code)
const title = (ch: any) => integrationStore.getIntegrationTitle(ch.code) || ch.title || ch.code
const tabRefs = ref<HTMLButtonElement[]>([])

function select(ch: any) { emit('select', ch) }
function onKeydown(e: KeyboardEvent) {
  const list = flat.value
  if (!list.length) return
  const i = Math.max(0, list.findIndex((x: any) => x.code === (document.activeElement as HTMLElement)?.dataset?.code))
  let next = -1
  if (e.key === 'ArrowDown') next = (i + 1) % list.length
  else if (e.key === 'ArrowUp') next = (i - 1 + list.length) % list.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = list.length - 1
  if (next < 0) return
  e.preventDefault()
  select(list[next])
  nextTick(() => tabRefs.value.find((b) => b.dataset.code === list[next].code)?.focus())
}
</script>

<style scoped>
.ctl { display: flex; flex-direction: column; gap: 2px; min-width: 168px; }
.ctl__group {
  margin: var(--ek-space-3) 0 var(--ek-space-1);
  padding: 0 var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}
.ctl__group:first-child { margin-top: 0; }
.ctl__tab {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0 var(--ek-space-3);
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-content-default);
  text-align: left;
  transition: var(--ek-transition-colors);
}
.ctl__tab:hover { background: var(--ek-color-surface-muted); }
.ctl__tab.is-on { background: var(--ek-color-action-subtle); color: var(--ek-color-action-emphasis); box-shadow: inset 3px 0 0 var(--ek-color-action); }
.ctl__tab:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
@media (max-width: 600px) {
  .ctl { flex-direction: row; overflow-x: auto; min-width: 0; }
  .ctl__group { display: none; }
  .ctl__tab { flex: 0 0 auto; }
}
@media (prefers-reduced-motion: reduce) { .ctl__tab { transition: none; } }
</style>
