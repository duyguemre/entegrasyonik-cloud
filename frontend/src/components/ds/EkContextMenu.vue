<!--
  frontend/src/components/ds/EkContextMenu.vue

  DS-v2 — bağlam menüsü: tetikleyici (slot `activator`) + v-menu içinde
  `EkMenuPanel`. Açılınca odak ilk öğeye gider; seçim veya Esc menüyü
  kapatır ve odak tetikleyiciye döner (Vuetify v-menu).

    <EkContextMenu :groups="rowMenu" label="Sipariş işlemleri" @select="onAction">
      <template #activator="{ props }">
        <EkButton v-bind="props" tone="ghost" icon="mdi-dots-horizontal" icon-only aria-label="Sipariş işlemleri" />
      </template>
    </EkContextMenu>
-->
<template>
  <v-menu v-model="open" :location="location" :close-on-content-click="false" @update:model-value="onToggle" @after-leave="flushSelect">
    <template #activator="{ props: activatorProps }">
      <slot name="activator" :props="activatorProps" />
    </template>
    <EkMenuPanel ref="panelRef" :groups="groups" :label="label" :title="title" :description="description"
      @select="onSelect" @close="open = false" />
  </v-menu>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import EkMenuPanel, { type EkMenuGroup, type EkMenuItem } from './EkMenuPanel.vue'

withDefaults(
  defineProps<{
    groups: EkMenuGroup[]
    label: string
    location?: 'bottom end' | 'bottom start' | 'top end' | 'top start'
    /** İsteğe bağlı görünür menü başlığı (EkMenuPanel `title`/`description`). */
    title?: string
    description?: string
  }>(),
  { location: 'bottom end' },
)

const emit = defineEmits<{ select: [item: EkMenuItem] }>()
const open = ref(false)
const panelRef = ref<InstanceType<typeof EkMenuPanel> | null>(null)

function onToggle(value: boolean) {
  if (value) nextTick(() => panelRef.value?.focusFirst())
}

// Aşama 3: seçim menü KAPANDIKTAN sonra yayılır. v-menu kapanışta odağı tetikleyiciye geri verir; seçim bir
// diyalog açıyorsa (ör. tehlikeli onay) diyaloğun varsayılan odağı (Vazgeç) bu geri dönüşle çalınıyordu.
let pending: EkMenuItem | null = null
let fallback: ReturnType<typeof setTimeout> | undefined
function flushSelect() {
  if (fallback) clearTimeout(fallback)
  fallback = undefined
  const item = pending
  pending = null
  if (item) emit('select', item)
}

function onSelect(item: EkMenuItem) {
  pending = item
  open.value = false
  // Geçiş olayı gelmezse (reduced-motion vb.) seçim yine de yayılır.
  fallback = setTimeout(flushSelect, 400)
}
</script>
