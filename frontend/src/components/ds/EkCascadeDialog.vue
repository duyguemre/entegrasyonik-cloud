<!--
  frontend/src/components/ds/EkCascadeDialog.vue

  DS-v2 Aşama 2 — `EkCascadePicker`'ın modal sunumu (ör. pazaryeri kategori
  eşleştirme alanı "Kategori seç…"). Seçim diyalog içinde TASLAKTIR; yalnızca
  "Kategoriyi seç" ile onaylanır (`confirm` seçilen id yolunu yayar), Vazgeç/Esc
  taslağı atar. Genişlik 1040 (4 kolon), mobilde tam genişlik; kolon şeridi
  yatay kayar. `attach` verilirse yalnızca o çalışma alanı sekmesini örter.

    <EkCascadeDialog v-model="open" :nodes="tree" :path="selectedPath"
      title="Trendyol kategorisi seç" subtitle="2.946 yaprak kategori" @confirm="onPick" />
-->
<template>
  <v-dialog
    :model-value="modelValue"
    v-bind="tabOverlay.overlayProps.value"
    :content-props="{ id: contentId }"
    class="ek-dialog-overlay ek-cascade-dialog"
    content-class="ek-dialog-content ek-dialog-content--xl"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <EkCascadePicker
      v-model="draft"
      :nodes="nodes"
      :title="title"
      :subtitle="subtitle"
      :icon="icon"
      :root-label="rootLabel"
      :search-placeholder="searchPlaceholder"
      :selectable-branches="selectableBranches"
      closable
      class="ek-cascade-dialog__picker"
      @close="emit('update:modelValue', false)"
    >
      <template #actions="{ leafChosen }">
        <EkButton tone="secondary" @click="emit('update:modelValue', false)">Vazgeç</EkButton>
        <EkButton tone="primary" icon="mdi-check" :disabled="!leafChosen" @click="confirm">{{ confirmLabel }}</EkButton>
      </template>
    </EkCascadePicker>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, toRef, useId, watch } from 'vue'
import { useTabOverlay } from '@/composables/useTabScope'
import EkCascadePicker, { type EkCascadeNode } from './EkCascadePicker.vue'
import EkButton from './EkButton.vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    nodes: EkCascadeNode[]
    path?: string[]
    title: string
    subtitle?: string
    icon?: string
    rootLabel?: string
    searchPlaceholder?: string
    confirmLabel?: string
    selectableBranches?: boolean
    attach?: string | boolean | Element
  }>(),
  {
    path: () => [],
    icon: 'mdi-file-tree-outline',
    rootLabel: 'Ana kategoriler',
    searchPlaceholder: 'Kategori ara…',
    confirmLabel: 'Kategoriyi seç',
    selectableBranches: false,
    attach: false,
  },
)

const emit = defineEmits<{ 'update:modelValue': [open: boolean]; confirm: [path: string[]] }>()

const draft = ref<string[]>([...props.path])
const contentId = `ek-cascade-dialog-${useId()}`
// Aşama 6b (Standart 7): sekme kabına bağlanır; Esc/perde kapanışı sekme içi.
const tabOverlay = useTabOverlay({
  open: toRef(props, 'modelValue'),
  attach: toRef(props, 'attach'),
  persistent: computed(() => false),
  close: () => emit('update:modelValue', false),
  contentId,
})

// Her açılışta taslak, onaylanmış seçimden başlar.
watch(
  () => props.modelValue,
  (open) => {
    if (open) draft.value = [...props.path]
  },
)

function confirm() {
  emit('confirm', [...draft.value])
  emit('update:modelValue', false)
}
</script>

<style src="./ek-dialog-overlay.css"></style>

<style scoped>
.ek-cascade-dialog__picker {
  height: min(620px, calc(100vh - 96px));
}
</style>
