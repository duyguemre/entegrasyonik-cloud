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
  <v-menu v-model="open" :location="location" :close-on-content-click="false" @update:model-value="onToggle">
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

function onSelect(item: EkMenuItem) {
  emit('select', item)
  open.value = false
}
</script>
