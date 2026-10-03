<!--
  frontend/src/components/ds/EkFormDialog.vue

  ADR-0015 Karar 3.8/6.1 — kısa form diyaloğu, TEK KAYNAK. ≤5 alan, 560px.
  Eylemler: Vazgeç · Kaydet, Enter gönderir, Esc kapatır (Vuetify `v-dialog`
  varsayılanı zaten Esc'i kapatır; Enter, sarmalayan `<form>` ile sağlanır).

  Kullanım:
    <EkFormDialog v-model="showDialog" title="Yeni marka" :loading="saving" @submit="handleSave">
      <v-text-field v-model="form.name" label="Marka adı" />
    </EkFormDialog>
-->
<template>
  <v-dialog v-model="isOpen" max-width="560">
    <v-card>
      <form @submit.prevent="emit('submit')">
        <v-card-title class="ek-form-dialog__title">{{ title }}</v-card-title>
        <v-card-text class="ek-form-dialog__body">
          <slot />
        </v-card-text>
        <v-card-actions class="ek-form-dialog__actions">
          <v-spacer />
          <v-btn variant="outlined" @click="onCancel">Vazgeç</v-btn>
          <v-btn type="submit" color="primary" :loading="loading">Kaydet</v-btn>
        </v-card-actions>
      </form>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    loading?: boolean
  }>(),
  {
    loading: false,
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

function onCancel() {
  emit('cancel')
  isOpen.value = false
}
</script>

<style scoped>
.ek-form-dialog__title {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-form-dialog__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-form-dialog__actions {
  padding: var(--ek-space-4);
}
</style>
