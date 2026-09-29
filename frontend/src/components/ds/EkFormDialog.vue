<!--
  frontend/src/components/ds/EkFormDialog.vue

  ADR-0015 Karar 3.8/6.1 — kısa form diyaloğu, TEK KAYNAK. DS-v2 (Aşama 2):
  `EkDialog` kabuğunu kullanır (başlık bandı + ikon kapsülü · içerik · eylem
  çubuğu). Eylemler: Vazgeç · Kaydet; gövde + eylemler `<form>` içindedir →
  Enter gönderir, Esc kapatır. Alanlar `EkFormGrid` ile dizilir (varsayılan
  tek kolon; `columns` ile 2).

  API geri uyumlu: `modelValue`, `title`, `loading`, `submit`/`cancel` olayları
  aynı. Yeni (isteğe bağlı): `description`, `icon`, `width`, `columns`,
  `submitLabel`, `submitIcon`, `submitDisabled`, `attach`.

  Kullanım:
    <EkFormDialog v-model="showDialog" title="Yeni marka" icon="mdi-tag-plus-outline" :loading="saving" @submit="handleSave">
      <v-text-field v-model="form.name" label="Marka adı" />
    </EkFormDialog>
-->
<template>
  <EkDialog
    v-model="isOpen"
    :title="title"
    :description="description"
    :icon="icon"
    :width="width"
    :attach="attach"
    :confirm-label="submitLabel"
    :confirm-icon="submitIcon"
    :confirm-loading="loading"
    :confirm-disabled="submitDisabled"
    as-form
    @confirm="emit('submit')"
    @cancel="emit('cancel')"
  >
    <EkFormGrid :columns="columns" class="ek-form-dialog__body">
      <slot />
    </EkFormGrid>
    <template v-if="$slots['actions-start']" #actions-start><slot name="actions-start" /></template>
  </EkDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkDialog from './EkDialog.vue'
import EkFormGrid from './EkFormGrid.vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    loading?: boolean
    description?: string
    icon?: string
    width?: 'sm' | 'md' | 'lg' | 'xl'
    columns?: 1 | 2 | 3 | 4
    submitLabel?: string
    submitIcon?: string
    submitDisabled?: boolean
    attach?: string | boolean | Element
  }>(),
  {
    loading: false,
    width: 'md',
    columns: 1,
    submitLabel: 'Kaydet',
    submitDisabled: false,
    attach: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: []
  cancel: []
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
</script>
